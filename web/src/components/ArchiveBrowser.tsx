import type { CSSProperties } from "react";
import { Download, ExternalLink, Search } from "lucide-react";
import type { GraphEdge, GraphNode } from "../types";

type ArchiveBrowserProps = {
  edges: GraphEdge[];
  papers: GraphNode[];
  selectedPaper: GraphNode | null;
  activeVenues: Record<string, boolean>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPaper: (paper: GraphNode) => void;
  onToggleVenue: (venue: string) => void;
};

const VENUE_THEMES: Record<string, { color: string; ink: string }> = {
  CVPR: { color: "#e3000b", ink: "#fffdf3" },
  ICCV: { color: "#111827", ink: "#fffdf3" },
  ECCV: { color: "#1b5cff", ink: "#fffdf3" },
  TPAMI: { color: "#237841", ink: "#fffdf3" },
  "3DV": { color: "#ff8a00", ink: "#05070d" },
  IVC: { color: "#7b2cff", ink: "#fffdf3" },
  FILE: { color: "#40516d", ink: "#fffdf3" },
};

function venueCode(paper: GraphNode) {
  const venue = paper.metadata?.venue ?? "Unknown";
  if (venue.includes("Computer Vision and Pattern Recognition")) return "CVPR";
  if (venue.includes("European Conference on Computer Vision")) return "ECCV";
  if (venue.includes("International Conference on Computer Vision")) return "ICCV";
  if (venue.includes("3D Vision")) return "3DV";
  if (venue.includes("Pattern Analysis and Machine Intelligence")) return "TPAMI";
  if (venue.includes("Image and Vision Computing")) return "IVC";
  return paper.metadata?.venueTier ?? "FILE";
}

function venueTheme(venue: string) {
  return VENUE_THEMES[venue] ?? VENUE_THEMES.FILE;
}

function shortTitle(title: string) {
  const first = title.split(":")[0]?.trim();
  if (!first || first.length > 18) return title.split(/\s+/).slice(0, 2).join(" ");
  return first;
}

function groupByYear(papers: GraphNode[]) {
  const grouped = new Map<number, GraphNode[]>();
  papers.forEach((paper) => {
    const year = paper.metadata?.year ?? 0;
    grouped.set(year, [...(grouped.get(year) ?? []), paper]);
  });
  return Array.from(grouped.entries()).sort(([left], [right]) => left - right);
}

function buildCitationExport(papers: GraphNode[], edges: GraphEdge[]) {
  const paperByKey = new Map(papers.map((paper) => [paper.key, paper]));
  const citationEdges = edges.filter(
    (edge) => edge.type === "cites" && paperByKey.has(edge.source) && paperByKey.has(edge.target),
  );
  const years = groupByYear(papers);
  const now = new Date().toISOString();
  const lines = [
    "# 3D Visual Localization Citation Archive",
    "",
    `Generated: ${now}`,
    `Paper count: ${papers.length}`,
    `Citation edge count: ${citationEdges.length}`,
    "",
    "## Year Index",
    "",
  ];

  years.forEach(([year, yearPapers]) => {
    lines.push(`### ${year}`, "");
    yearPapers.forEach((paper) => {
      lines.push(`- ${paper.label} (${venueCode(paper)}, ${paper.metadata?.venueTier ?? "tier_unknown"})`);
    });
    lines.push("");
  });

  lines.push("## Citation List", "");
  if (citationEdges.length === 0) {
    lines.push("- No citation edges are available in the current filtered graph.", "");
  } else {
    citationEdges.forEach((edge) => {
      const source = paperByKey.get(edge.source);
      const target = paperByKey.get(edge.target);
      lines.push(`- ${source?.label ?? edge.source} -> ${target?.label ?? edge.target}`);
    });
    lines.push("");
  }

  lines.push("## Citation Tree", "");
  papers.forEach((paper) => {
    const outgoing = citationEdges.filter((edge) => edge.source === paper.key);
    lines.push(`- ${paper.label}`);
    if (outgoing.length === 0) {
      lines.push("  - cites: none recorded");
    } else {
      outgoing.forEach((edge) => {
        lines.push(`  - cites: ${paperByKey.get(edge.target)?.label ?? edge.target}`);
      });
    }
  });

  return lines.join("\n");
}

