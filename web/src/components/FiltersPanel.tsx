import type { NodeType } from "../types";

type FiltersPanelProps = {
  activeTypes: Record<NodeType, boolean>;
  yearRange: [number, number];
  availableYears: [number, number];
  search: string;
  onToggleType: (type: NodeType) => void;
  onYearRangeChange: (range: [number, number]) => void;
  onSearchChange: (value: string) => void;
};

const orderedTypes: NodeType[] = ["paper", "problem", "metric", "dataset", "limitation"];

export function FiltersPanel({
  activeTypes,
  yearRange,
  availableYears,
  search,
  onToggleType,
  onYearRangeChange,
  onSearchChange,
}: FiltersPanelProps) {
  return (
    <aside className="panel sidebar">
      <div className="panel-header">
        <span className="panel-eyebrow">Filters</span>
        <h2>Signal Layers</h2>
      </div>

      <label className="control">
        <span>Search papers or concepts</span>
        <input
          type="search"
          value={search}
          placeholder="ACE, Cambridge, pose accuracy..."
          onChange={(event) => onSearchChange(event.target.value)}
        />
      </label>

      <div className="control-group">
        <span className="control-label">Node types</span>
        <div className="type-grid">
          {orderedTypes.map((type) => (
            <button
              key={type}
              type="button"
              className={activeTypes[type] ? "type-chip active" : "type-chip"}
              onClick={() => onToggleType(type)}
            >
              {type}
            </button>
          ))}
        </div>
      </div>

      <div className="control-group">
        <span className="control-label">Publication window</span>
        <div className="range-row">
          <input
            type="range"
            min={availableYears[0]}
            max={availableYears[1]}
            value={yearRange[0]}
            onChange={(event) =>
              onYearRangeChange([Math.min(Number(event.target.value), yearRange[1]), yearRange[1]])
            }
          />
          <input
            type="range"
            min={availableYears[0]}
            max={availableYears[1]}
            value={yearRange[1]}
            onChange={(event) =>
              onYearRangeChange([yearRange[0], Math.max(Number(event.target.value), yearRange[0])])
            }
          />
        </div>
        <div className="range-values">
          <span>{yearRange[0]}</span>
          <span>{yearRange[1]}</span>
        </div>
      </div>
    </aside>
  );
}

