import type { GraphNode } from "../types";

type DetailsDrawerProps = {
  node: GraphNode | null;
};

export function DetailsDrawer({ node }: DetailsDrawerProps) {
  if (!node) {
    return (
      <aside className="panel details">
        <div className="panel-header">
          <span className="panel-eyebrow">Selection</span>
          <h2>No node selected</h2>
        </div>
        <p className="muted">Choose a paper or semantic node to inspect evidence, venue tier, and links.</p>
      </aside>
    );
  }

  const metadata = node.metadata;

  return (
    <aside className="panel details">
      <div className="panel-header">
        <span className="panel-eyebrow">{node.type}</span>
        <h2>{node.label}</h2>
      </div>

      <div className="metric-strip">
        <div>
          <span className="metric-label">Confidence</span>
          <strong>{Math.round(node.confidence * 100)}%</strong>
        </div>
        <div>
          <span className="metric-label">Evidence</span>
          <strong>{node.provenance.join(", ")}</strong>
        </div>
      </div>

      {metadata?.year ? (
        <dl className="metadata-grid">
          <div>
            <dt>Year</dt>
            <dd>{metadata.year}</dd>
          </div>
          <div>
            <dt>Venue</dt>
            <dd>{metadata.venue}</dd>
          </div>
          <div>
            <dt>Tier</dt>
            <dd>{metadata.venueTier}</dd>
          </div>
        </dl>
      ) : null}

      {metadata?.summary ? (
        <section>
          <h3>Contribution</h3>
          <p>{metadata.summary}</p>
        </section>
      ) : null}

      {metadata?.problem ? (
        <section>
          <h3>Problem</h3>
          <p>{metadata.problem}</p>
        </section>
      ) : null}

      {metadata?.priorGap ? (
        <section>
          <h3>Prior Gap</h3>
          <p>{metadata.priorGap}</p>
        </section>
      ) : null}

      {metadata?.whyThisMetric ? (
        <section>
          <h3>Why This Metric</h3>
          <p>{metadata.whyThisMetric}</p>
        </section>
      ) : null}

      {metadata?.datasetLimitations?.length ? (
        <section>
          <h3>Dataset Limitations</h3>
          <ul>
            {metadata.datasetLimitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {metadata?.limitations?.length ? (
        <section>
          <h3>Remaining Limitations</h3>
          <ul>
            {metadata.limitations.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      {metadata?.sourceLinks?.length ? (
        <section>
          <h3>Links</h3>
          <div className="link-list">
            {metadata.sourceLinks.map((link) => (
              <a key={link.url} href={link.url} target="_blank" rel="noopener noreferrer">
                {link.label}
              </a>
            ))}
          </div>
        </section>
      ) : null}
    </aside>
  );
}
