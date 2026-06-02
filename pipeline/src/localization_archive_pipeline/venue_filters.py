from __future__ import annotations

import csv
from dataclasses import dataclass
from pathlib import Path

from localization_archive_pipeline.config import get_paths


@dataclass(frozen=True)
class VenueDecision:
    included: bool
    venue_key: str | None
    normalized_name: str
    tier: str | None
    reason: str


def normalize_venue_name(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else " " for ch in value)
    return " ".join(cleaned.split())


def load_reference_rows(path: Path) -> list[dict[str, str]]:
    with path.open("r", encoding="utf-8") as handle:
        return list(csv.DictReader(handle))


def decide_venue(venue_name: str, venue_type: str) -> VenueDecision:
    paths = get_paths()
    normalized_name = normalize_venue_name(venue_name)

    if venue_type == "conference":
        rows = load_reference_rows(paths.core_conferences)
        for row in rows:
            candidates = [row["venue_name"], row["acronym"], row["venue_key"]]
            if any(normalized_name == normalize_venue_name(candidate) for candidate in candidates):
                tier = row["core_rank"]
                return VenueDecision(
                    included=tier in {"A*", "A"},
                    venue_key=row["venue_key"],
                    normalized_name=normalized_name,
                    tier=tier,
                    reason=f"CORE {tier}",
                )
        return VenueDecision(False, None, normalized_name, None, "No CORE rank match")

    if venue_type == "journal":
        rows = load_reference_rows(paths.sjr_journals)
        for row in rows:
            candidates = [row["journal_name"], row["venue_key"], row["issn"]]
            if any(normalized_name == normalize_venue_name(candidate) for candidate in candidates):
                tier = row["quartile"]
                return VenueDecision(
                    included=tier in {"Q1", "Q2"},
                    venue_key=row["venue_key"],
                    normalized_name=normalized_name,
                    tier=tier,
                    reason=f"SJR {tier}",
                )
        return VenueDecision(False, None, normalized_name, None, "No SJR quartile match")

    return VenueDecision(False, None, normalized_name, None, f"Unsupported venue type: {venue_type}")
