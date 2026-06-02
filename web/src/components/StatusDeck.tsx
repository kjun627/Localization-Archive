import { BookOpen, Database, Gauge, Network, ShieldCheck } from "lucide-react";
import type { GraphPayload, NodeType } from "../types";

type StatusDeckProps = {
  graph: GraphPayload | null;
  visibleCount: number;
};

const typeLabels: Record<NodeType, string> = {
  paper: "Papers",
  problem: "Problems",
  metric: "Metrics",
  dataset: "Datasets",
  limitation: "Limits",
};

export function StatusDeck({ graph, visibleCount }: StatusDeckProps) {
  const nodes = graph?.nodes ?? [];
  const nodeCounts = nodes.reduce(
    (counts, node) => ({ ...counts, [node.type]: (counts[node.type] ?? 0) + 1 }),
    {} as Record<NodeType, number>,
  );
  const tierCount = nodes.filter((node) => node.type === "paper" && node.metadata?.venueTier).length;

  return (
    <section className="status-deck" aria-label="Archive status">
      <div className="status-tile primary">
        <Network size={18} />
        <span>Visible network</span>
        <strong>{visibleCount}</strong>
      </div>
      <div className="status-tile">
        <BookOpen size={18} />
        <span>Curated papers</span>
        <strong>{graph?.meta.paperCount ?? 0}</strong>
      </div>
      <div className="status-tile">
        <Gauge size={18} />
        <span>{typeLabels.metric}</span>
        <strong>{nodeCounts.metric ?? 0}</strong>
      </div>
      <div className="status-tile">
        <Database size={18} />
        <span>{typeLabels.dataset}</span>
        <strong>{nodeCounts.dataset ?? 0}</strong>
      </div>
      <div className="status-tile">
        <ShieldCheck size={18} />
        <span>Tier-gated</span>
        <strong>{tierCount}</strong>
      </div>
    </section>
  );
}