function downloadText(filename: string, body: string) {
  const blob = new Blob([body], { type: "text/markdown;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export function ArchiveBrowser({
  edges,
  papers,
  selectedPaper,
  activeVenues,
  search,
  onSearchChange,
  onSelectPaper,
  onToggleVenue,
}: ArchiveBrowserProps) {
  const venueCounts = papers.reduce<Record<string, number>>((counts, paper) => {
    const venue = venueCode(paper);
    counts[venue] = (counts[venue] ?? 0) + 1;
    return counts;
  }, {});

  const filteredPapers = papers.filter((paper) => {
    const query = search.trim().toLowerCase();
    const metadata = paper.metadata;
    const venue = venueCode(paper);
    const matchesVenue = activeVenues[venue] ?? true;
    const matchesSearch =
      query.length === 0 ||
      paper.label.toLowerCase().includes(query) ||
      metadata?.summary?.toLowerCase().includes(query) ||
      metadata?.venue?.toLowerCase().includes(query) ||
      metadata?.problem?.toLowerCase().includes(query);
    return matchesVenue && matchesSearch;
  });

  const years = groupByYear(filteredPapers);
  const selectedVenue = selectedPaper ? venueCode(selectedPaper) : "FILE";
  const selectedTheme = venueTheme(selectedVenue);
  const selectedLinks = selectedPaper?.metadata?.sourceLinks ?? [];
  const selectedFigure = selectedPaper?.metadata?.figure;
  const exportCitationArchive = () => {
    downloadText("localization-citation-archive.md", buildCitationExport(filteredPapers, edges));
  };

  return (
    <div className="archive-app">
      <header className="ledger">
        <div className="chapter">
          <b>Loc.</b> / archive
        </div>
        <h1>3D Visual Localization</h1>
        <div className="file-count">
          {filteredPapers.length} / {papers.length} filed
        </div>
        <div className="page-mark">/{selectedPaper?.metadata?.year ?? "----"}</div>
      </header>

      <section className="archive-tools">
        <label className="archive-search">
          <Search size={14} />
          <input
            type="search"
            value={search}
            placeholder="Search title, problem, venue..."
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
        <div className="venue-toggles">
          {Object.entries(venueCounts).map(([venue, count]) => (
            <button
              className={activeVenues[venue] === false ? "venue-toggle off" : "venue-toggle"}
              key={venue}
              onClick={() => onToggleVenue(venue)}
              style={
                {
                  "--tone": venueTheme(venue).color,
                  "--tone-ink": venueTheme(venue).ink,
                  "--tone-ring": venue === selectedVenue ? "var(--lego-yellow)" : "rgba(255, 255, 255, 0.38)",
                } as CSSProperties
              }
              type="button"
            >
              <span />
              {venue} · {count}
            </button>
          ))}
        </div>
        <button className="export-button" onClick={exportCitationArchive} type="button">
          <Download size={14} />
          Export citation tree
        </button>
      </section>

      <main className="archive-stage">
        <aside
          className="file-panel"
          style={{ "--tone": selectedTheme.color, "--tone-ink": selectedTheme.ink } as CSSProperties}
        >
          {selectedPaper ? (
            <>
              <div className="file-tag">
                <span>{selectedVenue}</span>
                <span>'{String(selectedPaper.metadata?.year ?? "").slice(-2)}</span>
              </div>
              <div className="file-figure">
                {selectedFigure?.url ? (
                  <img src={selectedFigure.url} alt={selectedFigure.alt ?? selectedPaper.label} />
                ) : (
                  <div className="figure-placeholder" aria-label="Paper representative figure placeholder">
                    <span>{selectedPaper.metadata?.venueTier ?? "tier"}</span>
                    <strong>{shortTitle(selectedPaper.label)}</strong>
                  </div>
                )}
                <small>{selectedFigure?.caption ?? "Representative figure slot"}</small>
              </div>
              <div className="file-content">
                <h2>{selectedPaper.label}</h2>
                <dl className="file-facts">
                  <dt>Venue</dt>
                  <dd>{selectedPaper.metadata?.venue}</dd>
                  <dt>Problem</dt>
                  <dd>{selectedPaper.metadata?.problem}</dd>
                  <dt>Metric</dt>
                  <dd>{selectedPaper.metadata?.whyThisMetric ?? "needs_review"}</dd>
                </dl>
                <p>{selectedPaper.metadata?.summary}</p>
                <div className="file-tags">
                  <span>{selectedPaper.metadata?.venueTier}</span>
                  <span>{selectedPaper.metadata?.venueType}</span>
                  <span>{selectedPaper.provenance.join(", ")}</span>
                </div>
                <div className="file-links">
                  {selectedLinks.map((link) => (
                    <a href={link.url} key={link.url} rel="noreferrer" target="_blank">
                      {link.label}
                      <ExternalLink size={13} />
                    </a>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <div className="file-empty">Select a paper file.</div>
          )}
        </aside>

        <div className="archive-scroller">
          <div className="timeline">
            {years.map(([year, yearPapers]) => (
              <section className="year-column" key={year}>
                <div className="year-head">
                  <div className="year-number">{year}</div>
                  <div className="year-sub">
                    filed · {String(yearPapers.length).padStart(2, "0")} papers
                    <br />
                    TOP-TIER ONLY
                  </div>
                </div>
                <div className="file-stack">
                  {yearPapers.map((paper, index) => {
                    const venue = venueCode(paper);
                    const theme = venueTheme(venue);
                    const selected = selectedPaper?.key === paper.key;
                    return (
                      <button
                        className={selected ? "file-card selected" : "file-card"}
                        key={paper.key}
                        onClick={() => onSelectPaper(paper)}
                        style={{ "--tone": theme.color, "--tone-ink": theme.ink } as CSSProperties}
                        type="button"
                      >
                        <span className="file-tab">
                          <span>{venue}</span>
                          <small>'{String(paper.metadata?.year ?? "").slice(-2)}</small>
                        </span>
                        <span className="file-body">
                          <span className="file-index">{String(index + 1).padStart(3, "0")}</span>
                          <span className="file-title">
                            <b>{shortTitle(paper.label)}</b>
                            {paper.label}
                          </span>
                          <span className="file-meta">
                            <span>{paper.metadata?.venueTier}</span>
                            <span>{paper.metadata?.sourceLinks?.length ? "LINK" : "NO LINK"}</span>
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              </section>
            ))}
          </div>
        </div>
      </main>

      <footer className="archive-caption">Figure 1. Localization Archive — year-index browser</footer>
    </div>
  );
}
