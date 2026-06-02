from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class PaperRecord:
    paper_id: str
    title: str
    year: int
    venue: str
    venue_type: str
    venue_tier: str
    abstract: str
    summary: str
    problem: str
    prior_gap: str
    metric: list[str] = field(default_factory=list)
    why_this_metric: str = ""
    dataset: list[str] = field(default_factory=list)
    dataset_limitations: list[str] = field(default_factory=list)
    limitations: list[str] = field(default_factory=list)
    source_links: list[dict[str, str]] = field(default_factory=list)
    citations: list[str] = field(default_factory=list)
    confidence: float = 0.6
    provenance: list[str] = field(default_factory=list)

