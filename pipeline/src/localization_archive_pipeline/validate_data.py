from __future__ import annotations

from localization_archive_pipeline.build_graph import load_curated_papers, load_seed_metadata
from localization_archive_pipeline.venue_filters import decide_venue


def main() -> int:
    seeds = load_seed_metadata()
    curated = load_curated_papers()

    curated_ids = {record.paper_id for record in curated}
    included_ids = {paper_id for paper_id, paper in seeds.items() if paper.get("included")}

    missing_curation = sorted(included_ids - curated_ids)
    stray_curation = sorted(curated_ids - included_ids)

    if missing_curation:
        raise SystemExit(f"Included seeds missing curation files: {', '.join(missing_curation)}")
    if stray_curation:
        raise SystemExit(f"Curation files exist for non-included seeds: {', '.join(stray_curation)}")

    for record in curated:
        decision = decide_venue(record.venue, record.venue_type)
        if not decision.included:
            raise SystemExit(
                f"Venue filter rejected {record.paper_id} ({record.venue}): {decision.reason}"
            )

    print(f"Validated {len(curated)} curated papers with venue filters.")
    return 0
