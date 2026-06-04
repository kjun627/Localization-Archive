from __future__ import annotations

import argparse
import json
import os
import re
import time
import urllib.parse
from dataclasses import dataclass
from typing import Any

from localization_archive_pipeline.audit_citations import (
    OPENALEX_SELECT,
    choose_candidate as choose_openalex_candidate,
    normalize_title,
    title_score,
)
from localization_archive_pipeline.build_graph import load_curated_papers
from localization_archive_pipeline.clients import (
    SEMANTIC_SCHOLAR_PAPER_FIELDS,
    SEMANTIC_SCHOLAR_REFERENCE_FIELDS,
    SEMANTIC_SCHOLAR_SEARCH_FIELDS,
    OpenAlexClient,
    SemanticScholarClient,
)
from localization_archive_pipeline.config import get_paths
from localization_archive_pipeline.env import get_env, load_dotenv
from localization_archive_pipeline.models import PaperRecord


PROVIDER = "Semantic Scholar Academic Graph"
DEFAULT_OUTPUT = "data/generated/citation_candidates.json"
ARXIV_NEW_RE = re.compile(r"\b\d{4}\.\d{4,5}(?:v\d+)?\b", re.IGNORECASE)
ARXIV_OLD_RE = re.compile(r"\b[a-z][a-z.-]+/\d{7}(?:v\d+)?\b", re.IGNORECASE)
DOI_RE = re.compile(r"\b10\.\d{4,9}/[^\s\"<>]+", re.IGNORECASE)


@dataclass(frozen=True)
class ResolvedSemanticPaper:
    paper_id: str
    title: str
    year: int
    semantic_scholar_id: str
    semantic_scholar_title: str
    semantic_scholar_year: int | None
    title_score: float
    resolve_method: str
    identifier: str | None
    external_ids: dict[str, Any]


@dataclass(frozen=True)
class SemanticReferences:
    by_source: dict[str, dict[str, dict[str, Any]]]
    reference_counts: dict[str, int]
    unavailable: list[dict[str, Any]]


def parser() -> argparse.ArgumentParser:
    argument_parser = argparse.ArgumentParser(
        description=(
            "Suggest internal archive citation candidates from Semantic Scholar references."
        )
    )
    argument_parser.add_argument(
        "--paper-id",
        action="append",
        help="Suggest citations only for the given archive paper id. Can be passed more than once.",
    )
    argument_parser.add_argument(
        "--max-papers",
        type=int,
        help="Suggest citations only for the first N selected papers. Useful for smoke tests.",
    )
    argument_parser.add_argument(
        "--min-title-score",
        type=float,
        default=0.92,
        help="Minimum normalized title similarity required to trust a title-search match.",
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
        default=DEFAULT_OUTPUT,
        help="Candidate JSON output path relative to the repository root.",
    )
    return argument_parser


def extract_arxiv_id(value: str) -> str | None:
    if not value:
        return None

    decoded = urllib.parse.unquote(value).strip()
    parsed = urllib.parse.urlparse(decoded)
    if parsed.netloc.lower().endswith("arxiv.org"):
        parts = [part for part in parsed.path.split("/") if part]
        if len(parts) >= 2 and parts[0].lower() in {"abs", "pdf"}:
            return strip_arxiv_version(parts[1].removesuffix(".pdf"))

    for pattern in (ARXIV_NEW_RE, ARXIV_OLD_RE):
        match = pattern.search(decoded)
        if match:
            return strip_arxiv_version(match.group(0).removesuffix(".pdf"))
    return None


def strip_arxiv_version(arxiv_id: str) -> str:
    return re.sub(r"v\d+$", "", arxiv_id, flags=re.IGNORECASE)


def extract_doi(value: str) -> str | None:
    if not value:
        return None

    decoded = urllib.parse.unquote(value).strip()
    parsed = urllib.parse.urlparse(decoded)
    if parsed.netloc.lower().endswith("doi.org") and parsed.path.strip("/"):
        return clean_doi(parsed.path.strip("/"))

    if decoded.lower().startswith("doi:"):
        return clean_doi(decoded[4:])

    match = DOI_RE.search(decoded)
    if not match:
        return None
    return clean_doi(match.group(0))


def clean_doi(value: str) -> str:
    doi = value.strip()
    doi = re.sub(r"^https?://(?:dx\.)?doi\.org/", "", doi, flags=re.IGNORECASE)
    doi = doi.split("#", 1)[0].split("?", 1)[0]
    return doi.rstrip(".,;")


