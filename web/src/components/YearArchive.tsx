import { ExternalLink, FileText, Search } from "lucide-react";
import type { GraphNode } from "../types";

type YearArchiveProps = {
  papersByYear: Array<[number, GraphNode[]]>;
  selectedNodeKey: string | null;
  onSelectPaper: (paper: GraphNode) => void;
};

export function YearArchive({ papersByYear, selectedNodeKey, onSelectPaper }: YearArchiveProps) {
  if (!papersByYear.length) {
    return (
      <section className="archive-empty">
        <Search size={28} />
        <h2>No papers match the current filters.</h2>
      </section>
    );
  }

  return (
    <section className="year-archive" aria-label="Papers by year">
      {papersByYear.map(([year, papers]) => (
        <section className="year-section" key={year}>
          <div className="year-marker">
            <span>{year}</span>
            <small>{papers.length} papers</small>
          </div>
          <div className="archive-grid">
            {papers.map((paper) => {
              const metadata = paper.metadata;
              const sourceCount = metadata?.sourceLinks?.length ?? 0;
              return (
                <button
                  className={selectedNodeKey === paper.key ? "archive-card selected" : "archive-card"}
                  key={paper.key}
                  type="button"
                  onClick={() => onSelectPaper(paper)}
                >
                  <span className="archive-card-kicker">
                    <strong>{metadata?.venueTier ?? "review"}</strong>
                    <span>{metadata?.venueType ?? "paper"}</span>
                  </span>
                  <span className="archive-card-title">{paper.label}</span>
                  <span className="archive-card-summary">{metadata?.summary}</span>
                  <span className="archive-card-footer">
                    <span>
                      <FileText size={14} />
                      {metadata?.venue ?? "Unknown venue"}
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
        </section>
      ))}
    </section>
  );
}
