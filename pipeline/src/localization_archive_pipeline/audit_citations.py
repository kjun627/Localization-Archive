from __future__ import annotations

import argparse
import json
import os
import time
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path
from typing import Any

from localization_archive_pipeline.build_graph import load_curated_papers
from localization_archive_pipeline.clients import OpenAlexClient
from localization_archive_pipeline.config import get_paths
from localization_archive_pipeline.env import get_env, load_dotenv
from localization_archive_pipeline.models import PaperRecord


OPENALEX_SELECT = "id,display_name,publication_year,referenced_works,doi"


@dataclass(frozen=True)
class ResolvedPaper:
    paper_id: str
    title: str
    year: int
    openalex_id: str
    openalex_title: str
    openalex_year: int | None
    title_score: float
    referenced_works: set[str]


def parser() -> argparse.ArgumentParser:
    argument_parser = argparse.ArgumentParser(
        description="Audit curated citation edges against OpenAlex references."
    )
    argument_parser.add_argument(
        "--paper-id",
        action="append",
        help="Audit only the given archive paper id. Can be passed more than once.",
    )
    argument_parser.add_argument(
        "--max-papers",
        type=int,
        help="Audit only the first N selected papers. Useful for smoke tests.",
    )
    argument_parser.add_argument(
        "--min-title-score",
        type=float,
        default=0.92,
        help="Minimum normalized title similarity required to trust an OpenAlex match.",
    )
    argument_parser.add_argument(
        "--sleep",
        type=float,
        default=0.2,
        help="Delay between OpenAlex requests in seconds.",
    )
    argument_parser.add_argument(
        "--output",
        default="data/generated/citation_audit.json",
        help="Audit JSON output path relative to the repository root.",
    )
    argument_parser.add_argument(
        "--fail-on",
        choices=["none", "recorded", "missing", "confirmed", "any"],
        default="confirmed",
        help="Choose which issue categories should produce a non-zero exit code.",
    )
    return argument_parser


def normalize_title(value: str) -> str:
    return " ".join(
        "".join(ch.lower() if ch.isalnum() else " " for ch in value).split()
    )


def title_score(left: str, right: str) -> float:
    normalized_left = normalize_title(left)
    normalized_right = normalize_title(right)
    if not normalized_left or not normalized_right:
        return 0.0
    if normalized_left == normalized_right:
        return 1.0
    return SequenceMatcher(None, normalized_left, normalized_right).ratio()


def choose_candidate(
    record: PaperRecord,
    works: list[dict[str, Any]],
    min_title_score: float,
) -> tuple[ResolvedPaper | None, dict[str, Any] | None]:
    candidates: list[tuple[float, int, dict[str, Any]]] = []
    for work in works:
        score = title_score(record.title, work.get("display_name") or "")
        year = work.get("publication_year")
        year_distance = abs(int(year) - record.year) if year else 999
        candidates.append((score, year_distance, work))

    if not candidates:
        return None, None

    score, year_distance, best = sorted(candidates, key=lambda item: (-item[0], item[1]))[0]
    if score < min_title_score:
        return None, {
            "bestTitle": best.get("display_name"),
            "bestYear": best.get("publication_year"),
            "bestScore": round(score, 4),
        }

    return (
        ResolvedPaper(
            paper_id=record.paper_id,
            title=record.title,
            year=record.year,
            openalex_id=best["id"],
            openalex_title=best.get("display_name") or "",
            openalex_year=best.get("publication_year"),
            title_score=score,
            referenced_works=set(best.get("referenced_works") or []),
        ),
        None,
    )


def resolve_papers(
    records: list[PaperRecord],
    client: OpenAlexClient,
    min_title_score: float,
    sleep_seconds: float,
) -> tuple[dict[str, ResolvedPaper], list[dict[str, Any]]]:
    resolved: dict[str, ResolvedPaper] = {}
    unresolved: list[dict[str, Any]] = []

    for index, record in enumerate(records):
        if index:
            time.sleep(sleep_seconds)
        works = client.search_works(
            query=record.title,
            per_page=5,
            select=OPENALEX_SELECT,
        )
        match, closest = choose_candidate(record, works, min_title_score)
        if match:
            resolved[record.paper_id] = match
        else:
            unresolved.append(
                {
                    "paperId": record.paper_id,
                    "title": record.title,
                    "year": record.year,
                    "closest": closest,
                }
            )

    return resolved, unresolved


