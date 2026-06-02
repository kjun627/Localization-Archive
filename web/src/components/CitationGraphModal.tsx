import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import ForceGraph3D, {
  type ForceGraphMethods,
  type LinkObject,
  type NodeObject,
} from "react-force-graph-3d";
import * as THREE from "three";
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
  AAAI: "#7048e8",
  BMVC: "#e83e8c",
  CVPR: "#3182f6",
  ECCV: "#00a76f",
  FILE: "#6b7684",
  IJCV: "#087f5b",
  ICCV: "#191f28",
  ICRA: "#7c5cff",
  IROS: "#795548",
  IVC: "#7c2d12",
  NeurIPS: "#f04452",
  OTHER: "#6b7684",
  PR: "#64748b",
  RAL: "#0f766e",
  TPAMI: "#c92a2a",
  WACV: "#00b8d9",
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

function hashString(value: string) {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index);
    hash |= 0;
  }
  return Math.abs(hash);
}

function graphShortTitle(value: string) {
  const source = value.split(":")[0] || value;
  return source.length > 34 ? `${source.slice(0, 31)}...` : source;
}

function makeHaloSprite(color: string, size: number, opacity: number) {
  const canvas = document.createElement("canvas");
  canvas.width = 128;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  const gradient = context.createRadialGradient(64, 64, 8, 64, 64, 62);
  gradient.addColorStop(0, color);
  gradient.addColorStop(0.28, `${color}88`);
  gradient.addColorStop(0.72, `${color}22`);
  gradient.addColorStop(1, `${color}00`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, 128, 128);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    depthWrite: false,
    map: texture,
    opacity,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(size, size, 1);
  return sprite;
}

function makeTextSprite(text: string, color: string, strong: boolean) {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 128;
  const context = canvas.getContext("2d");
  if (!context) return undefined;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = "rgba(255,255,255,0.92)";
  context.strokeStyle = strong ? color : "rgba(25,31,40,0.36)";
  context.lineWidth = strong ? 5 : 3;
  context.beginPath();
  context.roundRect(10, 24, 492, 70, 8);
  context.fill();
  context.stroke();
  context.fillStyle = color;
  context.font = "700 22px Inter, system-ui, sans-serif";
  context.fillText(text, 28, 68, 456);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.SpriteMaterial({
    depthWrite: false,
    map: texture,
    transparent: true,
  });
  const sprite = new THREE.Sprite(material);
  sprite.scale.set(strong ? 26 : 21, strong ? 6.5 : 5.4, 1);
  return sprite;
}

function makeCitationNodeObject(
  node: CitationNode,
  activeNodeId: string | null,
  selectedKey: string,
  activeNeighborIds: Set<string>,
) {
  const isActive = node.id === activeNodeId;
  const isFocal = node.id === selectedKey;
  const isDirect = activeNeighborIds.has(node.id);
  const tone = isActive ? "#191f28" : influenceColor(node);
  const radius = Math.max(
    isActive ? 6.6 : isFocal ? 6.1 : isDirect ? 5.2 : 3.35,
    3.15 + node.influence * 5.8,
  );
  const group = new THREE.Group();

  const halo = makeHaloSprite(tone, radius * (isActive || isFocal ? 7.2 : isDirect ? 5.4 : 3.4), isActive || isFocal ? 0.34 : isDirect ? 0.2 : 0.11);
  if (halo) group.add(halo);

  const shell = new THREE.Mesh(
    new THREE.IcosahedronGeometry(radius, 2),
    new THREE.MeshStandardMaterial({
      color: tone,
      emissive: tone,
      emissiveIntensity: isActive || isFocal ? 0.16 : 0.045,
      metalness: 0.16,
      roughness: 0.46,
    }),
  );
  group.add(shell);

  const inner = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.38, 20, 16),
    new THREE.MeshBasicMaterial({
      color: isActive ? "#ffffff" : isFocal ? "#fdf6dd" : "#ffffff",
      transparent: true,
      opacity: isActive || isFocal ? 0.96 : 0.72,
    }),
  );
  group.add(inner);

  if (isActive || isFocal || isDirect) {
    const ringMaterial = new THREE.MeshBasicMaterial({
      color: tone,
      opacity: isActive || isFocal ? 0.86 : 0.54,
      transparent: true,
    });
    const ring = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.42, Math.max(0.045, radius * 0.035), 10, 72), ringMaterial);
    ring.rotation.x = Math.PI / 2;
    group.add(ring);
    if (isActive || isFocal) {
      const orbit = new THREE.Mesh(new THREE.TorusGeometry(radius * 1.86, Math.max(0.035, radius * 0.025), 8, 84), ringMaterial);
      orbit.rotation.y = Math.PI / 2.7;
      group.add(orbit);
    }
  }

  if (isActive || isFocal || isDirect) {
    const label = makeTextSprite(`${node.venue} '${String(node.year).slice(-2)} · ${graphShortTitle(node.title)}`, tone, isActive || isFocal);
    if (label) {
      label.position.set(0, radius + (isActive || isFocal ? 5.4 : 4.5), 0);
      group.add(label);
    }
  }

  return group;
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

