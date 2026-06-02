# Work Spec and Self Feedback

Date: 2026-06-02

## Implemented Requirements

- Use a year-based archive instead of a graph-first UI.
- Use vertical top-down year navigation instead of horizontal scrolling.
- Render papers inside each year as a 3-column by N-row archive grid on desktop.
- Render paper cards as image-first archive items, similar to the visual reference layout.
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
- Add representative figure thumbnails to every paper card.
- Support future real figures through optional `figure.url` in curation YAML.
- Add a visible selected-paper citation ledger with `Cites` and `Cited by` navigation.
- Add citation counts to each paper card.
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

Current policy:

- The project uses local schematic SVG assets in `web/public/figures/`.
- These are representative thumbnails, not copied paper figures.
- This avoids licensing ambiguity while still making the archive visually scannable.

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

- The 3-column year grid improves scan density over the single-column vertical list while preserving top-down chronology.
- Image-first cards make the paper list closer to the visual archive reference and reduce dependence on title text alone.
- Venue color encoding is now useful, but the palette should eventually be documented in the UI legend.
- The visible citation ledger makes citation relationships discoverable; the export function remains GitHub Pages compatible and should later support JSON and BibTeX as well.
- Citation edges are good enough for an initial archive lineage, but they should be bibliography-verified before treating the graph as a formal citation network.
- Figure support is structurally ready and currently uses safe local schematic assets; real paper figures still need source/licensing review before use.
- OpenAlex broad search has low precision for this domain. A better pipeline should use exact-title expansion, reference crawling, and manual venue correction.
