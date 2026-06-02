import { useEffect, useMemo, useRef, useState } from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import type { GraphEdge, GraphNode } from "../types";

type CitationGraphModalProps = {
  edges: GraphEdge[];
  onClose: () => void;
  onSelectPaper: (paper: GraphNode) => void;
  papers: GraphNode[];
  selectedPaper: GraphNode;
};

type CitationNode = {
  citedBy: number;
  cites: number;
  downstream: number;
  group: "selected" | "ancestor" | "descendant" | "context";
  id: string;
  influence: number;
  paper: GraphNode;
  rank: number;
  title: string;
  venue: string;
  year: number;
};

type CitationLink = {
  advance?: string;
  id: string;
  source: string | number | NodeObject<CitationNode>;
  target: string | number | NodeObject<CitationNode>;
};

const NODE_COLOR: Record<CitationNode["group"], string> = {
  ancestor: "#ff9f1a",
  context: "#6b7684",
  descendant: "#00a76f",
  selected: "#3182f6",
};

const VENUE_COLOR: Record<string, string> = {
  "3DV": "#fe9800",
  BMVC: "#e83e8c",
  CVPR: "#3182f6",
  ECCV: "#00a76f",
  FILE: "#6b7684",
  IJCV: "#f04452",
  ICCV: "#191f28",
  ICRA: "#8b3ddb",
  IVC: "#8b3ddb",
  OTHER: "#6b7684",
  PR: "#00a76f",
  RAL: "#8b3ddb",
  TPAMI: "#f04452",
};

function escapeHtml(value: string | number | undefined) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

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

function countReachable(startKey: string, citedByIndex: Map<string, string[]>) {
  const seen = new Set<string>();
  const queue = [...(citedByIndex.get(startKey) ?? [])];
  while (queue.length) {
    const key = queue.shift();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    queue.push(...(citedByIndex.get(key) ?? []));
  }
  return seen.size;
}

function computePageRank(paperKeys: string[], citesIndex: Map<string, string[]>) {
  const damping = 0.85;
  const count = Math.max(1, paperKeys.length);
  let rank = new Map(paperKeys.map((key) => [key, 1 / count]));

  for (let iteration = 0; iteration < 48; iteration += 1) {
    const next = new Map(paperKeys.map((key) => [key, (1 - damping) / count]));
    paperKeys.forEach((source) => {
      const targets = citesIndex.get(source) ?? [];
      const sourceRank = rank.get(source) ?? 0;
      if (!targets.length) {
        const share = (damping * sourceRank) / count;
        paperKeys.forEach((key) => next.set(key, (next.get(key) ?? 0) + share));
        return;
      }
      const share = (damping * sourceRank) / targets.length;
      targets.forEach((target) => next.set(target, (next.get(target) ?? 0) + share));
    });
    rank = next;
  }

  return rank;
}

function normalizedLog(value: number, maxValue: number) {
  if (maxValue <= 0) return 0;
  return Math.log1p(value) / Math.log1p(maxValue);
}

function influenceColor(node: CitationNode) {
  if (node.group === "selected") return NODE_COLOR.selected;
  if (node.influence >= 0.72) return "#f7bd61";
  if (node.influence >= 0.48) return "#f59f56";
  if (node.influence >= 0.28) return node.group === "descendant" ? "#5be1ca" : "#8fd3ff";
  return VENUE_COLOR[node.venue] ?? NODE_COLOR[node.group];
}

