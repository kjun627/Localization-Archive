import { ExternalLink, FileText } from "lucide-react";
import type { GraphNode } from "../types";

type PaperRailProps = {
  papers: GraphNode[];
  selectedNodeKey: string | null;
  onSelectPaper: (paper: GraphNode) => void;
};

export function PaperRail({ papers, selectedNodeKey, onSelectPaper }: PaperRailProps) {
  return (
    <aside className="paper-rail">
      <div className="panel-header compact">
        <span className="panel-eyebrow">Curated library</span>
        <h2>Paper Stack</h2>
      </div>

      <div className="paper-list">
        {papers.map((paper) => {
          const metadata = paper.metadata;
          const sourceCount = metadata?.sourceLinks?.length ?? 0;
          return (
            <button
              key={paper.key}
              type="button"
              className={selectedNodeKey === paper.key ? "paper-card selected" : "paper-card"}
              onClick={() => onSelectPaper(paper)}
            >
              <span className="paper-card-top">
                <span>{metadata?.year ?? "n/a"}</span>
                <strong>{metadata?.venueTier ?? "review"}</strong>
              </span>
              <span className="paper-card-title">{paper.label}</span>
              <span className="paper-card-summary">{metadata?.summary}</span>
              <span className="paper-card-meta">
                <span>
                  <FileText size={14} />
                  {paper.provenance.join(", ")}
                </span>
                <span>
                  <ExternalLink size={14} />
                  {sourceCount}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

