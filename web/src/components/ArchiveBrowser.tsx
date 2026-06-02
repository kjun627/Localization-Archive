import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent } from "react";
import type { GraphEdge, GraphNode } from "../types";

type ArchiveBrowserProps = {
  edges: GraphEdge[];
  papers: GraphNode[];
  selectedPaper: GraphNode | null;
  activeVenues: Record<string, boolean>;
  search: string;
  onSearchChange: (value: string) => void;
  onSelectPaper: (paper: GraphNode | null) => void;
  onToggleVenue: (venue: string) => void;
};

const MONTHS = ["", "JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

const CitationGraphModal = lazy(() =>
  import("./CitationGraphModal").then((module) => ({ default: module.CitationGraphModal })),
);

const VENUE_THEME: Record<string, string> = {
  BMVC: "#e83e8c",
  CVPR: "var(--c-CVPR)",
  ICRA: "#8b3ddb",
  ICCV: "var(--c-ICCV)",
  ECCV: "var(--c-ECCV)",
  TPAMI: "var(--c-TPAMI)",
  IJCV: "var(--c-TPAMI)",
  PR: "#00a76f",
  RAL: "#8b3ddb",
  "3DV": "var(--c-3DV)",
  IVC: "var(--c-IVC)",
  FILE: "var(--c-FILE)",
  OTHER: "var(--c-FILE)",
};

const VENUE_ORDER = ["CVPR", "ECCV", "ICCV", "3DV", "BMVC", "ICRA", "TPAMI", "IJCV", "RAL", "PR", "IVC", "OTHER", "FILE"];

function venueCode(paper: GraphNode) {
  const venue = paper.metadata?.venue ?? "Unknown";
  if (venue.includes("Computer Vision and Pattern Recognition")) return "CVPR";
  if (venue.includes("European Conference on Computer Vision")) return "ECCV";
  if (venue.includes("International Conference on Computer Vision")) return "ICCV";
  if (venue.includes("3D Vision")) return "3DV";
  if (venue.includes("British Machine Vision Conference")) return "BMVC";
  if (venue.includes("Robotics and Automation")) return "ICRA";
  if (venue.includes("Pattern Analysis and Machine Intelligence")) return "TPAMI";
  if (venue.includes("International Journal of Computer Vision")) return "IJCV";
  if (venue.includes("Robotics and Automation Letters")) return "RAL";
  if (venue.includes("Pattern Recognition")) return "PR";
  if (venue.includes("Image and Vision Computing")) return "IVC";
  return "OTHER";
}

function venueMonth(paper: GraphNode) {
  const venue = venueCode(paper);
  if (venue === "CVPR") return 6;
  if (venue === "ICCV") return 10;
  if (venue === "ECCV") return 9;
  if (venue === "3DV") return 11;
  if (venue === "TPAMI") return 1;
  return 12;
}

function paperShortTitle(title: string) {
  const beforeColon = title.split(":")[0]?.trim();
  const source = beforeColon && beforeColon.length <= 24 ? beforeColon : title;
  return source
    .replace(/[^a-zA-Z0-9*+\- ]/g, "")
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .join(" ");
}

function hasCode(paper: GraphNode) {
  return (paper.metadata?.sourceLinks ?? []).some((link) => link.label.toLowerCase().includes("code"));
}

function figureUrl(url: string | undefined) {
  if (!url) return undefined;
  if (url.toLowerCase().endsWith(".svg")) return undefined;
  if (url.startsWith("http") || url.startsWith("/")) return url;
  return `${import.meta.env.BASE_URL}${url}`;
}

type SourceLink = NonNullable<NonNullable<GraphNode["metadata"]>["sourceLinks"]>[number];

const PAPER_LINK_LABELS = new Set(["arxiv", "cvf", "doi", "html", "paper", "pdf"]);

function isPaperLink(link: SourceLink) {
  const label = link.label.toLowerCase();
  return PAPER_LINK_LABELS.has(label) || label.includes("paper") || label.includes("arxiv") || label.includes("doi");
}

function paperLinkPriority(link: SourceLink) {
  const url = link.url.toLowerCase();
  const label = link.label.toLowerCase();
  if (url.includes("openaccess.thecvf.com") && !url.endsWith(".pdf")) return 0;
  if (url.includes("ecva.net") && !url.endsWith(".pdf")) return 1;
  if (url.includes("bmvc") && !url.endsWith(".pdf")) return 2;
  if (url.includes("microsoft.com") && !url.endsWith(".pdf")) return 3;
  if (label === "paper") return 4;
  if (label === "doi") return 5;
  if (label === "arxiv") return 6;
  if (label === "pdf") return 7;
  return 8;
}

function normalizeSourceLinks(links: SourceLink[] | undefined) {
  const paperLinks = (links ?? []).filter(isPaperLink).sort((left, right) => paperLinkPriority(left) - paperLinkPriority(right));
  const selectedPaperLink = paperLinks[0] ? [{ ...paperLinks[0], label: "Paper" }] : [];
  const nonPaperLinks = (links ?? []).filter((link) => !isPaperLink(link));
  return [...selectedPaperLink, ...nonPaperLinks];
}

function groupByYear(papers: GraphNode[]) {
  const grouped = new Map<number, GraphNode[]>();
  papers.forEach((paper) => {
    const year = paper.metadata?.year ?? 0;
    grouped.set(year, [...(grouped.get(year) ?? []), paper]);
  });
  return Array.from(grouped.entries()).sort(([left], [right]) => right - left);
}

function sortWithinYear(papers: GraphNode[]) {
  return [...papers].sort((left, right) => {
    const leftVenueIndex = VENUE_ORDER.indexOf(venueCode(left));
    const rightVenueIndex = VENUE_ORDER.indexOf(venueCode(right));
    const venueDiff =
      (leftVenueIndex === -1 ? VENUE_ORDER.length : leftVenueIndex) -
      (rightVenueIndex === -1 ? VENUE_ORDER.length : rightVenueIndex);
    if (venueDiff) return venueDiff;
    return venueMonth(right) - venueMonth(left) || left.label.localeCompare(right.label);
  });
}

function getCitationStats(paperKey: string, edges: GraphEdge[]) {
  return edges.reduce(
    (stats, edge) => {
      if (edge.type !== "cites") return stats;
      if (edge.source === paperKey) stats.cites += 1;
      if (edge.target === paperKey) stats.citedBy += 1;
      return stats;
    },
    { citedBy: 0, cites: 0 },
  );
}

type CardProps = {
  paper: GraphNode;
  index: number;
  activeId: string | undefined;
  pinnedId: string | undefined;
  anyActive: boolean;
  linkedBuilds: Set<string>;
  linkedCited: Set<string>;
  onHover: (paper: GraphNode) => void;
  onLeave: () => void;
  onClick: (paper: GraphNode) => void;
};

function PaperCard({
  paper,
  index,
  activeId,
  pinnedId,
  anyActive,
  linkedBuilds,
  linkedCited,
  onHover,
  onLeave,
  onClick,
}: CardProps) {
  const venue = venueCode(paper);
  const linkedBuild = linkedBuilds.has(paper.key);
  const linkedCite = linkedCited.has(paper.key);
  const className = [
    "card",
    activeId === paper.key && "hl",
    pinnedId === paper.key && "pinned",
    anyActive && activeId !== paper.key && !linkedBuild && !linkedCite && "dim",
    linkedBuild && "link-builds",
    linkedCite && "link-cited",
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div
      className={className}
      data-paper-id={paper.key}
      onClick={() => onClick(paper)}
      onMouseEnter={() => onHover(paper)}
      onMouseLeave={onLeave}
      style={{ "--tone": VENUE_THEME[venue] ?? VENUE_THEME.FILE } as CSSProperties}
    >
      <div className="tab">
        <div className="venue">{venue}</div>
        <div className="vy">&apos;{String(paper.metadata?.year ?? "").slice(-2)}</div>
      </div>
      <div className="body">
        <div className="idx">
          {linkedBuild ? <span className="lineage-arrow">UP</span> : linkedCite ? <span className="lineage-arrow">DN</span> : String(index).padStart(3, "0")}
        </div>
        <div className="title">
          <span className="short">{paperShortTitle(paper.label)}</span>
          {paper.label}
        </div>
        <div className="meta">
          {pinnedId === paper.key ? <span className="pin-dot">PIN</span> : null}
          <span className="mo">{MONTHS[venueMonth(paper)]}</span>
          <span className={`code ${hasCode(paper) ? "" : "off"}`}>CODE</span>
        </div>
      </div>
    </div>
  );
}

type DetailProps = {
  paper: GraphNode | null;
  open: boolean;
  pinned: boolean;
  edges: GraphEdge[];
  papersByKey: Map<string, GraphNode>;
  onClose: () => void;
  onOpenGraph: () => void;
  onUnpin: () => void;
  onJumpTo: (key: string) => void;
};

function DetailPanel({ paper, open, pinned, edges, papersByKey, onClose, onOpenGraph, onUnpin, onJumpTo }: DetailProps) {
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const dragRef = useRef<{ baseX: number; baseY: number; startX: number; startY: number } | null>(null);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;
      setPosition({
        x: drag.baseX + event.clientX - drag.startX,
        y: drag.baseY + event.clientY - drag.startY,
      });
    };
    const onUp = () => {
      dragRef.current = null;
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  const startDrag = (event: ReactMouseEvent) => {
    event.preventDefault();
    dragRef.current = {
      baseX: position.x,
      baseY: position.y,
      startX: event.clientX,
      startY: event.clientY,
    };
    document.body.style.cursor = "grabbing";
  };

  const panelStyle = { transform: `translate(${position.x}px, ${position.y}px)` };

  if (!open) return null;

  if (!paper) {
    return (
      <aside className="detail empty" style={panelStyle}>
        <div className="tag drag-handle" onMouseDown={startDrag}>
          <span>Index</span>
          <span className="tag-right">
            Hover a file
            <button aria-label="Close" className="pin-close" onClick={onClose} type="button">
              x
            </button>
          </span>
        </div>
        <div className="empty-msg">
          Hover a<br />filed card<br />to inspect
        </div>
      </aside>
    );
  }

  const venue = venueCode(paper);
  const stats = getCitationStats(paper.key, edges);
  const buildsOn = edges
    .filter((edge) => edge.type === "cites" && edge.source === paper.key)
    .map((edge) => ({ edge, paper: papersByKey.get(edge.target) }))
    .filter((item): item is { edge: GraphEdge; paper: GraphNode } => Boolean(item.paper));
  const citedBy = edges
    .filter((edge) => edge.type === "cites" && edge.target === paper.key)
    .map((edge) => ({ edge, paper: papersByKey.get(edge.source) }))
    .filter((item): item is { edge: GraphEdge; paper: GraphNode } => Boolean(item.paper));
  const sourceLinks = normalizeSourceLinks(paper.metadata?.sourceLinks);
  const representativeImage = figureUrl(paper.metadata?.figure?.url);

  return (
    <aside
      className={`detail ${pinned ? "pinned" : ""}`}
      style={
        {
          ...panelStyle,
          "--tone": VENUE_THEME[venue] ?? VENUE_THEME.FILE,
        } as CSSProperties
      }
    >
      <div className="tag drag-handle" onMouseDown={startDrag}>
        <span>
          {venue} · {paper.metadata?.year}
        </span>
        <span className="tag-right">
          {MONTHS[venueMonth(paper)]}
          {pinned ? (
            <button aria-label="Unpin" className="pin-close" onClick={onUnpin} type="button">
              -
            </button>
          ) : null}
          <button aria-label="Close" className="pin-close" onClick={onClose} type="button">
            x
          </button>
        </span>
      </div>

      <div className={`fig ${representativeImage ? "has-image" : ""}`}>
        {representativeImage ? (
          <img
            alt={paper.metadata.figure.alt ?? paper.label}
            className="fig-img"
            loading="lazy"
            src={representativeImage}
          />
        ) : null}
        <span className="fig-caption">{paper.metadata?.figure?.caption ?? paper.metadata?.stage ?? "Representative figure slot"}</span>
      </div>

      <div className="content">
        <h2>{paper.label}</h2>
        <div className="authors">{paper.metadata?.stage ?? paper.metadata?.venue}</div>
        <dl className="facts">
          <dt>Problem</dt>
          <dd>{paper.metadata?.problem}</dd>
          <dt>Cites</dt>
          <dd>{stats.cites}</dd>
          <dt>Cited by</dt>
          <dd>{stats.citedBy}</dd>
          <dt>Venue</dt>
          <dd>{paper.metadata?.venue ?? venue}</dd>
        </dl>

        <section className="paper-note">
          <h3>Prior limitation</h3>
          <p>{paper.metadata?.priorGap}</p>
        </section>
        <section className="paper-note">
          <h3>What it advanced</h3>
          <p>{paper.metadata?.advance ?? paper.metadata?.summary}</p>
        </section>
        <section className="paper-note">
          <h3>Datasets</h3>
          <div className="tags">
            {(paper.metadata?.datasets ?? []).map((item) => (
              <span key={item}>#{item.toLowerCase()}</span>
            ))}
          </div>
        </section>
        <section className="paper-note">
          <h3>Limitations</h3>
          <div className="abs">{(paper.metadata?.limitations ?? []).join(" ") || "needs_review"}</div>
        </section>

        {buildsOn.length ? (
          <div className="lineage-section lineage-builds-section">
            <div className="lineage-label">UP Builds on ({buildsOn.length})</div>
            <div className="lineage-chips">
              {buildsOn.map(({ paper: item }) => (
                <button className="lineage-chip" key={item.key} onClick={() => onJumpTo(item.key)} title={item.label} type="button">
                  {paperShortTitle(item.label)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        {citedBy.length ? (
          <div className="lineage-section lineage-cited-section">
            <div className="lineage-label">DN Cited by ({citedBy.length})</div>
            <div className="lineage-chips">
              {citedBy.map(({ paper: item }) => (
                <button className="lineage-chip" key={item.key} onClick={() => onJumpTo(item.key)} title={item.label} type="button">
                  {paperShortTitle(item.label)}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <button className="graph-link" onClick={onOpenGraph} type="button">
          View citation graph
        </button>

        <div className="links">
          {sourceLinks.map((link) => (
            <a href={link.url} key={link.url} rel="noopener noreferrer" target="_blank">
              {link.label} <span className="arr">open</span>
            </a>
          ))}
        </div>
      </div>
    </aside>
  );
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
  const [hoveredPaper, setHoveredPaper] = useState<GraphNode | null>(null);
  const [manualOpen, setManualOpen] = useState(false);
  const [graphOpen, setGraphOpen] = useState(false);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const papersByKey = useMemo(() => new Map(papers.map((paper) => [paper.key, paper])), [papers]);

  useEffect(() => {
    const element = scrollerRef.current;
    if (!element) return;
    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null;
      const stack = target?.closest?.(".stack") as HTMLElement | null;
      if (stack && stack.scrollHeight > stack.clientHeight + 1 && !event.shiftKey) return;
      if (Math.abs(event.deltaY) > Math.abs(event.deltaX)) {
        element.scrollLeft += event.deltaY;
        event.preventDefault();
      }
    };
    element.addEventListener("wheel", onWheel, { passive: false });
    return () => element.removeEventListener("wheel", onWheel);
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
    const searchable = [
      paper.label,
      metadata?.summary,
      metadata?.problem,
      metadata?.priorGap,
      metadata?.advance,
      metadata?.stage,
      metadata?.venue,
      ...(metadata?.datasets ?? []),
      ...(metadata?.metrics ?? []),
    ]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    return matchesVenue && (query.length === 0 || searchable.includes(query));
  });

  const years = groupByYear(filteredPapers);
  const displayPaper = hoveredPaper ?? selectedPaper;
  const detailOpen = Boolean(displayPaper) || manualOpen;
  const citationEdges = edges.filter((edge) => edge.type === "cites");
  const linkedBuilds = useMemo(
    () => new Set(citationEdges.filter((edge) => edge.source === displayPaper?.key).map((edge) => edge.target)),
    [citationEdges, displayPaper],
  );
  const linkedCited = useMemo(
    () => new Set(citationEdges.filter((edge) => edge.target === displayPaper?.key).map((edge) => edge.source)),
    [citationEdges, displayPaper],
  );

  const jumpToPaper = (key: string) => {
    const target = papersByKey.get(key);
    if (!target) return;
    setHoveredPaper(null);
    onSelectPaper(target);
    setManualOpen(true);
    requestAnimationFrame(() => {
      const element = scrollerRef.current?.querySelector(`[data-paper-id="${key}"]`) as HTMLElement | null;
      element?.scrollIntoView({ behavior: "smooth", inline: "center", block: "nearest" });
    });
  };

  return (
    <div
      className="app"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          setHoveredPaper(null);
          onSelectPaper(null);
          setManualOpen(false);
        }
      }}
    >
      <div>
        <div className="ledger">
          <div className="ch">
            <b>Ch. 3 /</b>
          </div>
          <h1>3D Localization Archive</h1>
          <div className="count">
            {String(filteredPapers.length).padStart(2, "0")} / {String(papers.length).padStart(2, "0")} filed
          </div>
          <div className="page">/ {new Date().getFullYear().toString().slice(-2)}</div>
        </div>

        <div className="archive-tools">
          <label className="archive-search">
            <SearchIcon />
            <input
              aria-label="Search papers"
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder="Search"
              type="search"
              value={search}
            />
          </label>
          <div className="toggles">
            {Object.entries(venueCounts).map(([venue, count]) => (
              <div
                className="toggle"
                data-on={activeVenues[venue] !== false}
                key={venue}
                onClick={() => onToggleVenue(venue)}
                style={{ "--tone": VENUE_THEME[venue] ?? VENUE_THEME.FILE } as CSSProperties}
                title={`${venue} - ${count} papers`}
              >
                <span className="dot" />
                {venue}&nbsp;·&nbsp;{count}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div
        className="stage"
        onClick={(event) => {
          const target = event.target as HTMLElement;
          if (target.closest(".card, .detail, .graph-modal")) return;
          setHoveredPaper(null);
          onSelectPaper(null);
          setManualOpen(false);
        }}
      >
        <div className="scroller" ref={scrollerRef}>
          <div className="timeline" onMouseLeave={() => setHoveredPaper(null)}>
            {years.map(([year, yearPapers]) => {
              const visible = sortWithinYear(yearPapers);
              const months = visible.map(venueMonth);
              const monthRange = visible.length ? `${MONTHS[Math.min(...months)]}-${MONTHS[Math.max(...months)]}` : "-";
              return (
                <section className="year" data-screen-label={`Year ${year}`} key={year}>
                  <div className="year-head">
                    <div className="yr">{year}</div>
                    <div className="yr-sub">
                      filed · {String(visible.length).padStart(2, "0")} papers
                      <br />
                      {monthRange}
                    </div>
                  </div>
                  <div className="stack">
                    {visible.map((paper, index) => (
                      <PaperCard
                        activeId={displayPaper?.key}
                        anyActive={Boolean(displayPaper)}
                        index={index + 1}
                        key={paper.key}
                        linkedBuilds={linkedBuilds}
                        linkedCited={linkedCited}
                        onClick={(item) => {
                          const alreadyPinned = selectedPaper?.key === item.key;
                          onSelectPaper(alreadyPinned ? null : item);
                          setManualOpen(!alreadyPinned);
                        }}
                        onHover={setHoveredPaper}
                        onLeave={() => setHoveredPaper(null)}
                        paper={paper}
                        pinnedId={selectedPaper?.key}
                      />
                    ))}
                  </div>
                </section>
              );
            })}
          </div>
        </div>

        <DetailPanel
          edges={edges}
          onClose={() => {
            setHoveredPaper(null);
            onSelectPaper(null);
            setManualOpen(false);
          }}
          onJumpTo={jumpToPaper}
          onOpenGraph={() => {
            if (displayPaper) setGraphOpen(true);
          }}
          onUnpin={() => {
            onSelectPaper(null);
            setManualOpen(false);
          }}
          open={detailOpen}
          paper={detailOpen ? displayPaper : null}
          papersByKey={papersByKey}
          pinned={Boolean(selectedPaper && displayPaper?.key === selectedPaper.key)}
        />

        {graphOpen && displayPaper ? (
          <Suspense
            fallback={
              <div className="graph-modal" role="dialog" aria-label="Loading citation graph">
                <div className="graph-loading">Loading citation graph</div>
              </div>
            }
          >
            <CitationGraphModal
              edges={edges}
              onClose={() => setGraphOpen(false)}
              onSelectPaper={(paper) => {
                setHoveredPaper(null);
                onSelectPaper(paper);
              }}
              papers={papers}
              selectedPaper={displayPaper}
            />
          </Suspense>
        ) : null}

        <div className="caption">Figure 3-1. Citation Index - 3D Localization Archive</div>
      </div>
      <div className="plinth" />
    </div>
  );
}

function SearchIcon() {
  return (
    <svg aria-hidden="true" height="13" viewBox="0 0 24 24" width="13">
      <path d="m21 21-4.3-4.3M10.8 18a7.2 7.2 0 1 1 0-14.4 7.2 7.2 0 0 1 0 14.4Z" fill="none" stroke="currentColor" strokeLinecap="round" strokeWidth="2" />
    </svg>
  );
}