function linkInvolves(link: CitationLink, nodeId: string | null | undefined) {
  if (!nodeId) return false;
  return linkEndpointId(link.source) === nodeId || linkEndpointId(link.target) === nodeId;
}

function linkTone(link: CitationLink, activeId: string | null | undefined, selectedKey: string) {
  const sourceId = linkEndpointId(link.source);
  const targetId = linkEndpointId(link.target);
  if (linkInvolves(link, activeId)) return "#191f28";
  if (sourceId === selectedKey) return "#ff9f1a";
  if (targetId === selectedKey) return "#00a76f";
  return "#8f9bad";
}

function linkCurve(link: CitationLink, activeId: string | null | undefined, selectedKey: string) {
  const base = ((hashString(link.id) % 9) - 4) * 0.028;
  if (linkInvolves(link, activeId)) return base * 1.8 || 0.18;
  if (linkEndpointId(link.source) === selectedKey || linkEndpointId(link.target) === selectedKey) return base * 1.45 || 0.12;
  return base;
}

function linkRotation(link: CitationLink) {
  return ((hashString(`${link.id}:rotation`) % 360) / 180) * Math.PI;
}

function linkParticleCount(link: CitationLink, activeId: string | null | undefined, selectedKey: string) {
  if (linkInvolves(link, activeId)) return 4;
  const sourceId = linkEndpointId(link.source);
  const targetId = linkEndpointId(link.target);
  if (sourceId === selectedKey || targetId === selectedKey) return 2;
  return 0;
}

function selectVisibleLinks(
  nodes: CitationNode[],
  links: CitationLink[],
  selectedKey: string,
  activeId: string | null | undefined,
) {
  const nodeById = new Map(nodes.map((node) => [node.id, node]));
  const visible = new Map<string, CitationLink>();
  const focalNeighborIds = new Set<string>([selectedKey]);

  links.forEach((link) => {
    const sourceId = linkEndpointId(link.source);
    const targetId = linkEndpointId(link.target);
    if (sourceId === selectedKey) focalNeighborIds.add(targetId);
    if (targetId === selectedKey) focalNeighborIds.add(sourceId);
  });

  const add = (link: CitationLink) => visible.set(link.id, link);
  const score = (link: CitationLink) => {
    const source = nodeById.get(linkEndpointId(link.source));
    const target = nodeById.get(linkEndpointId(link.target));
    return (source?.influence ?? 0) + (target?.influence ?? 0);
  };

  links.forEach((link) => {
    if (linkInvolves(link, selectedKey) || linkInvolves(link, activeId)) add(link);
  });

  links
    .filter((link) => {
      if (visible.has(link.id)) return false;
      const sourceId = linkEndpointId(link.source);
      const targetId = linkEndpointId(link.target);
      return focalNeighborIds.has(sourceId) && focalNeighborIds.has(targetId);
    })
    .sort((left, right) => score(right) - score(left))
    .slice(0, 64)
    .forEach(add);

  links
    .filter((link) => !visible.has(link.id))
    .sort((left, right) => score(right) - score(left))
    .slice(0, 72)
    .forEach(add);

  return Array.from(visible.values());
}

function selectVisibleNodes(
  nodes: CitationNode[],
  links: CitationLink[],
  selectedKey: string,
  activeId: string | null | undefined,
) {
  const visibleIds = new Set<string>([selectedKey]);
  if (activeId) visibleIds.add(activeId);
  links.forEach((link) => {
    visibleIds.add(linkEndpointId(link.source));
    visibleIds.add(linkEndpointId(link.target));
  });
  return nodes.filter((node) => visibleIds.has(node.id));
}

