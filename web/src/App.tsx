import { useEffect, useMemo, useState } from "react";
import { loadGraph } from "./data";
import { DetailsDrawer } from "./components/DetailsDrawer";
import { FiltersPanel } from "./components/FiltersPanel";
import { GraphCanvas } from "./components/GraphCanvas";
import type { GraphNode, GraphPayload, NodeType } from "./types";

const defaultTypes: Record<NodeType, boolean> = {
  paper: true,
  problem: true,
  metric: true,
  dataset: true,
  limitation: true,
};

function App() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [activeTypes, setActiveTypes] = useState(defaultTypes);
  const [yearRange, setYearRange] = useState<[number, number]>([2010, 2026]);

  useEffect(() => {
    void loadGraph().then((payload) => {
      setGraph(payload);
      const years = payload.nodes
        .map((node) => node.metadata?.year)
        .filter((year): year is number => typeof year === "number");
      if (years.length) {
        setYearRange([Math.min(...years), Math.max(...years)]);
      }
    });
  }, []);

  const availableYears = useMemo<[number, number]>(() => {
    if (!graph) return [2010, 2026];
    const years = graph.nodes
      .map((node) => node.metadata?.year)
      .filter((year): year is number => typeof year === "number");
    if (!years.length) return [2010, 2026];
    return [Math.min(...years), Math.max(...years)];
  }, [graph]);

  const filteredNodes = useMemo(() => {
    if (!graph) return [];
    return graph.nodes.filter((node) => {
      const isTypeEnabled = activeTypes[node.type];
      const matchesSearch =
        search.trim().length === 0 ||
        node.label.toLowerCase().includes(search.toLowerCase()) ||
        node.metadata?.summary?.toLowerCase().includes(search.toLowerCase());
      const year = node.metadata?.year;
      const matchesYear =
        typeof year !== "number" || (year >= yearRange[0] && year <= yearRange[1]);
      return isTypeEnabled && matchesSearch && matchesYear;
    });
  }, [activeTypes, graph, search, yearRange]);

  const filteredNodeKeys = useMemo(() => new Set(filteredNodes.map((node) => node.key)), [filteredNodes]);

  const filteredEdges = useMemo(() => {
    if (!graph) return [];
    return graph.edges.filter(
      (edge) => filteredNodeKeys.has(edge.source) && filteredNodeKeys.has(edge.target),
    );
  }, [filteredNodeKeys, graph]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <div>
          <span className="topbar-eyebrow">Citation Hypernetwork</span>
          <h1>3D Visual Localization Archive</h1>
        </div>
        <div className="topbar-meta">
          <span>Graph-first research interface</span>
          <strong>{graph?.meta.paperCount ?? 0} curated papers</strong>
        </div>
      </header>

      <main className="layout">
        <FiltersPanel
          activeTypes={activeTypes}
          yearRange={yearRange}
          availableYears={availableYears}
          search={search}
          onSearchChange={setSearch}
          onYearRangeChange={setYearRange}
          onToggleType={(type) => setActiveTypes((current) => ({ ...current, [type]: !current[type] }))}
        />

        <section className="graph-panel panel">
          <div className="panel-header">
            <span className="panel-eyebrow">Network</span>
            <h2>Hypergraph View</h2>
          </div>
          {graph ? (
            <GraphCanvas
              nodes={filteredNodes}
              edges={filteredEdges}
              selectedNodeKey={selectedNode?.key ?? null}
              onSelectNode={setSelectedNode}
            />
          ) : (
            <div className="graph-loading">Loading graph data...</div>
          )}
        </section>

        <DetailsDrawer node={selectedNode} />
      </main>
    </div>
  );
}

export default App;

