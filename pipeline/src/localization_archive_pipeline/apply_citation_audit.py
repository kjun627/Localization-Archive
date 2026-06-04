from __future__ import annotations

import argparse
import json
import os
from pathlib import Path
from typing import Any

import yaml

from localization_archive_pipeline.config import get_paths


DEFAULT_AUDIT = "data/generated/citation_audit.json"


def parser() -> argparse.ArgumentParser:
    argument_parser = argparse.ArgumentParser(
        description="Apply missing archive citation edges from an audit JSON to data/seeds.yaml."
    )
    argument_parser.add_argument(
        "--audit",
        default=DEFAULT_AUDIT,
        help="Audit JSON path relative to the repository root.",
    )
    argument_parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print the number of additions without writing data/seeds.yaml.",
    )
    return argument_parser


def load_yaml(path: Path) -> dict[str, Any]:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle) or {}


def citation_additions(audit_payload: dict[str, Any], paper_ids: set[str]) -> dict[str, set[str]]:
    additions: dict[str, set[str]] = {}
    for item in audit_payload.get("missingArchiveCitations", []):
        source = item.get("source")
        target = item.get("target")
        evidence = item.get("semanticScholarEvidence") or {}
        if source not in paper_ids or target not in paper_ids or source == target:
            continue
        if evidence.get("status") not in {"found_in_references", "found_in_citations"}:
            continue
        additions.setdefault(source, set()).add(target)
    return additions


def apply_additions(seeds: dict[str, Any], additions: dict[str, set[str]]) -> int:
    papers = seeds.get("papers") or []
    papers_by_id = {paper["id"]: paper for paper in papers}
    sort_key = {
        paper["id"]: (int(paper.get("year") or 0), paper["id"]) for paper in papers
    }
    added = 0

    for source_id, target_ids in additions.items():
        source = papers_by_id[source_id]
        current = list(source.get("citations") or [])
        merged = set(current)
        before = len(merged)
        merged.update(target_ids)
        added += len(merged) - before
        source["citations"] = sorted(
            merged,
            key=lambda paper_id: sort_key.get(paper_id, (9999, paper_id)),
        )

    return added


def format_value(value: Any) -> str:
    if isinstance(value, bool):
        return "true" if value else "false"
    if isinstance(value, int):
        return str(value)
    return json.dumps(str(value), ensure_ascii=False)


def format_paper_value(key: str, value: Any) -> str:
    if key in {"id", "title"}:
        return format_value(value)
    if isinstance(value, bool) or isinstance(value, int):
        return format_value(value)
    return str(value)


def format_inline_list(values: list[Any]) -> str:
    return "[" + ", ".join(format_value(value) for value in values) + "]"


def seeds_yaml(seeds: dict[str, Any]) -> str:
    lines = [
        f"domain: {seeds.get('domain', '')}",
        "selection_rules:",
        "  conferences:",
        "    allowed_core_ranks: "
        + format_inline_list(
            seeds.get("selection_rules", {})
            .get("conferences", {})
            .get("allowed_core_ranks", [])
        ),
        "  journals:",
        "    allowed_sjr_quartiles: "
        + format_inline_list(
            seeds.get("selection_rules", {})
            .get("journals", {})
            .get("allowed_sjr_quartiles", [])
        ),
        "papers:",
    ]

    paper_key_order = [
        "id",
        "title",
        "year",
        "venue",
        "venue_type",
        "venue_tier",
        "included",
        "citations",
    ]
    for paper in seeds.get("papers") or []:
        first_key = paper_key_order[0]
        lines.append(f"  - {first_key}: {format_value(paper[first_key])}")
        for key in paper_key_order[1:]:
            if key not in paper:
                continue
            value = paper[key]
            if key == "citations":
                lines.append(f"    {key}: {format_inline_list(value or [])}")
            else:
                lines.append(f"    {key}: {format_paper_value(key, value)}")
        for key, value in paper.items():
            if key in paper_key_order:
                continue
            lines.append(f"    {key}: {format_paper_value(key, value)}")

    return "\n".join(lines) + "\n"


def main() -> int:
    args = parser().parse_args()
    paths = get_paths()
    seeds_path = paths.seeds
    audit_path = paths.root / args.audit

    seeds = load_yaml(seeds_path)
    audit_payload = json.loads(audit_path.read_text(encoding="utf-8"))
    paper_ids = {paper["id"] for paper in seeds.get("papers") or []}
    additions = citation_additions(audit_payload, paper_ids)
    added = apply_additions(seeds, additions)

    if not args.dry_run:
        seeds_path.write_text(seeds_yaml(seeds), encoding="utf-8")

    print(
        f"Applied {added} citation edge(s) from "
        f"{os.path.relpath(audit_path, paths.root)} to {os.path.relpath(seeds_path, paths.root)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
