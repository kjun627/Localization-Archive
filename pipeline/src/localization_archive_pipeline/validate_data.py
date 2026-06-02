from __future__ import annotations

from localization_archive_pipeline.build_graph import load_curated_papers, load_seed_metadata
from localization_archive_pipeline.venue_filters import decide_venue


def main() -> int:
    seeds = load_seed_metadata()
    curated = load_curated_papers()

    curated_ids = {record.paper_id for record in curated}
    included_ids = {paper_id for paper_id, paper in seeds.items() if paper.get("included")}
    curated_by_id = {record.paper_id: record for record in curated}

    missing_curation = sorted(included_ids - curated_ids)
    stray_curation = sorted(curated_ids - included_ids)

    if missing_curation:
        raise SystemExit(f"Included seeds missing curation files: {', '.join(missing_curation)}")
    if stray_curation:
        raise SystemExit(f"Curation files exist for non-included seeds: {', '.join(stray_curation)}")

    citation_errors: list[str] = []
    for paper_id, seed in seeds.items():
        if not seed.get("included"):
            continue
        citations = seed.get("citations", []) or []
        seen: set[str] = set()
        for cited_id in citations:
            if cited_id in seen:
                citation_errors.append(f"{paper_id} cites {cited_id} more than once")
            seen.add(cited_id)
            if cited_id == paper_id:
                citation_errors.append(f"{paper_id} cites itself")
            if cited_id not in included_ids:
                citation_errors.append(f"{paper_id} cites non-included or missing seed {cited_id}")
            if cited_id not in curated_ids:
                citation_errors.append(f"{paper_id} cites {cited_id}, but that target has no curation file")
            source_year = seed.get("year")
            target_year = seeds.get(cited_id, {}).get("year")
            if source_year is not None and target_year is not None and int(target_year) > int(source_year):
                citation_errors.append(
                    f"{paper_id} ({source_year}) cites future paper {cited_id} ({target_year})"
                )

    if citation_errors:
        raise SystemExit("Citation validation failed:\n- " + "\n- ".join(citation_errors))

    for record in curated:
        decision = decide_venue(record.venue, record.venue_type)
        if not decision.included:
            raise SystemExit(
                f"Venue filter rejected {record.paper_id} ({record.venue}): {decision.reason}"
            )

        for cited_id in seeds[record.paper_id].get("citations", []) or []:
            cited = curated_by_id.get(cited_id)
            if cited and cited.year > record.year:
                raise SystemExit(
                    f"Citation validation failed: {record.paper_id} ({record.year}) cites future paper {cited_id} ({cited.year})"
                )

    print(f"Validated {len(curated)} curated papers with venue filters and citation integrity.")
    return 0
