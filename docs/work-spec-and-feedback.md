# Work Spec and Self Feedback

Date: 2026-06-02

## Implemented Requirements

- Use a year-based archive instead of a graph-first UI.
- Use vertical top-down year navigation instead of horizontal scrolling.
- Assign distinct banner colors by venue:
  - CVPR: red
  - ICCV: black
  - ECCV: blue
  - TPAMI: green
  - 3DV: orange
  - IVC: purple
- Avoid paper selection animations that hide the venue tab.
- Keep a left-side detail panel for the selected paper.
- Add a representative figure slot in the selected paper panel.
- Support future real figures through optional `figure.url` in curation YAML.
- Add a client-side Markdown export for the filtered citation list/tree.
- Expand curated archive data from 3 papers to 12 papers.
- Rebuild `web/public/graph.json` from curated YAML data.

## Data Contract

Each curated paper should include:

- `paper_id`, `title`, `year`, `venue`, `venue_type`, `venue_tier`
- `summary`, `problem`, `prior_gap`
- `metric` and `why_this_metric`
- `dataset` and `dataset_limitations`
- `limitations`
- `source_links`
- optional `figure`
- `provenance` and `confidence`

Citation direction:

- `citations` means current paper cites the listed prior papers.
- Exported citation tree follows `source -> cited target`.

Figure field:

```yaml
figure:
  url: https://example.com/representative-image.png
  alt: Short accessible description
  caption: What the figure represents
```

If `url` is absent, the frontend renders a LEGO-style placeholder with the caption.

## Validation Completed

```bash
python3 pipeline/validate_data.py
python3 pipeline/build_graph.py
cd web && npm run build
```

Current graph output:

- Papers: 12
- Nodes: 71
- Edges: 102
- Citation edges: 18

## Self Feedback

- The vertical archive improves scalability over the prior horizontal scroller, especially when the paper count grows.
- Venue color encoding is now useful, but the palette should eventually be documented in the UI legend.
- The export function is intentionally simple and GitHub Pages compatible; a future version should export JSON and BibTeX as well.
- Citation edges are good enough for an initial archive lineage, but they should be bibliography-verified before treating the graph as a formal citation network.
- Figure support is structurally ready, but real paper figures need careful source/licensing handling. Placeholders are safer for now.
- OpenAlex broad search has low precision for this domain. A better pipeline should use exact-title expansion, reference crawling, and manual venue correction.