function buildCitationGraph(papers: GraphNode[], edges: GraphEdge[], selectedKey: string) {
  const paperByKey = new Map(papers.filter((paper) => paper.type === "paper").map((paper) => [paper.key, paper]));
  const citationEdges = edges.filter(
    (edge) => edge.type === "cites" && paperByKey.has(edge.source) && paperByKey.has(edge.target),
  );
  const paperKeys = Array.from(paperByKey.keys());
  const citesIndex = new Map<string, string[]>();
  const citedByIndex = new Map<string, string[]>();
  citationEdges.forEach((edge) => {
    citesIndex.set(edge.source, [...(citesIndex.get(edge.source) ?? []), edge.target]);
    citedByIndex.set(edge.target, [...(citedByIndex.get(edge.target) ?? []), edge.source]);
  });
  const pageRank = computePageRank(paperKeys, citesIndex);
  const rawMetrics = new Map(
    paperKeys.map((key) => [
      key,
      {
        citedBy: citedByIndex.get(key)?.length ?? 0,
        cites: citesIndex.get(key)?.length ?? 0,
        downstream: countReachable(key, citedByIndex),
        rank: pageRank.get(key) ?? 0,
      },
    ]),
  );
  const maxCitedBy = Math.max(0, ...Array.from(rawMetrics.values()).map((metric) => metric.citedBy));
  const maxDownstream = Math.max(0, ...Array.from(rawMetrics.values()).map((metric) => metric.downstream));
  const maxRank = Math.max(0, ...Array.from(rawMetrics.values()).map((metric) => metric.rank));

  const ancestors = new Set(citationEdges.filter((edge) => edge.source === selectedKey).map((edge) => edge.target));
  const descendants = new Set(citationEdges.filter((edge) => edge.target === selectedKey).map((edge) => edge.source));

  const nodes: CitationNode[] = Array.from(paperByKey.values())
    .sort((left, right) => (right.metadata?.year ?? 0) - (left.metadata?.year ?? 0) || left.label.localeCompare(right.label))
    .map((paper) => {
      let group: CitationNode["group"] = "context";
      if (paper.key === selectedKey) group = "selected";
      else if (ancestors.has(paper.key)) group = "ancestor";
      else if (descendants.has(paper.key)) group = "descendant";
      const metrics = rawMetrics.get(paper.key) ?? { citedBy: 0, cites: 0, downstream: 0, rank: 0 };
      const rankScore = maxRank > 0 ? metrics.rank / maxRank : 0;
      const citedByScore = normalizedLog(metrics.citedBy, maxCitedBy);
      const downstreamScore = normalizedLog(metrics.downstream, maxDownstream);
      const influence = Math.min(1, rankScore * 0.55 + citedByScore * 0.3 + downstreamScore * 0.15);
      return {
        citedBy: metrics.citedBy,
        cites: metrics.cites,
        downstream: metrics.downstream,
        group,
        id: paper.key,
        influence,
        paper,
        rank: metrics.rank,
        title: paper.label,
        venue: venueCode(paper),
        year: paper.metadata?.year ?? 0,
      };
    });

  const links: CitationLink[] = citationEdges.map((edge) => ({
    advance: edge.metadata?.sourceAdvance,
    id: edge.key,
    source: edge.source,
    target: edge.target,
  }));

  const topInfluence = nodes.reduce<CitationNode | null>(
    (top, node) => (!top || node.influence > top.influence ? node : top),
    null,
  );

  return { ancestors, descendants, links, nodes, topInfluence };
}

function nodeLabel(node: NodeObject<CitationNode>) {
  return `
    <div class="graph-tooltip">
      <b>${escapeHtml(node.title)}</b>
      <span>${escapeHtml(node.venue)} ${escapeHtml(node.year)} · impact ${Math.round(node.influence * 100)}</span>
      <span>${node.citedBy} cited-by · ${node.downstream} downstream · ${node.cites} cites</span>
      <small>${escapeHtml(node.group)} · PageRank ${node.rank.toFixed(3)}</small>
    </div>
  `;
}

function linkLabel(link: LinkObject<CitationNode, CitationLink>) {
  const source = typeof link.source === "object" ? link.source.title : link.source;
  const target = typeof link.target === "object" ? link.target.title : link.target;
  return `
    <div class="graph-tooltip">
      <b>${escapeHtml(source)} cites ${escapeHtml(target)}</b>
      <span>${escapeHtml(link.advance ?? "citation relation")}</span>
    </div>
  `;
}

function linkEndpointId(endpoint: CitationLink["source"]) {
  return typeof endpoint === "object" ? String(endpoint.id) : String(endpoint);
}