def build_audit_payload(
    records: list[PaperRecord],
    resolved: dict[str, ResolvedPaper],
    unresolved: list[dict[str, Any]],
) -> dict[str, Any]:
    records_by_id = {record.paper_id: record for record in records}
    recorded_mismatches: list[dict[str, Any]] = []
    missing_archive_citations: list[dict[str, Any]] = []
    references_unavailable: list[dict[str, Any]] = []

    for source in records:
        resolved_source = resolved.get(source.paper_id)
        if not resolved_source:
            continue
        if not resolved_source.referenced_works:
            references_unavailable.append(
                {
                    "source": source.paper_id,
                    "sourceTitle": source.title,
                    "reason": "OpenAlex matched the paper but returned no referenced_works",
                    "recordedCitationCount": len(source.citations),
                }
            )
            continue

        recorded_targets = set(source.citations)
        for target_id in sorted(recorded_targets):
            target = records_by_id.get(target_id)
            resolved_target = resolved.get(target_id)
            if not target or not resolved_target:
                continue
            if resolved_target.openalex_id not in resolved_source.referenced_works:
                recorded_mismatches.append(
                    {
                        "source": source.paper_id,
                        "sourceTitle": source.title,
                        "target": target_id,
                        "targetTitle": target.title,
                        "reason": "recorded citation not found in OpenAlex referenced_works",
                    }
                )

        for target in records:
            if target.paper_id == source.paper_id:
                continue
            if target.year > source.year:
                continue
            if target.paper_id in recorded_targets:
                continue
            resolved_target = resolved.get(target.paper_id)
            if not resolved_target:
                continue
            if resolved_target.openalex_id in resolved_source.referenced_works:
                missing_archive_citations.append(
                    {
                        "source": source.paper_id,
                        "sourceTitle": source.title,
                        "target": target.paper_id,
                        "targetTitle": target.title,
                        "reason": "OpenAlex reference points to archived paper but seeds.yaml omits it",
                    }
                )

    return {
        "provider": "OpenAlex",
        "resolvedCount": len(resolved),
        "unresolvedCount": len(unresolved),
        "referencesUnavailableCount": len(references_unavailable),
        "unconfirmedRecordedCitationCount": sum(
            item["recordedCitationCount"] for item in references_unavailable
        )
        + sum(
            len(records_by_id[item["paperId"]].citations)
            for item in unresolved
            if item["paperId"] in records_by_id
        ),
        "recordedMismatchCount": len(recorded_mismatches),
        "missingArchiveCitationCount": len(missing_archive_citations),
        "unresolved": unresolved,
        "referencesUnavailable": references_unavailable,
        "recordedMismatches": recorded_mismatches,
        "missingArchiveCitations": missing_archive_citations,
        "resolved": [
            {
                "paperId": item.paper_id,
                "title": item.title,
                "year": item.year,
                "openalexId": item.openalex_id,
                "openalexTitle": item.openalex_title,
                "openalexYear": item.openalex_year,
                "titleScore": round(item.title_score, 4),
                "referenceCount": len(item.referenced_works),
            }
            for item in sorted(resolved.values(), key=lambda paper: paper.paper_id)
        ],
    }


def should_fail(payload: dict[str, Any], fail_on: str) -> bool:
    if fail_on == "none":
        return False
    if fail_on == "recorded":
        return bool(payload["recordedMismatchCount"])
    if fail_on == "missing":
        return bool(payload["missingArchiveCitationCount"])
    if fail_on == "confirmed":
        return bool(
            payload["recordedMismatchCount"]
            or payload["missingArchiveCitationCount"]
            or payload["unconfirmedRecordedCitationCount"]
        )
    return bool(
        payload["recordedMismatchCount"]
        or payload["missingArchiveCitationCount"]
        or payload["unresolvedCount"]
        or payload["referencesUnavailableCount"]
    )


def main() -> int:
    args = parser().parse_args()
    paths = get_paths()
    load_dotenv(paths.root / ".env")

    records = load_curated_papers()
    if args.paper_id:
        selected_ids = set(args.paper_id)
        records = [record for record in records if record.paper_id in selected_ids]
        missing_ids = sorted(selected_ids - {record.paper_id for record in records})
        if missing_ids:
            raise SystemExit(f"Unknown paper id(s): {', '.join(missing_ids)}")
    if args.max_papers is not None:
        records = records[: args.max_papers]

    client = OpenAlexClient(
        api_key=get_env("OPENALEX_API_KEY"),
        mailto=get_env("OPENALEX_MAILTO") or "localization-archive@example.com",
    )
    resolved, unresolved = resolve_papers(
        records=records,
        client=client,
        min_title_score=args.min_title_score,
        sleep_seconds=args.sleep,
    )
    payload = build_audit_payload(records, resolved, unresolved)

    output_path = paths.root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(
        "Citation audit: "
        f"{payload['resolvedCount']}/{len(records)} resolved, "
        f"{payload['recordedMismatchCount']} recorded mismatches, "
        f"{payload['missingArchiveCitationCount']} missing archive citations, "
        f"{payload['unconfirmedRecordedCitationCount']} unconfirmed recorded citations, "
        f"{payload['referencesUnavailableCount']} unavailable reference lists, "
        f"{payload['unresolvedCount']} unresolved."
    )
    print(f"Wrote {os.path.relpath(output_path, paths.root)}")

    return 1 if should_fail(payload, args.fail_on) else 0


if __name__ == "__main__":
    raise SystemExit(main())
