from __future__ import annotations

from dataclasses import dataclass
from pathlib import Path


@dataclass(frozen=True)
class Paths:
    root: Path
    seeds: Path
    curation_dir: Path
    core_conferences: Path
    sjr_journals: Path
    graph_output: Path


def get_paths() -> Paths:
    root = Path(__file__).resolve().parents[3]
    data_dir = root / "data"
    reference_dir = data_dir / "reference"
    return Paths(
        root=root,
        seeds=data_dir / "seeds.yaml",
        curation_dir=data_dir / "curation",
        core_conferences=reference_dir / "core_conferences.csv",
        sjr_journals=reference_dir / "sjr_journals.csv",
        graph_output=root / "web" / "public" / "graph.json",
    )
