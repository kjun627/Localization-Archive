import Graph from "graphology";
import Sigma from "sigma";
import { useEffect, useRef } from "react";
import type { GraphEdge, GraphNode } from "../types";

type GraphCanvasProps = {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNodeKey: string | null;
  onSelectNode: (node: GraphNode) => void;
};

export function GraphCanvas({ nodes, edges, selectedNodeKey, onSelectNode }: GraphCanvasProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const sigmaRef = useRef<Sigma | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const graph = new Graph();

    nodes.forEach((node) => {
      graph.addNode(node.key, {
        ...node,
        label: node.label,
        size: selectedNodeKey === node.key ? node.size * 1.25 : node.size,
        color: node.color,
      });
    });

    edges.forEach((edge) => {
      if (graph.hasNode(edge.source) && graph.hasNode(edge.target)) {
        graph.addEdge(edge.source, edge.target, {
          key: edge.key,
          size: edge.type === "cites" ? 1 : 2,
          color: edge.type === "cites" ? "rgba(125, 249, 255, 0.18)" : "rgba(72, 231, 168, 0.28)",
          type: "line",
        });
      }
    });

    const sigma = new Sigma(graph, containerRef.current, {
      renderLabels: false,
      allowInvalidContainer: true,
      defaultNodeType: "circle",
      labelDensity: 0.07,
      labelGridCellSize: 120,
      labelRenderedSizeThreshold: 18,
      zIndex: true,
    });

    sigma.on("clickNode", ({ node }) => {
      const selected = nodes.find((item) => item.key === node);
      if (selected) onSelectNode(selected);
    });

    sigmaRef.current = sigma;

    return () => {
      sigma.kill();
      sigmaRef.current = null;
    };
  }, [edges, nodes, onSelectNode, selectedNodeKey]);

  return <div className="graph-surface" ref={containerRef} />;
}

