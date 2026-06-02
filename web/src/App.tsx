import { useEffect, useMemo, useState } from "react";
import { loadGraph } from "./data";
import { DetailsDrawer } from "./components/DetailsDrawer";
import { YearArchive } from "./components/YearArchive";
import type { GraphNode, GraphPayload } from "./types";

type TierFilter = "all" | "A*" | "A" | "Q1" | "Q2";

const tierFilters: TierFilter[] = ["all", "A*", "A", "Q1", "Q2"];

function App() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null);
  const [search, setSearch] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  useEffect(() => {
    void loadGraph().then((payload) => {
      setGraph(payload);
      const latestPaper = payload.nodes
        .filter((node) => node.type === "paper")
        .sort((left, right) => (right.metadata?.year ?? 0) - (left.metadata?.year ?? 0))[0];
      if (latestPaper) setSelectedNode(latestPaper);
    });
  }, []);

  const papers = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .filter((node) => node.type === "paper")
      .filter((paper) => {
        const metadata = paper.metadata;
        const query = search.trim().toLowerCase();
        const matchesSearch =
          query.length === 0 ||
          paper.label.toLowerCase().includes(query) ||
          metadata?.summary?.toLowerCase().includes(query) ||
          metadata?.venue?.toLowerCase().includes(query) ||
          metadata?.problem?.toLowerCase().includes(query);
        const matchesTier = tierFilter === "all" || metadata?.venueTier === tierFilter;
        return matchesSearch && matchesTier;
      })
      .sort((left, right) => {
        const yearDiff = (right.metadata?.year ?? 0) - (left.metadata?.year ?? 0);
        return yearDiff || left.label.localeCompare(right.label);
      });
  }, [graph, search, tierFilter]);

  const papersByYear = useMemo(() => {
    const grouped = new Map<number, GraphNode[]>();
    papers.forEach((paper) => {
      const year = paper.metadata?.year ?? 0;
      grouped.set(year, [...(grouped.get(year) ?? []), paper]);
    });
    return Array.from(grouped.entries()).sort(([left], [right]) => right - left);
  }, [papers]);

  const datasets = useMemo(() => {
    if (!graph) return 0;
    return graph.nodes.filter((node) => node.type === "dataset").length;
  }, [graph]);

  const metrics = useMemo(() => {
    if (!graph) return 0;
    return graph.nodes.filter((node) => node.type === "metric").length;
  }, [graph]);

  return (
    <div className="app-shell">
      <header className="global-nav">
        <h1>Localization Archive</h1>
        <nav aria-label="Archive metadata">
          <span>OpenAlex</span>
          <span>CORE A*/A</span>
          <span>SJR Q1/Q2</span>
        </nav>
      </header>

      <div className="sub-nav">
        <strong>3D Visual Localization</strong>
        <a href="https://github.com/kjun627/Localization-Archive" target="_blank" rel="noreferrer">
          GitHub
        </a>
      </div>

      <main>
        <section className="archive-hero">
          <div className="hero-copy">
            <span>Paper Archive</span>
            <h2>Research lineage, sorted by year.</h2>
            <p>
              A curated archive of 3D visual localization papers, filtered by top-tier venues and
              annotated with problems, metrics, datasets, and remaining limits.
            </p>
            <div className="hero-actions">
              <a href="#archive">Browse papers</a>
              <a href="#details" className="secondary-link">
                View details
              </a>
            </div>
          </div>
          <div className="hero-stat-strip" aria-label="Archive counts">
            <div>
              <strong>{graph?.meta.paperCount ?? 0}</strong>
              <span>Papers</span>
            </div>
            <div>
              <strong>{datasets}</strong>
              <span>Datasets</span>
            </div>
            <div>
              <strong>{metrics}</strong>
              <span>Metrics</span>
            </div>
          </div>
        </section>

        <section className="archive-controls" aria-label="Archive filters">
          <label>
            <span>Search</span>
            <input
              type="search"
              value={search}
              placeholder="ACE, Cambridge, pose accuracy..."
              onChange={(event) => setSearch(event.target.value)}
            />
          </label>
          <div className="tier-tabs" role="tablist" aria-label="Venue tier">
            {tierFilters.map((tier) => (
              <button
                aria-selected={tierFilter === tier}
                className={tierFilter === tier ? "active" : ""}
                key={tier}
                onClick={() => setTierFilter(tier)}
                type="button"
              >
                {tier === "all" ? "All tiers" : tier}
              </button>
            ))}
          </div>
        </section>

        <section className="archive-layout" id="archive">
          <YearArchive
            papersByYear={papersByYear}
            selectedNodeKey={selectedNode?.key ?? null}
            onSelectPaper={setSelectedNode}
          />
          <div id="details" className="details-column">
            <DetailsDrawer node={selectedNode} />
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
