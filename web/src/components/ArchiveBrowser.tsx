import { useEffect, useRef } from "react";
import type { CSSProperties } from "react";
import { ExternalLink, Search } from "lucide-react";
import type { GraphNode } from "../types";

type ArchiveBrowserProps = {
  papers: GraphNode[];
  selectedPaper: GraphNode | null;
  activeVenues: Record<string, boolean>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPaper: (paper: GraphNode) => void;
  onToggleVenue: (venue: string) => void;
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

export function ArchiveBrowser({
  papers,
  selectedPaper,
  activeVenues,
  search,
  onSearchChange,
  onSelectPaper,
  onToggleVenue,
}: ArchiveBrowserProps) {
  const scrollerRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller) return;

    const onWheel = (event: WheelEvent) => {
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        scroller.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };

    scroller.addEventListener("wheel", onWheel, { passive: false });
    return () => scroller.removeEventListener("wheel", onWheel);
  }, []);

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
  const selectedLinks = selectedPaper?.metadata?.sourceLinks ?? [];

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
              style={{ "--tone": venue === selectedVenue ? "var(--lego-blue)" : "var(--lego-black)" } as CSSProperties}
              type="button"
            >
              <span />
              {venue} · {count}
            </button>
          ))}
        </div>
      </section>

      <main className="archive-stage">
        <aside className="file-panel" style={{ "--tone": "var(--lego-blue)" } as CSSProperties}>
          {selectedPaper ? (
            <>
              <div className="file-tag">
                <span>{selectedVenue}</span>
                <span>'{String(selectedPaper.metadata?.year ?? "").slice(-2)}</span>
              </div>
              <div className="file-figure">
                <span>{selectedPaper.metadata?.venueTier ?? "tier"}</span>
                <strong>{shortTitle(selectedPaper.label)}</strong>
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

        <div className="archive-scroller" ref={scrollerRef}>
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
                    const selected = selectedPaper?.key === paper.key;
                    return (
                      <button
                        className={selected ? "file-card selected" : "file-card"}
                        key={paper.key}
                        onClick={() => onSelectPaper(paper)}
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