function relationLabel(node: CitationNode | undefined, selectedKey: string) {
  if (!node) return "No node selected";
  if (node.id === selectedKey) return "Focal paper";
  if (node.group === "ancestor") return "Foundation cited by focal";
  if (node.group === "descendant") return "Downstream paper citing focal";
  return "Archive context";
}

export function CitationGraphModal({ edges, onClose, onSelectPaper, papers, selectedPaper }: CitationGraphModalProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const graphRef = useRef<ForceGraphMethods<CitationNode, CitationLink>>();
  const [canvasSize, setCanvasSize] = useState({ height: 1, width: 1 });
  const [hoverLabel, setHoverLabel] = useState(selectedPaper.label);
  const [activeNodeId, setActiveNodeId] = useState<string | null>(selectedPaper.key);
  const graph = useMemo(() => buildCitationGraph(papers, edges, selectedPaper.key), [edges, papers, selectedPaper.key]);

  useEffect(() => {
    const element = hostRef.current;
    if (!element) return;
    const updateSize = () => {
      const bounds = element.getBoundingClientRect();
      setCanvasSize({
        height: Math.max(1, Math.floor(bounds.height)),
        width: Math.max(1, Math.floor(bounds.width)),
      });
    };
    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setHoverLabel(selectedPaper.label);
    setActiveNodeId(selectedPaper.key);
  }, [selectedPaper.key, selectedPaper.label]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      graphRef.current?.zoomToFit(700, 80, (node) => {
        const paperNode = node as NodeObject<CitationNode>;
        return paperNode.group !== "context" || paperNode.id === selectedPaper.key;
      });
    }, 450);
    return () => window.clearTimeout(timer);
  }, [graph.nodes, selectedPaper.key]);

  const activeNode = useMemo(
    () => (activeNodeId ? graph.nodes.find((node) => node.id === activeNodeId) : undefined),
    [activeNodeId, graph.nodes, selectedPaper.key],
  );

  const nodeContext = useMemo(() => {
    const nodeById = new Map(graph.nodes.map((node) => [node.id, node]));
    const incoming = graph.links
      .filter((link) => linkEndpointId(link.target) === activeNode?.id)
      .map((link) => nodeById.get(linkEndpointId(link.source)))
      .filter((node): node is CitationNode => Boolean(node));
    const outgoing = graph.links
      .filter((link) => linkEndpointId(link.source) === activeNode?.id)
      .map((link) => nodeById.get(linkEndpointId(link.target)))
      .filter((node): node is CitationNode => Boolean(node));
    const impactRank = [...graph.nodes].sort((left, right) => right.influence - left.influence).findIndex((node) => node.id === activeNode?.id) + 1;
    const percentile = graph.nodes.length && impactRank > 0 ? Math.round(((graph.nodes.length - impactRank + 1) / graph.nodes.length) * 100) : 0;
    return { impactRank, incoming, outgoing, percentile };
  }, [activeNode?.id, graph.links, graph.nodes]);

  const stats = useMemo(
    () => ({
      incoming: graph.descendants.size,
      outgoing: graph.ancestors.size,
      selectedNode: graph.nodes.find((node) => node.id === selectedPaper.key),
      topInfluence: graph.topInfluence,
      totalLinks: graph.links.length,
      totalPapers: graph.nodes.length,
    }),
    [graph],
  );

  return (
    <div className="graph-modal" role="dialog" aria-label="Paper citation graph" onClick={onClose}>
      <div className="graph-shell" onClick={(event) => event.stopPropagation()}>
        <header className="graph-head">
          <div>
            <span>Paper-to-paper citation graph</span>
            <h2>{selectedPaper.label}</h2>
          </div>
          <div className="graph-head-actions">
            <span>{stats.totalPapers} papers / {stats.totalLinks} links</span>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="graph-canvas" ref={hostRef}>
          <ForceGraph3D<CitationNode, CitationLink>
            ref={graphRef}
            backgroundColor="#fbfcfe"
            cooldownTicks={120}
            d3AlphaDecay={0.018}
            d3VelocityDecay={0.22}
            enableNodeDrag
            graphData={graph}
            height={canvasSize.height}
            linkColor={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return "#191f28";
              if (sourceId === selectedPaper.key) return "#ff9f1a";
              if (targetId === selectedPaper.key) return "#00a76f";
              return "#98a2b3";
            }}
            linkDirectionalArrowLength={3}
            linkDirectionalArrowColor={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return "#191f28";
              if (sourceId === selectedPaper.key) return "#ff9f1a";
              if (targetId === selectedPaper.key) return "#00a76f";
              return "#98a2b3";
            }}
            linkDirectionalArrowRelPos={1}
            linkDirectionalParticles={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return 3;
              return sourceId === selectedPaper.key || targetId === selectedPaper.key ? 2 : 0;
            }}
            linkDirectionalParticleColor={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return "#191f28";
              if (sourceId === selectedPaper.key) return "#ff9f1a";
              if (targetId === selectedPaper.key) return "#00a76f";
              return "#98a2b3";
            }}
            linkDirectionalParticleSpeed={0.008}
            linkDirectionalParticleWidth={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return 3.4;
              return sourceId === selectedPaper.key || targetId === selectedPaper.key ? 2.4 : 0;
            }}
            linkLabel={linkLabel}
            linkOpacity={0.46}
            linkWidth={(link) => {
              const sourceId = linkEndpointId(link.source);
              const targetId = linkEndpointId(link.target);
              if (sourceId === activeNode?.id || targetId === activeNode?.id) return 2.4;
              return sourceId === selectedPaper.key || targetId === selectedPaper.key ? 1.5 : 0.45;
            }}
            nodeColor={(node) => (node.id === activeNode?.id ? "#191f28" : influenceColor(node))}
            nodeLabel={nodeLabel}
            nodeOpacity={0.96}
            nodeRelSize={5}
            nodeResolution={24}
            nodeVal={(node) => {
              const impactValue = 1.8 + node.influence * 12;
              if (node.id === activeNode?.id) return Math.max(11, impactValue + 3);
              if (node.group === "selected") return Math.max(9, impactValue);
              if (node.group === "ancestor" || node.group === "descendant") return Math.max(5.4, impactValue);
              return impactValue;
            }}
            onBackgroundClick={(event) => {
              event.stopPropagation();
              setActiveNodeId(null);
              setHoverLabel(selectedPaper.label);
            }}
            onNodeClick={(node, event) => {
              event.stopPropagation();
              setActiveNodeId(String(node.id));
              setHoverLabel(node.title);
            }}
            onNodeHover={(node) => setHoverLabel(node?.title ?? selectedPaper.label)}
            showNavInfo={false}
            showPointerCursor
            width={canvasSize.width}
          />
          <div className="graph-legend">
            <span><i className="legend-selected" />focal</span>
            <span><i className="legend-prior" />cited by focal</span>
            <span><i className="legend-next" />cites focal</span>
            <span><i className="legend-active" />selected</span>
            {stats.topInfluence ? (
              <span>Top impact: {Math.round(stats.topInfluence.influence * 100)}</span>
            ) : null}
          </div>
        </div>

        <footer className="graph-status">
          <span>{relationLabel(activeNode, selectedPaper.key)}</span>
          <span>impact {Math.round((activeNode?.influence ?? 0) * 100)}</span>
          <span>rank {nodeContext.impactRank ? `#${nodeContext.impactRank}` : "-"} / {graph.nodes.length}</span>
          <span>cites {activeNode?.cites ?? 0}</span>
          <span>cited by {activeNode?.citedBy ?? 0}</span>
          <strong>{activeNode?.title ?? hoverLabel}</strong>
          {activeNode && activeNode.id !== selectedPaper.key ? (
            <button onClick={() => onSelectPaper(activeNode.paper)} type="button">
              Focus
            </button>
          ) : null}
        </footer>
      </div>
    </div>
  );
}