function configureGraphForces(
  graphInstance: ForceGraphMethods<CitationNode, CitationLink> | undefined,
  selectedKey: string,
  activeId: string | null | undefined,
) {
  if (!graphInstance) return;
  const charge = graphInstance.d3Force("charge");
  charge?.strength?.((node: CitationNode) => {
    if (node.id === activeId || node.id === selectedKey) return -360;
    if (node.group === "ancestor" || node.group === "descendant") return -240;
    return -150;
  });
  charge?.distanceMin?.(28);
  charge?.distanceMax?.(760);

  const linkForce = graphInstance.d3Force("link");
  linkForce?.distance?.((link: CitationLink) => {
    if (linkInvolves(link, activeId)) return 124;
    if (linkInvolves(link, selectedKey)) return 142;
    return 182;
  });
  linkForce?.strength?.((link: CitationLink) => {
    if (linkInvolves(link, activeId)) return 0.22;
    if (linkInvolves(link, selectedKey)) return 0.16;
    return 0.055;
  });
  linkForce?.iterations?.(1);

  const center = graphInstance.d3Force("center");
  center?.strength?.(0.025);
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

  const activeNeighborIds = useMemo(
    () => new Set([...nodeContext.incoming, ...nodeContext.outgoing].map((node) => node.id)),
    [nodeContext.incoming, nodeContext.outgoing],
  );

  const visibleLinks = useMemo(
    () => selectVisibleLinks(graph.nodes, graph.links, selectedPaper.key, activeNode?.id),
    [activeNode?.id, graph.links, graph.nodes, selectedPaper.key],
  );
  const visibleNodes = useMemo(
    () => selectVisibleNodes(graph.nodes, visibleLinks, selectedPaper.key, activeNode?.id),
    [activeNode?.id, graph.nodes, selectedPaper.key, visibleLinks],
  );
  const visibleGraph = useMemo(
    () => ({ links: visibleLinks, nodes: visibleNodes }),
    [visibleLinks, visibleNodes],
  );

  useEffect(() => {
    const timer = window.setTimeout(() => {
      configureGraphForces(graphRef.current, selectedPaper.key, activeNode?.id);
    }, 80);
    return () => window.clearTimeout(timer);
  }, [activeNode?.id, selectedPaper.key, visibleLinks.length, visibleNodes.length]);

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
            <span>
              showing {visibleNodes.length} of {stats.totalPapers} papers / {visibleLinks.length} of {stats.totalLinks} links
            </span>
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
            graphData={visibleGraph}
            height={canvasSize.height}
            linkColor={(link) => linkTone(link, activeNode?.id, selectedPaper.key)}
            linkCurvature={(link) => linkCurve(link, activeNode?.id, selectedPaper.key)}
            linkCurveRotation={linkRotation}
            linkDirectionalArrowLength={0}
            linkDirectionalParticles={(link) => linkParticleCount(link, activeNode?.id, selectedPaper.key)}
            linkDirectionalParticleColor={(link) => linkTone(link, activeNode?.id, selectedPaper.key)}
            linkDirectionalParticleSpeed={(link) => (linkInvolves(link, activeNode?.id) ? 0.01 : 0.006)}
            linkDirectionalParticleWidth={(link) => {
              if (linkInvolves(link, activeNode?.id)) return 2.3;
              return linkParticleCount(link, activeNode?.id, selectedPaper.key) ? 1.45 : 0;
            }}
            linkLabel={linkLabel}
            linkOpacity={0.36}
            linkResolution={8}
            linkWidth={(link) => {
              if (linkInvolves(link, activeNode?.id)) return 1.22;
              return linkParticleCount(link, activeNode?.id, selectedPaper.key) ? 0.82 : 0.24;
            }}
            nodeLabel={nodeLabel}
            nodeOpacity={0.96}
            nodeRelSize={7}
            nodeResolution={24}
            nodeThreeObject={(node) => makeCitationNodeObject(node, activeNode?.id ?? null, selectedPaper.key, activeNeighborIds)}
            nodeVal={(node) => {
              const impactValue = 3.1 + node.influence * 15;
              if (node.id === activeNode?.id) return Math.max(15, impactValue + 4);
              if (node.group === "selected") return Math.max(13, impactValue);
              if (node.group === "ancestor" || node.group === "descendant") return Math.max(8, impactValue);
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
          {activeNode ? (
            <aside className="graph-node-card" style={{ "--node-tone": influenceColor(activeNode) } as CSSProperties}>
              <span>{relationLabel(activeNode, selectedPaper.key)}</span>
              <strong>{activeNode.title}</strong>
              <div>
                <small>{activeNode.venue} {activeNode.year}</small>
                <small>impact {Math.round(activeNode.influence * 100)}</small>
                <small>rank {nodeContext.impactRank ? `#${nodeContext.impactRank}` : "-"}</small>
              </div>
              <dl>
                <dt>Cites</dt>
                <dd>{activeNode.cites}</dd>
                <dt>Cited by</dt>
                <dd>{activeNode.citedBy}</dd>
                <dt>Direct flow</dt>
                <dd>{nodeContext.outgoing.length} out / {nodeContext.incoming.length} in</dd>
              </dl>
            </aside>
          ) : null}
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