def semantic_scholar_identifiers(record: PaperRecord) -> list[str]:
    arxiv_identifiers: list[str] = []
    doi_identifiers: list[str] = []

    for link in record.source_links:
        url = link.get("url", "")
        arxiv_id = extract_arxiv_id(url)
        if arxiv_id:
            arxiv_identifiers.append(f"arXiv:{arxiv_id}")

        doi = extract_doi(url)
        if doi:
            doi_identifiers.append(f"DOI:{doi}")

    return dedupe(arxiv_identifiers + doi_identifiers)


def dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    deduped: list[str] = []
    for value in values:
        key = value.lower()
        if key in seen:
            continue
        seen.add(key)
        deduped.append(value)
    return deduped


def choose_semantic_candidate(
    record: PaperRecord,
    papers: list[dict[str, Any]],
    min_title_score: float,
) -> tuple[dict[str, Any] | None, dict[str, Any] | None]:
    candidates: list[tuple[float, int, dict[str, Any]]] = []
    for paper in papers:
        score = title_score(record.title, paper.get("title") or "")
        year = paper.get("year")
        year_distance = year_distance_from_record(record, year)
        candidates.append((score, year_distance, paper))

    if not candidates:
        return None, None

    score, year_distance, best = sorted(candidates, key=lambda item: (-item[0], item[1]))[0]
    year = best.get("year")
    if year is None:
        acceptable = score >= 0.97
    else:
        acceptable = score >= min_title_score and year_distance <= 1

    if not acceptable:
        return None, closest_candidate_payload(best, score)
    return best, None


def year_distance_from_record(record: PaperRecord, year: Any) -> int:
    if year is None:
        return 999
    try:
        return abs(int(year) - record.year)
    except (TypeError, ValueError):
        return 999


def closest_candidate_payload(paper: dict[str, Any], score: float) -> dict[str, Any]:
    return {
        "bestTitle": paper.get("title"),
        "bestYear": paper.get("year"),
        "bestScore": round(score, 4),
        "bestSemanticScholarId": paper.get("paperId"),
    }


def resolve_semantic_papers(
    records: list[PaperRecord],
    client: SemanticScholarClient,
    min_title_score: float,
) -> tuple[dict[str, ResolvedSemanticPaper], list[dict[str, Any]]]:
    resolved: dict[str, ResolvedSemanticPaper] = {}
    unresolved: list[dict[str, Any]] = []

    for record in records:
        errors: list[dict[str, str]] = []
        for identifier in semantic_scholar_identifiers(record):
            try:
                paper = client.get_paper(identifier, fields=SEMANTIC_SCHOLAR_PAPER_FIELDS)
            except Exception as error:  # noqa: BLE001 - keep batch reports moving.
                errors.append({"identifier": identifier, "error": str(error)})
                continue

            if paper.get("paperId"):
                resolved[record.paper_id] = resolved_semantic_paper(
                    record=record,
                    paper=paper,
                    resolve_method=identifier_method(identifier),
                    identifier=identifier,
                )
                break

        if record.paper_id in resolved:
            continue

        try:
            candidates = client.search_papers(
                record.title,
                limit=5,
                fields=SEMANTIC_SCHOLAR_SEARCH_FIELDS,
            )
        except Exception as error:  # noqa: BLE001 - keep batch reports moving.
            unresolved.append(
                {
                    "paperId": record.paper_id,
                    "title": record.title,
                    "year": record.year,
                    "reason": "semantic_scholar_search_failed",
                    "errors": errors + [{"method": "title_search", "error": str(error)}],
                }
            )
            continue

        match, closest = choose_semantic_candidate(record, candidates, min_title_score)
        if match and match.get("paperId"):
            resolved[record.paper_id] = resolved_semantic_paper(
                record=record,
                paper=match,
                resolve_method="title_search",
                identifier=None,
            )
        else:
            unresolved.append(
                {
                    "paperId": record.paper_id,
                    "title": record.title,
                    "year": record.year,
                    "reason": "no_trusted_semantic_scholar_match",
                    "closest": closest,
                    "errors": errors,
                }
            )

    return resolved, unresolved


def identifier_method(identifier: str) -> str:
    lowered = identifier.lower()
    if lowered.startswith("arxiv:"):
        return "arxiv"
    if lowered.startswith("doi:"):
        return "doi"
    return "paper_id"


