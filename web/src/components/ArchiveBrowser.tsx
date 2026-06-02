import { lazy, Suspense, useEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from "react";
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
const VENUE_DRAG_DELAY_MS = 260;

const CitationGraphModal = lazy(() =>
  import("./CitationGraphModal").then((module) => ({ default: module.CitationGraphModal })),
);

const VENUE_THEME: Record<string, string> = {
  BMVC: "#e83e8c",
  CVPR: "#3182f6",
  AAAI: "#7048e8",
  ICRA: "#7c5cff",
  IROS: "#795548",
  ICCV: "#191f28",
  ECCV: "#00a76f",
  NeurIPS: "#f04452",
  TPAMI: "#c92a2a",
  IJCV: "#087f5b",
  PR: "#64748b",
  RAL: "#0f766e",
  WACV: "#00b8d9",
  "3DV": "#fe9800",
  IVC: "#7c2d12",
  FILE: "#495057",
  OTHER: "#6b7684",
};

const VENUE_ORDER = [
  "CVPR",
  "ECCV",
  "ICCV",
  "NeurIPS",
  "AAAI",
  "WACV",
  "3DV",
  "BMVC",
  "ICRA",
  "IROS",
  "TPAMI",
  "IJCV",
  "RAL",
  "PR",
  "IVC",
  "OTHER",
  "FILE",
];

function venueCode(paper: GraphNode) {
  const venue = paper.metadata?.venue ?? "Unknown";
  if (venue.includes("Computer Vision and Pattern Recognition")) return "CVPR";
  if (venue.includes("European Conference on Computer Vision")) return "ECCV";
  if (venue.includes("International Conference on Computer Vision")) return "ICCV";
  if (venue.includes("Neural Information Processing Systems")) return "NeurIPS";
  if (venue.includes("AAAI")) return "AAAI";
  if (venue.includes("Winter Conference on Applications of Computer Vision")) return "WACV";
  if (venue.includes("3D Vision")) return "3DV";
  if (venue.includes("British Machine Vision Conference")) return "BMVC";
  if (venue.includes("Robotics and Automation Letters")) return "RAL";
  if (venue.includes("Robotics and Automation")) return "ICRA";
  if (venue.includes("Intelligent Robots and Systems")) return "IROS";
  if (venue.includes("Pattern Analysis and Machine Intelligence")) return "TPAMI";
  if (venue.includes("International Journal of Computer Vision")) return "IJCV";
  if (venue.includes("Pattern Recognition")) return "PR";
  if (venue.includes("Image and Vision Computing")) return "IVC";
  return "OTHER";
}

function venueMonth(paper: GraphNode) {
  const venue = venueCode(paper);
  if (venue === "CVPR") return 6;
  if (venue === "ICCV") return 10;
  if (venue === "ECCV") return 9;
  if (venue === "NeurIPS") return 12;
  if (venue === "AAAI") return 2;
  if (venue === "WACV") return 1;
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

type SourceLink = NonNullable<NonNullable<GraphNode["metadata"]>["sourceLinks"]>[number];
type LinkSlot = {
  label: "Paper" | "Code" | "Project";
  url?: string;
};

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

function isCodeLink(link: SourceLink) {
  const label = link.label.toLowerCase();
  return label.includes("code");
}

function isProjectLink(link: SourceLink) {
  const label = link.label.toLowerCase();
  return label.includes("project");
}

function normalizeSourceLinks(links: SourceLink[] | undefined): LinkSlot[] {
  const paperLinks = (links ?? []).filter(isPaperLink).sort((left, right) => paperLinkPriority(left) - paperLinkPriority(right));
  const codeLink = (links ?? []).find(isCodeLink);
  const projectLink = (links ?? []).find(isProjectLink);
  return [
    { label: "Paper", url: paperLinks[0]?.url },
    { label: "Code", url: codeLink?.url },
    { label: "Project", url: projectLink?.url },
  ];
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

function venueSortIndex(venue: string) {
  const index = VENUE_ORDER.indexOf(venue);
  return index === -1 ? VENUE_ORDER.length : index;
}

function reorderVenue(source: string, target: string, order: string[]) {
  if (source === target) return order;
  if (!order.includes(source) || !order.includes(target)) return order;
  const withoutSource = order.filter((venue) => venue !== source);
  const targetIndex = withoutSource.indexOf(target);
  const next = [...withoutSource];
  next.splice(targetIndex, 0, source);
  return next;
}

function sameOrder(left: string[], right: string[]) {
  return left.length === right.length && left.every((item, index) => item === right[index]);
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
  compareBaseId?: string;
  compareMode?: boolean;
  compareTargetId?: string | null;
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
  compareBaseId,
  compareMode,
  compareTargetId,
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
    compareMode && paper.key !== compareBaseId && "compare-candidate",
    compareMode && paper.key === compareBaseId && "compare-base-card",
    compareTargetId === paper.key && "compare-target-card",
    anyActive && !compareMode && compareTargetId !== paper.key && activeId !== paper.key && !linkedBuild && !linkedCite && "dim",
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
  compareMode?: boolean;
  comparePaired?: boolean;
  compareRole?: "source" | "target";
  placement?: "compare-source" | "compare-target";
  onClose: () => void;
  onClearCompare: () => void;
  onOpenGraph: () => void;
  onStartCompare: (paper: GraphNode) => void;
  onUnpin: () => void;
  onJumpTo: (key: string) => void;
};

function DetailPanel({
  paper,
  open,
  pinned,
  edges,
  papersByKey,
  compareMode = false,
  comparePaired = false,
  compareRole,
  placement,
  onClose,
  onClearCompare,
  onOpenGraph,
  onStartCompare,
  onUnpin,
  onJumpTo,
}: DetailProps) {
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
  const compareActive = compareMode || comparePaired || compareRole === "target";
  const compareLabel =
    compareRole === "target"
      ? "Close compare"
      : compareMode
        ? "Cancel compare"
        : comparePaired
          ? "Change compare"
          : "Compare card";
  const compareAction = () => {
    if (compareRole === "target" || compareMode) {
      onClearCompare();
      return;
    }
    onStartCompare(paper);
  };

  return (
    <aside
      className={`detail ${pinned ? "pinned" : ""} ${placement ?? ""} ${compareRole ? `compare-${compareRole}` : ""}`}
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
          {compareRole ? ` · ${compareRole}` : ""}
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

      <div className="fig">
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

        <div className="detail-actions">
          <button className="graph-link" onClick={onOpenGraph} type="button">
            View citation graph
          </button>
          <button
            className={`compare-link ${compareActive ? "active" : ""}`}
            onClick={compareAction}
            type="button"
          >
            {compareLabel}
          </button>
        </div>

        <div className="links">
          {sourceLinks.map((link) => (
            link.url ? (
              <a href={link.url} key={link.label} rel="noopener noreferrer" target="_blank">
                {link.label} <span className="arr">open</span>
              </a>
            ) : (
              <span className="missing-link" key={link.label}>
                {link.label} <span className="arr">missing</span>
              </span>
            )
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
  const [graphPaper, setGraphPaper] = useState<GraphNode | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareTargetKey, setCompareTargetKey] = useState<string | null>(null);
  const [venueTabOrder, setVenueTabOrder] = useState<string[]>([]);
  const [draggingVenue, setDraggingVenue] = useState<string | null>(null);
  const [venueDropTarget, setVenueDropTarget] = useState<string | null>(null);
  const scrollerRef = useRef<HTMLDivElement>(null);
  const venueDragRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    timeoutId: number | null;
    venue: string;
  } | null>(null);
  const lastVenueDragEndRef = useRef(0);
  const papersByKey = useMemo(() => new Map(papers.map((paper) => [paper.key, paper])), [papers]);
  const compareTargetPaper = compareTargetKey ? papersByKey.get(compareTargetKey) ?? null : null;

  const clearCompare = () => {
    setCompareMode(false);
    setCompareTargetKey(null);
  };

  const startCompare = (paper: GraphNode) => {
    setHoveredPaper(null);
    onSelectPaper(paper);
    setManualOpen(true);
    setCompareTargetKey(null);
    setCompareMode(true);
  };

  const openGraphFor = (paper: GraphNode | null) => {
    if (!paper) return;
    setGraphPaper(paper);
    setGraphOpen(true);
  };

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

  const venueCounts = useMemo(
    () =>
      papers.reduce<Record<string, number>>((counts, paper) => {
        const venue = venueCode(paper);
        counts[venue] = (counts[venue] ?? 0) + 1;
        return counts;
      }, {}),
    [papers],
  );
  const availableVenues = useMemo(
    () => Object.keys(venueCounts).sort((left, right) => venueSortIndex(left) - venueSortIndex(right) || left.localeCompare(right)),
    [venueCounts],
  );

  useEffect(() => {
    setVenueTabOrder((current) => {
      const retained = current.filter((venue) => venue in venueCounts);
      const added = availableVenues.filter((venue) => !retained.includes(venue));
      const next = [...retained, ...added];
      return sameOrder(current, next) ? current : next;
    });
  }, [availableVenues, venueCounts]);

  useEffect(() => {
    const endVenueDrag = (event?: PointerEvent) => {
      const session = venueDragRef.current;
      if (!session) return;
      if (session.timeoutId !== null) {
        window.clearTimeout(session.timeoutId);
      }
      const wasActive = session.active;
      venueDragRef.current = null;
      if (wasActive) {
        event?.preventDefault();
        lastVenueDragEndRef.current = Date.now();
      }
      setDraggingVenue(null);
      setVenueDropTarget(null);
      document.body.classList.remove("venue-tab-dragging");
    };

    const onPointerMove = (event: PointerEvent) => {
      const session = venueDragRef.current;
      if (!session) return;
      const distance = Math.hypot(event.clientX - session.startX, event.clientY - session.startY);
      if (!session.active && distance > 8) {
        endVenueDrag();
        return;
      }
      if (!session.active) return;
      event.preventDefault();
      const target = document.elementFromPoint(event.clientX, event.clientY) as HTMLElement | null;
      const targetVenue = target?.closest<HTMLElement>("[data-venue-tab]")?.dataset.venueTab;
      if (!targetVenue || targetVenue === session.venue) return;
      setVenueDropTarget(targetVenue);
      setVenueTabOrder((current) => reorderVenue(session.venue, targetVenue, current));
    };

    const onPointerUp = (event: PointerEvent) => endVenueDrag(event);
    const onPointerCancel = (event: PointerEvent) => endVenueDrag(event);

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      const session = venueDragRef.current;
      if (session && session.timeoutId !== null) window.clearTimeout(session.timeoutId);
      venueDragRef.current = null;
      document.body.classList.remove("venue-tab-dragging");
    };
  }, []);

  const beginVenuePress = (event: ReactPointerEvent<HTMLElement>, venue: string) => {
    if (event.button !== 0) return;
    const session = {
      active: false,
      startX: event.clientX,
      startY: event.clientY,
      timeoutId: null as number | null,
      venue,
    };
    session.timeoutId = window.setTimeout(() => {
      session.active = true;
      setDraggingVenue(venue);
      setVenueDropTarget(venue);
      document.body.classList.add("venue-tab-dragging");
    }, VENUE_DRAG_DELAY_MS);
    venueDragRef.current = session;
  };

  const orderedVenueEntries = (venueTabOrder.length ? venueTabOrder : availableVenues)
    .filter((venue) => venue in venueCounts)
    .map((venue) => [venue, venueCounts[venue]] as const);

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
  const compareActive = compareMode || Boolean(compareTargetPaper);
  const displayPaper = compareActive ? selectedPaper : hoveredPaper ?? selectedPaper;
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
    clearCompare();
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
          clearCompare();
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
          <div className="toggles" data-reordering={Boolean(draggingVenue)}>
            {orderedVenueEntries.map(([venue, count]) => (
              <div
                className="toggle"
                data-dragging={draggingVenue === venue || undefined}
                data-drop-target={venueDropTarget === venue && draggingVenue !== venue ? true : undefined}
                data-on={activeVenues[venue] !== false}
                data-venue-tab={venue}
                key={venue}
                onClick={(event) => {
                  if (Date.now() - lastVenueDragEndRef.current < 350) {
                    event.preventDefault();
                    return;
                  }
                  onToggleVenue(venue);
                }}
                onPointerDown={(event) => beginVenuePress(event, venue)}
                style={{ "--tone": VENUE_THEME[venue] ?? VENUE_THEME.FILE } as CSSProperties}
                title={`${venue} - ${count} papers. Long-press and drag to reorder.`}
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
          if (target.closest(".card, .detail, .graph-modal, .compare-prompt")) return;
          setHoveredPaper(null);
          onSelectPaper(null);
          setManualOpen(false);
          clearCompare();
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
                        compareBaseId={selectedPaper?.key}
                        compareMode={compareMode}
                        compareTargetId={compareTargetKey}
                        index={index + 1}
                        key={paper.key}
                        linkedBuilds={linkedBuilds}
                        linkedCited={linkedCited}
                        onClick={(item) => {
                          if (compareMode && selectedPaper) {
                            if (item.key === selectedPaper.key) return;
                            setHoveredPaper(null);
                            setCompareTargetKey(item.key);
                            setCompareMode(false);
                            setManualOpen(true);
                            return;
                          }
                          const alreadyPinned = selectedPaper?.key === item.key;
                          clearCompare();
                          onSelectPaper(alreadyPinned ? null : item);
                          setManualOpen(!alreadyPinned);
                        }}
                        onHover={compareActive ? () => undefined : setHoveredPaper}
                        onLeave={() => {
                          if (!compareActive) setHoveredPaper(null);
                        }}
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

        {compareMode && selectedPaper ? (
          <div className="compare-prompt">
            <span>Compare mode</span>
            <strong>Select another paper card</strong>
            <button onClick={clearCompare} type="button">
              Cancel
            </button>
          </div>
        ) : null}

        <DetailPanel
          compareMode={compareMode}
          comparePaired={Boolean(compareTargetPaper)}
          compareRole={compareTargetPaper || compareMode ? "source" : undefined}
          edges={edges}
          onClearCompare={clearCompare}
          onClose={() => {
            setHoveredPaper(null);
            onSelectPaper(null);
            setManualOpen(false);
            clearCompare();
          }}
          onJumpTo={jumpToPaper}
          onOpenGraph={() => openGraphFor(displayPaper)}
          onStartCompare={startCompare}
          onUnpin={() => {
            onSelectPaper(null);
            setManualOpen(false);
            clearCompare();
          }}
          open={detailOpen}
          paper={detailOpen ? displayPaper : null}
          papersByKey={papersByKey}
          pinned={Boolean(selectedPaper && displayPaper?.key === selectedPaper.key)}
        />

        {compareTargetPaper ? (
          <DetailPanel
            comparePaired
            compareRole="target"
            edges={edges}
            onClearCompare={clearCompare}
            onClose={clearCompare}
            onJumpTo={jumpToPaper}
            onOpenGraph={() => openGraphFor(compareTargetPaper)}
            onStartCompare={startCompare}
            onUnpin={clearCompare}
            open
            paper={compareTargetPaper}
            papersByKey={papersByKey}
            pinned={false}
            placement="compare-target"
          />
        ) : null}

        {graphOpen && graphPaper ? (
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
                clearCompare();
                setHoveredPaper(null);
                onSelectPaper(paper);
              }}
              papers={papers}
              selectedPaper={graphPaper}
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
