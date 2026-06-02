export type NodeType = "paper" | "problem" | "metric" | "dataset" | "limitation";

export type GraphNode = {
  key: string;
  label: string;
  type: NodeType;
  x: number;
  y: number;
  size: number;
  color: string;
  paperRefs: string[];
  confidence: number;
  provenance: string[];
  metadata?: {
    title?: string;
    year?: number;
    venue?: string;
    venueTier?: string;
    venueType?: string;
    summary?: string;
    abstract?: string;
    problem?: string;
    priorGap?: string;
    whyThisMetric?: string;
    datasetLimitations?: string[];
    limitations?: string[];
    sourceLinks?: Array<{ label: string; url: string }>;
    figure?: {
      url: string;
      alt?: string;
      caption?: string;
    };
  };
};

export type GraphEdge = {
  key: string;
  source: string;
  target: string;
  type: string;
  paperRefs: string[];
};

export type GraphPayload = {
  meta: {
    domain: string;
    paperCount: number;
    generatedBy: string;
    nodeTypes: NodeType[];
  };
  nodes: GraphNode[];
  edges: GraphEdge[];
};