def resolved_semantic_paper(
    record: PaperRecord,
    paper: dict[str, Any],
    resolve_method: str,
    identifier: str | None,
) -> ResolvedSemanticPaper:
    return ResolvedSemanticPaper(
        paper_id=record.paper_id,
        title=record.title,
        year=record.year,
        semantic_scholar_id=paper["paperId"],
        semantic_scholar_title=paper.get("title") or "",
        semantic_scholar_year=paper.get("year"),
        title_score=title_score(record.title, paper.get("title") or ""),
        resolve_method=resolve_method,
        identifier=identifier,
        external_ids=paper.get("externalIds") or {},
    )


def collect_semantic_references(
    records: list[PaperRecord],
    resolved: dict[str, ResolvedSemanticPaper],
    client: SemanticScholarClient,
) -> SemanticReferences:
    records_by_id = {record.paper_id: record for record in records}
    archive_by_semantic_id = {
        item.semantic_scholar_id: item.paper_id for item in resolved.values()
    }
    by_source: dict[str, dict[str, dict[str, Any]]] = {}
    reference_counts: dict[str, int] = {}
    unavailable: list[dict[str, Any]] = []

    for source in records:
        resolved_source = resolved.get(source.paper_id)
        if not resolved_source:
            continue

        internal_references: dict[str, dict[str, Any]] = {}
        reference_count = 0
        try:
            references = client.iter_references(
                resolved_source.semantic_scholar_id,
                fields=SEMANTIC_SCHOLAR_REFERENCE_FIELDS,
                limit=100,
            )
            for reference_index, reference in enumerate(references):
                reference_count += 1
                cited_paper = reference.get("citedPaper") or {}
                cited_semantic_id = cited_paper.get("paperId")
                target_id = archive_by_semantic_id.get(cited_semantic_id)
                if not target_id or target_id == source.paper_id:
                    continue
                target = records_by_id[target_id]
                if target.year > source.year:
                    continue
                internal_references.setdefault(
                    target_id,
                    semantic_reference_evidence(
                        source=source,
                        target=target,
                        source_resolution=resolved_source,
                        target_resolution=resolved[target_id],
                        cited_paper=cited_paper,
                        reference_index=reference_index,
                    ),
                )
        except Exception as error:  # noqa: BLE001 - auxiliary report should continue.
            unavailable.append(
                {
                    "source": source.paper_id,
                    "sourceTitle": source.title,
                    "semanticScholarId": resolved_source.semantic_scholar_id,
                    "reason": "semantic_scholar_references_unavailable",
                    "error": str(error),
                    "recordedCitationCount": len(source.citations),
                }
            )

        reference_counts[source.paper_id] = reference_count
        by_source[source.paper_id] = internal_references

    return SemanticReferences(
        by_source=by_source,
        reference_counts=reference_counts,
        unavailable=unavailable,
    )


def semantic_reference_evidence(
    source: PaperRecord,
    target: PaperRecord,
    source_resolution: ResolvedSemanticPaper,
    target_resolution: ResolvedSemanticPaper,
    cited_paper: dict[str, Any],
    reference_index: int,
) -> dict[str, Any]:
    return {
        "status": "found_in_references",
        "sourceSemanticScholarId": source_resolution.semantic_scholar_id,
        "targetSemanticScholarId": target_resolution.semantic_scholar_id,
        "sourceResolveMethod": source_resolution.resolve_method,
        "targetResolveMethod": target_resolution.resolve_method,
        "referenceIndex": reference_index,
        "referenceTitle": cited_paper.get("title") or target.title,
        "referenceYear": cited_paper.get("year") or target.year,
        "referenceExternalIds": cited_paper.get("externalIds") or {},
    }


