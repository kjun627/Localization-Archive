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
from localization_archive_pipeline.clients import OpenAlexClient, SemanticScholarClient
from localization_archive_pipeline.config import get_paths
from localization_archive_pipeline.env import get_env, load_dotenv
from localization_archive_pipeline.models import PaperRecord


OPENALEX_SELECT = "id,display_name,publication_year,referenced_works,doi"
DEFAULT_AUDIT_OUTPUT = "data/generated/citation_audit.json"
DEFAULT_INCREMENTAL_AUDIT_OUTPUT = "data/generated/citation_audit_incremental.json"
DEFAULT_PROVIDER_CACHE = "data/reference/citation_provider_cache.json"


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
        description=(
            "Audit curated citation edges against Semantic Scholar references, "
            "with OpenAlex used as corroborating evidence."
        )
    )
    argument_parser.add_argument(
        "--paper-id",
        action="append",
        help=(
            "Audit the given archive paper id against the full archive. "
            "Can be passed more than once."
        ),
    )
    argument_parser.add_argument(
        "--max-papers",
        type=int,
        help="Audit only the first N source papers. Useful for smoke tests.",
    )
    argument_parser.add_argument(
        "--min-title-score",
        type=float,
        default=0.92,
        help="Minimum normalized title similarity required to trust provider matches.",
    )
    argument_parser.add_argument(
        "--sleep",
        type=float,
        help=(
            "Delay between Semantic Scholar requests. Defaults to 3.5s without an API key "
            "and 1.1s with one."
        ),
    )
    argument_parser.add_argument(
        "--output",
        default=DEFAULT_AUDIT_OUTPUT,
        help="Audit JSON output path relative to the repository root.",
    )
    argument_parser.add_argument(
        "--cache",
        default=DEFAULT_PROVIDER_CACHE,
        help="Provider cache JSON used to reuse Semantic Scholar and OpenAlex ids.",
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
    recorded_issue_count = payload.get(
        "recordedMismatchCount",
        payload.get("unconfirmedRecordedCitationCount", 0),
    )
    unconfirmed_count = payload.get("unconfirmedRecordedCitationCount", recorded_issue_count)
    missing_count = payload.get("missingArchiveCitationCount", 0)
    unresolved_count = payload.get("unresolvedCount", 0)
    references_unavailable_count = payload.get("referencesUnavailableCount", 0)
    openalex_unresolved_count = payload.get("openAlexUnresolvedCount", 0)

    if fail_on == "none":
        return False
    if fail_on == "recorded":
        return bool(recorded_issue_count)
    if fail_on == "missing":
        return bool(missing_count)
    if fail_on == "confirmed":
        return bool(recorded_issue_count or missing_count or unconfirmed_count)
    return bool(
        recorded_issue_count
        or unconfirmed_count
        or missing_count
        or unresolved_count
        or references_unavailable_count
        or openalex_unresolved_count
    )


def main() -> int:
    args = parser().parse_args()
    paths = get_paths()
    load_dotenv(paths.root / ".env")
    from localization_archive_pipeline.suggest_citations import (
        generate_citation_candidates,
        load_cached_openalex_resolutions,
        load_cached_semantic_resolutions,
        save_provider_cache,
    )

    all_records = load_curated_papers()
    source_records = all_records
    if args.paper_id:
        selected_ids = set(args.paper_id)
        source_records = [
            record for record in all_records if record.paper_id in selected_ids
        ]
        missing_ids = sorted(selected_ids - {record.paper_id for record in source_records})
        if missing_ids:
            raise SystemExit(f"Unknown paper id(s): {', '.join(missing_ids)}")
    if args.max_papers is not None:
        source_records = source_records[: args.max_papers]
    incremental = bool(args.paper_id or args.max_papers is not None)
    cache_path = paths.root / args.cache
    cached_semantic_resolved = load_cached_semantic_resolutions(all_records, cache_path)
    cached_openalex_resolved = load_cached_openalex_resolutions(all_records, cache_path)

    semantic_client = SemanticScholarClient(
        api_key=get_env("SEMANTIC_SCHOLAR_API_KEY"),
        sleep_seconds=args.sleep,
    )
    openalex_client = OpenAlexClient(
        api_key=get_env("OPENALEX_API_KEY"),
        mailto=get_env("OPENALEX_MAILTO") or "localization-archive@example.com",
    )
    payload = generate_citation_candidates(
        records=all_records,
        semantic_client=semantic_client,
        min_title_score=args.min_title_score,
        openalex_client=openalex_client,
        source_records=source_records,
        include_incoming=incremental,
        cached_semantic_resolved=cached_semantic_resolved,
        cached_openalex_resolved=cached_openalex_resolved,
        resolve_all_missing_semantic=not incremental,
        resolve_all_missing_openalex=not incremental or not cached_openalex_resolved,
    )

    output = (
        DEFAULT_INCREMENTAL_AUDIT_OUTPUT
        if incremental and args.output == DEFAULT_AUDIT_OUTPUT
        else args.output
    )
    output_path = paths.root / output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    save_provider_cache(payload, cache_path, merge_existing=True)

    print(
        "Citation audit: "
        f"{len(source_records)} source paper(s), "
        f"{payload['resolvedCount']}/{len(all_records)} Semantic Scholar resolved, "
        f"{payload['openAlexResolvedCount']}/{len(all_records)} OpenAlex resolved, "
        f"{payload['missingArchiveCitationCount']} missing archive citations, "
        f"{payload['unconfirmedRecordedCitationCount']} unconfirmed recorded citations, "
        f"{payload['confirmedRecordedCitationCount']} confirmed recorded citations, "
        f"{payload['referencesUnavailableCount']} unavailable reference lists, "
        f"{payload['unresolvedCount']} unresolved."
    )
    print(f"Wrote {os.path.relpath(output_path, paths.root)}")
    print(f"Updated {os.path.relpath(cache_path, paths.root)}")

    return 1 if should_fail(payload, args.fail_on) else 0


if __name__ == "__main__":
    raise SystemExit(main())
