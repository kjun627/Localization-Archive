import { useEffect, useMemo, useState } from "react";
import { ArchiveBrowser } from "./components/ArchiveBrowser";
import { loadGraph } from "./data";
import type { GraphNode, GraphPayload } from "./types";

function App() {
  const [graph, setGraph] = useState<GraphPayload | null>(null);
  const [selectedPaper, setSelectedPaper] = useState<GraphNode | null>(null);
  const [activeVenues, setActiveVenues] = useState<Record<string, boolean>>({});
  const [search, setSearch] = useState("");

  useEffect(() => {
    void loadGraph().then((payload) => {
      setGraph(payload);
    });
  }, []);

  const papers = useMemo(() => {
    if (!graph) return [];
    return graph.nodes
      .filter((node) => node.type === "paper")
      .sort((left, right) => {
        const yearDiff = (left.metadata?.year ?? 0) - (right.metadata?.year ?? 0);
        return yearDiff || left.label.localeCompare(right.label);
      });
  }, [graph]);

  return (
    <ArchiveBrowser
      edges={graph?.edges ?? []}
      papers={papers}
      selectedPaper={selectedPaper}
      activeVenues={activeVenues}
      search={search}
      onSearchChange={setSearch}
      onSelectPaper={setSelectedPaper}
      onToggleVenue={(venue) =>
        setActiveVenues((current) => ({ ...current, [venue]: !(current[venue] ?? true) }))
      }
    />
  );
}

export default App;