def resolve_openalex_papers(
    records: list[PaperRecord],
    client: OpenAlexClient,
    min_title_score: float,
    sleep_seconds: float = 0.2,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    resolved: dict[str, Any] = {}
    unresolved: list[dict[str, Any]] = []

    for index, record in enumerate(records):
        if index:
            time.sleep(sleep_seconds)
        try:
            works = client.search_works(
                query=record.title,
                per_page=5,
                select=OPENALEX_SELECT,
            )
            match, closest = choose_openalex_candidate(record, works, min_title_score)
        except Exception as error:  # noqa: BLE001 - OpenAlex is only auxiliary here.
            unresolved.append(
                {
                    "paperId": record.paper_id,
                    "title": record.title,
                    "reason": "openalex_search_failed",
                    "error": str(error),
                }
            )
            continue

        if match:
            resolved[record.paper_id] = match
        else:
            unresolved.append(
                {
                    "paperId": record.paper_id,
                    "title": record.title,
                    "reason": "no_trusted_openalex_match",
                    "closest": closest,
                }
            )

    return resolved, unresolved


def build_citation_payload(
    records: list[PaperRecord],
    semantic_resolved: dict[str, ResolvedSemanticPaper],
    semantic_unresolved: list[dict[str, Any]],
    semantic_references: SemanticReferences,
    openalex_resolved: dict[str, Any],
    openalex_unresolved: list[dict[str, Any]],
    api_key_used: bool,
) -> dict[str, Any]:
    records_by_id = {record.paper_id: record for record in records}
    unavailable_sources = {item["source"] for item in semantic_references.unavailable}
    missing_archive_citations: list[dict[str, Any]] = []
    confirmed_recorded_citations: list[dict[str, Any]] = []
    unconfirmed_recorded_citations: list[dict[str, Any]] = []

    for source in records:
        recorded_targets = set(source.citations)
        semantic_targets = semantic_references.by_source.get(source.paper_id, {})

        for target_id, evidence in sorted(semantic_targets.items()):
            if target_id not in recorded_targets:
                target = records_by_id[target_id]
                missing_archive_citations.append(
                    edge_payload(
                        source=source,
                        target=target,
                        semantic_scholar_evidence=evidence,
                        openalex_status=openalex_status(
                            source.paper_id, target.paper_id, openalex_resolved
                        ),
                    )
                )

        for target_id in sorted(recorded_targets):
            target = records_by_id.get(target_id)
            if target is None:
                continue
            evidence = semantic_targets.get(target_id)
            if evidence:
                confirmed_recorded_citations.append(
                    edge_payload(
                        source=source,
                        target=target,
                        semantic_scholar_evidence=evidence,
                        openalex_status=openalex_status(
                            source.paper_id, target.paper_id, openalex_resolved
                        ),
                    )
                )
            else:
                unconfirmed_recorded_citations.append(
                    edge_payload(
                        source=source,
                        target=target,
                        semantic_scholar_evidence=semantic_absence_evidence(
                            source=source,
                            target=target,
                            semantic_resolved=semantic_resolved,
                            unavailable_sources=unavailable_sources,
                        ),
                        openalex_status=openalex_status(
                            source.paper_id, target.paper_id, openalex_resolved
                        ),
                    )
                )

    return {
        "provider": PROVIDER,
        "apiKeyUsed": api_key_used,
        "resolvedCount": len(semantic_resolved),
        "unresolvedCount": len(semantic_unresolved),
        "referencesUnavailableCount": len(semantic_references.unavailable),
        "missingArchiveCitationCount": len(missing_archive_citations),
        "unconfirmedRecordedCitationCount": len(unconfirmed_recorded_citations),
        "confirmedRecordedCitationCount": len(confirmed_recorded_citations),
        "openAlexResolvedCount": len(openalex_resolved),
        "openAlexUnresolvedCount": len(openalex_unresolved),
        "resolved": [
            resolved_payload(
                item,
                semantic_references.reference_counts.get(item.paper_id, 0),
            )
            for item in sorted(semantic_resolved.values(), key=lambda paper: paper.paper_id)
        ],
        "unresolved": semantic_unresolved,
        "referencesUnavailable": semantic_references.unavailable,
        "openAlexUnresolved": openalex_unresolved,
        "missingArchiveCitations": missing_archive_citations,
        "unconfirmedRecordedCitations": unconfirmed_recorded_citations,
        "confirmedRecordedCitations": confirmed_recorded_citations,
    }


def edge_payload(
    source: PaperRecord,
    target: PaperRecord,
    semantic_scholar_evidence: dict[str, Any],
    openalex_status: str,
) -> dict[str, Any]:
    return {
        "source": source.paper_id,
        "target": target.paper_id,
        "sourceTitle": source.title,
        "targetTitle": target.title,
        "semanticScholarEvidence": semantic_scholar_evidence,
        "openAlexStatus": openalex_status,
    }


def semantic_absence_evidence(
    source: PaperRecord,
    target: PaperRecord,
    semantic_resolved: dict[str, ResolvedSemanticPaper],
    unavailable_sources: set[str],
) -> dict[str, Any]:
    source_resolution = semantic_resolved.get(source.paper_id)
    target_resolution = semantic_resolved.get(target.paper_id)

    if source_resolution is None:
        status = "source_unresolved"
    elif target_resolution is None:
        status = "target_unresolved"
    elif source.paper_id in unavailable_sources:
        status = "references_unavailable"
    else:
        status = "not_found_in_references"

    return {
        "status": status,
        "sourceSemanticScholarId": source_resolution.semantic_scholar_id
        if source_resolution
        else None,
        "targetSemanticScholarId": target_resolution.semantic_scholar_id
        if target_resolution
        else None,
    }


def openalex_status(
    source_id: str,
    target_id: str,
    openalex_resolved: dict[str, Any],
) -> str:
    source = openalex_resolved.get(source_id)
    target = openalex_resolved.get(target_id)
    if source is None or target is None or not source.referenced_works:
        return "openalex_unavailable"
    if target.openalex_id in source.referenced_works:
        return "confirmed_by_openalex"
    return "not_found_in_openalex"


def resolved_payload(
    item: ResolvedSemanticPaper,
    reference_count: int,
) -> dict[str, Any]:
    return {
        "paperId": item.paper_id,
        "title": item.title,
        "year": item.year,
        "semanticScholarId": item.semantic_scholar_id,
        "semanticScholarTitle": item.semantic_scholar_title,
        "semanticScholarYear": item.semantic_scholar_year,
        "titleScore": round(item.title_score, 4),
        "resolveMethod": item.resolve_method,
        "identifier": item.identifier,
        "externalIds": item.external_ids,
        "referenceCount": reference_count,
    }


def generate_citation_candidates(
    records: list[PaperRecord],
    semantic_client: SemanticScholarClient,
    min_title_score: float,
    openalex_client: OpenAlexClient | None = None,
) -> dict[str, Any]:
    semantic_resolved, semantic_unresolved = resolve_semantic_papers(
        records=records,
        client=semantic_client,
        min_title_score=min_title_score,
    )
    semantic_references = collect_semantic_references(
        records=records,
        resolved=semantic_resolved,
        client=semantic_client,
    )
    openalex_resolved: dict[str, Any] = {}
    openalex_unresolved: list[dict[str, Any]] = []
    if openalex_client:
        openalex_resolved, openalex_unresolved = resolve_openalex_papers(
            records=records,
            client=openalex_client,
            min_title_score=min_title_score,
        )

    return build_citation_payload(
        records=records,
        semantic_resolved=semantic_resolved,
        semantic_unresolved=semantic_unresolved,
        semantic_references=semantic_references,
        openalex_resolved=openalex_resolved,
        openalex_unresolved=openalex_unresolved,
        api_key_used=bool(semantic_client.api_key),
    )


def select_records(
    records: list[PaperRecord],
    paper_ids: list[str] | None,
    max_papers: int | None,
) -> list[PaperRecord]:
    if paper_ids:
        selected_ids = set(paper_ids)
        records = [record for record in records if record.paper_id in selected_ids]
        missing_ids = sorted(selected_ids - {record.paper_id for record in records})
        if missing_ids:
            raise SystemExit(f"Unknown paper id(s): {', '.join(missing_ids)}")
    if max_papers is not None:
        records = records[:max_papers]
    return records


def main() -> int:
    args = parser().parse_args()
    paths = get_paths()
    load_dotenv(paths.root / ".env")

    records = select_records(
        records=load_curated_papers(),
        paper_ids=args.paper_id,
        max_papers=args.max_papers,
    )
    semantic_client = SemanticScholarClient(
        api_key=None,
        sleep_seconds=args.sleep,
    )
    openalex_client = OpenAlexClient(
        api_key=get_env("OPENALEX_API_KEY"),
        mailto=get_env("OPENALEX_MAILTO") or "localization-archive@example.com",
    )

    payload = generate_citation_candidates(
        records=records,
        semantic_client=semantic_client,
        min_title_score=args.min_title_score,
        openalex_client=openalex_client,
    )

    output_path = paths.root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")

    print(
        "Citation candidates: "
        f"{payload['resolvedCount']}/{len(records)} resolved, "
        f"{payload['missingArchiveCitationCount']} missing archive citations, "
        f"{payload['confirmedRecordedCitationCount']} confirmed recorded citations, "
        f"{payload['unconfirmedRecordedCitationCount']} unconfirmed recorded citations, "
        f"{payload['referencesUnavailableCount']} unavailable reference lists."
    )
    print(f"Wrote {os.path.relpath(output_path, paths.root)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
