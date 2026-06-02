from __future__ import annotations

import json
from collections import defaultdict
from pathlib import Path
from typing import Any

import yaml

from localization_archive_pipeline.config import get_paths
from localization_archive_pipeline.models import PaperRecord


TYPE_COLORS = {
    "paper": "#7df9ff",
    "problem": "#59d0ff",
    "metric": "#48e7a8",
    "dataset": "#b6ff4d",
    "limitation": "#ff8a65",
}

TYPE_LAYERS = {
    "paper": 0,
    "problem": 1,
    "metric": 2,
    "dataset": 3,
    "limitation": 4,
}


def load_yaml(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return yaml.safe_load(handle)


def slugify(value: str) -> str:
    cleaned = "".join(ch.lower() if ch.isalnum() else "-" for ch in value)
    return "-".join(part for part in cleaned.split("-") if part)


def load_seed_metadata() -> dict[str, dict[str, Any]]:
    paths = get_paths()
    raw = load_yaml(paths.seeds) or {}
    papers = raw.get("papers", [])
    return {paper["id"]: paper for paper in papers}


def load_curated_papers() -> list[PaperRecord]:
    paths = get_paths()
    seeds = load_seed_metadata()
    records: list[PaperRecord] = []

    for path in sorted(paths.curation_dir.glob("*.yaml")):
        payload = load_yaml(path) or {}
        paper_id = payload["paper_id"]
        seed = seeds.get(paper_id)
        if seed is None:
            raise ValueError(f"Curated paper {paper_id} has no matching seed entry.")

        records.append(
            PaperRecord(
                paper_id=paper_id,
                title=payload["title"],
                year=int(payload["year"]),
                venue=payload["venue"],
                venue_type=payload["venue_type"],
                venue_tier=payload["venue_tier"],
                abstract=payload.get("abstract", ""),
                summary=payload.get("summary", ""),
                problem=payload["problem"],
                prior_gap=payload["prior_gap"],
                metric=payload.get("metric", []),
                why_this_metric=payload.get("why_this_metric", ""),
                dataset=payload.get("dataset", []),
                dataset_limitations=payload.get("dataset_limitations", []),
                limitations=payload.get("limitations", []),
                source_links=payload.get("source_links", []),
                citations=seed.get("citations", []),
                confidence=float(payload.get("confidence", 0.6)),
                provenance=payload.get("provenance", ["user_note"]),
            )
        )

    return records


def node_payload(
    node_id: str,
    label: str,
    node_type: str,
    layer_index: int,
    slot_index: int,
    paper_refs: list[str],
    confidence: float,
    provenance: list[str],
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    spacing_x = 5.4
    spacing_y = 3.0
    x = TYPE_LAYERS[node_type] * spacing_x
    y = (slot_index - layer_index) * spacing_y
    payload = {
        "key": node_id,
        "label": label,
        "type": node_type,
        "x": x,
        "y": y,
        "size": 18 if node_type == "paper" else 10,
        "color": TYPE_COLORS[node_type],
        "paperRefs": paper_refs,
        "confidence": confidence,
        "provenance": provenance,
    }
    if metadata:
        payload["metadata"] = metadata
    return payload


def build_graph(records: list[PaperRecord]) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    layer_counts = defaultdict(int)
    created_nodes: set[str] = set()

    def add_node(
        node_id: str,
        label: str,
        node_type: str,
        paper_refs: list[str],
        confidence: float,
        provenance: list[str],
        metadata: dict[str, Any] | None = None,
    ) -> None:
        if node_id in created_nodes:
            return
        slot_index = layer_counts[node_type]
        layer_counts[node_type] += 1
        nodes.append(
            node_payload(
                node_id=node_id,
                label=label,
                node_type=node_type,
                layer_index=TYPE_LAYERS[node_type],
                slot_index=slot_index,
                paper_refs=paper_refs,
                confidence=confidence,
                provenance=provenance,
                metadata=metadata,
            )
        )
        created_nodes.add(node_id)

    for record in records:
        add_node(
            node_id=record.paper_id,
            label=record.title,
            node_type="paper",
            paper_refs=[record.paper_id],
            confidence=record.confidence,
            provenance=record.provenance,
            metadata={
                "title": record.title,
                "year": record.year,
                "venue": record.venue,
                "venueType": record.venue_type,
                "venueTier": record.venue_tier,
                "summary": record.summary,
                "abstract": record.abstract,
                "problem": record.problem,
                "priorGap": record.prior_gap,
                "whyThisMetric": record.why_this_metric,
                "datasetLimitations": record.dataset_limitations,
                "limitations": record.limitations,
                "sourceLinks": record.source_links,
            },
        )

        problem_id = f"problem:{slugify(record.problem)}"
        add_node(
            node_id=problem_id,
            label=record.problem,
            node_type="problem",
            paper_refs=[record.paper_id],
            confidence=record.confidence,
            provenance=record.provenance,
        )
        edges.append(edge_payload(record.paper_id, problem_id, "addresses", record.paper_id))

        prior_gap_id = f"limitation:{slugify(record.prior_gap)}"
        add_node(
            node_id=prior_gap_id,
            label=record.prior_gap,
            node_type="limitation",
            paper_refs=[record.paper_id],
            confidence=record.confidence,
            provenance=record.provenance,
        )
        edges.append(edge_payload(record.paper_id, prior_gap_id, "motivated_by", record.paper_id))

        for metric in record.metric:
            metric_id = f"metric:{slugify(metric)}"
            add_node(
                node_id=metric_id,
                label=metric,
                node_type="metric",
                paper_refs=[record.paper_id],
                confidence=record.confidence,
                provenance=record.provenance,
            )
            edges.append(edge_payload(record.paper_id, metric_id, "measured_by", record.paper_id))

        for dataset in record.dataset:
            dataset_id = f"dataset:{slugify(dataset)}"
            add_node(
                node_id=dataset_id,
                label=dataset,
                node_type="dataset",
                paper_refs=[record.paper_id],
                confidence=record.confidence,
                provenance=record.provenance,
            )
            edges.append(edge_payload(record.paper_id, dataset_id, "evaluated_on", record.paper_id))

        for limitation in record.limitations:
            limitation_id = f"limitation:{slugify(limitation)}"
            add_node(
                node_id=limitation_id,
                label=limitation,
                node_type="limitation",
                paper_refs=[record.paper_id],
                confidence=record.confidence,
                provenance=record.provenance,
            )
            edges.append(edge_payload(record.paper_id, limitation_id, "has_limitation", record.paper_id))

        for cited_paper_id in record.citations:
            if cited_paper_id in {item.paper_id for item in records}:
                edges.append(edge_payload(record.paper_id, cited_paper_id, "cites", record.paper_id))

    return {
        "meta": {
            "domain": "3D Visual Localization",
            "paperCount": len(records),
            "generatedBy": "pipeline/build_graph.py",
            "nodeTypes": list(TYPE_COLORS.keys()),
        },
        "nodes": nodes,
        "edges": edges,
    }


def edge_payload(source: str, target: str, edge_type: str, paper_id: str) -> dict[str, Any]:
    return {
        "key": f"{source}->{target}:{edge_type}",
        "source": source,
        "target": target,
        "type": edge_type,
        "paperRefs": [paper_id],
    }


def write_graph(graph: dict[str, Any]) -> None:
    output_path = get_paths().graph_output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as handle:
        json.dump(graph, handle, indent=2)
        handle.write("\n")


def main() -> int:
    records = load_curated_papers()
    graph = build_graph(records)
    write_graph(graph)
    print(f"Wrote {len(graph['nodes'])} nodes and {len(graph['edges'])} edges to web/public/graph.json")
    return 0

