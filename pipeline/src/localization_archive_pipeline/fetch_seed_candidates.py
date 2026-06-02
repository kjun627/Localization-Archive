from __future__ import annotations

import argparse
import json
from pathlib import Path

from localization_archive_pipeline.clients import OpenAlexClient
from localization_archive_pipeline.config import get_paths
from localization_archive_pipeline.env import load_dotenv, require_env
from localization_archive_pipeline.venue_filters import decide_venue


DEFAULT_QUERY = "3D visual localization absolute camera pose estimation"


def parser() -> argparse.ArgumentParser:
    argument_parser = argparse.ArgumentParser(description="Fetch candidate papers for seed expansion.")
    argument_parser.add_argument("--query", default=DEFAULT_QUERY)
    argument_parser.add_argument("--limit", type=int, default=20)
    argument_parser.add_argument(
        "--output",
        default="data/generated/seed_candidates.json",
        help="Output JSON path relative to repository root.",
    )
    return argument_parser


def build_candidates(query: str, limit: int) -> list[dict[str, object]]:
    paths = get_paths()
    load_dotenv(paths.root / ".env")
    client = OpenAlexClient(api_key=require_env("OPENALEX_API_KEY"))
    works = client.search_works(query=query, per_page=limit)

    candidates: list[dict[str, object]] = []
    for work in works:
        primary_location = work.get("primary_location") or {}
        source = primary_location.get("source") or {}
        venue_name = source.get("display_name") or work.get("host_venue", {}).get("display_name") or "Unknown venue"
        publication_type = "journal" if source.get("type") == "journal" else "conference"
        venue_decision = decide_venue(venue_name, publication_type)
        candidates.append(
            {
                "openalex_id": work.get("id"),
                "title": work.get("display_name"),
                "year": work.get("publication_year"),
                "venue": venue_name,
                "venue_type": publication_type,
                "venue_decision": {
                    "included": venue_decision.included,
                    "tier": venue_decision.tier,
                    "reason": venue_decision.reason,
                },
                "citation_count": work.get("cited_by_count"),
                "doi": work.get("doi"),
            }
        )
    return candidates


def main() -> int:
    args = parser().parse_args()
    paths = get_paths()
    output_path = paths.root / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "query": args.query,
        "candidates": build_candidates(query=args.query, limit=args.limit),
    }
    output_path.write_text(json.dumps(payload, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(payload['candidates'])} seed candidates to {output_path.relative_to(paths.root)}")
    return 0

