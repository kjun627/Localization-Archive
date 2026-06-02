# 3D Localization Archive

![3D Localization Archive interface](assets/img/main.png)

An interactive archive for reading 3D visual localization papers as a connected research lineage, not as a flat bibliography.

The archive focuses on what each paper tried to solve, which previous limitation motivated it, where it was evaluated, and how it connects to later work. It is designed for quickly answering questions such as:

- Which papers moved localization from retrieval to metric pose estimation?
- Which methods improved local matching, scene coordinate regression, or privacy-preserving localization?
- Which datasets and benchmarks repeatedly shape the field?
- Which papers cite, extend, or expose limitations of earlier methods?

## Current Snapshot

- 80 curated papers
- 605 graph nodes across papers, problems, metrics, datasets, and limitations
- 982 graph edges, including citation and evidence relationships
- Paper, code, and project links are normalized into three consistent slots

## Main Features

### Archive Timeline

The main view follows a year-based archive structure. Papers are grouped by publication year, with the newest years placed first. Venue filters and search are built for scanning large paper sets without leaving the archive view.

### Paper Detail Cards

Selecting a paper opens a movable detail card with:

- the problem the paper addressed
- the prior limitation or research gap
- the technical advance
- datasets and evaluation metrics
- known limitations
- upstream papers it builds on and downstream papers that cite it
- `Paper`, `Code`, and `Project` links

Missing links stay visible as disabled slots so every paper card has the same structure.

### Citation Graph Viewer

Each detail card can open a Three.js-based citation graph. The graph shows paper-to-paper influence, not just metadata similarity. Node size and graph position make it easier to inspect which works are central, which papers are predecessors, and which papers branch into newer lines of work.

### Paper Comparison

Papers can be added to a comparison panel from their detail card. The comparison view places papers side by side across problem, prior gap, advance, datasets, limitations, citation counts, and source links.

### Curated Research Metadata

Every curated paper has a YAML file in `data/curation/`. The archive stores more than title and venue: each entry records the research motivation, technical contribution, datasets, metrics, limitations, links, and curation confidence.

## Research Scope

The core topic is 3D visual localization, including:

- image retrieval and visual place recognition for localization
- structure-based localization and hierarchical localization
- local features, dense matching, and foundation-guided matching
- absolute pose regression and scene coordinate regression
- long-term localization benchmarks
- privacy-preserving localization, map/query obfuscation, and inversion attacks

The current venue policy includes high-quality computer vision, robotics, machine learning, and AI venues:

- CORE-ranked conferences: `CVPR`, `ICCV`, `ECCV`, `3DV`, `ICRA`, `IROS`, `BMVC`, `NeurIPS`, `AAAI`, `WACV`
- SJR-ranked journals: `TPAMI`, `IJCV`, `RA-L`, `Pattern Recognition`, `Image and Vision Computing`

Paper links prefer stable archive or proceedings pages such as CVF Open Access, ECVA, BMVC archive, NeurIPS proceedings, AAAI proceedings, journal pages, DOI pages, or arXiv when no better archive link is available.

## Repository Structure

```text
.
├── assets/img/main.png              # README hero image
├── data/
│   ├── curation/                    # one YAML annotation per paper
│   ├── reference/                   # venue filters
│   └── seeds.yaml                   # included papers and citation edges
├── pipeline/                        # Python graph builder and validators
├── web/                             # Vite/React frontend
└── .github/workflows/deploy.yml     # GitHub Pages deployment
```

## Data Flow

1. Add or update a paper entry in `data/seeds.yaml`.
2. Add the paper annotation in `data/curation/`.
3. Validate venue and seed consistency.
4. Rebuild `web/public/graph.json`.
5. Build the frontend.
6. Commit the curation files and regenerated graph.

## Local Development

Install Python dependencies:

```bash
pip install .
```

Validate curated data:

```bash
python3 pipeline/validate_data.py
```

Regenerate the graph payload:

```bash
python3 pipeline/build_graph.py
```

Run the frontend:

```bash
cd web
npm install
npm run dev
```

Build the frontend:

```bash
cd web
npm run build
```

## Deployment

The repository is configured for GitHub Pages through `.github/workflows/deploy.yml`.

Before the first successful deploy, enable Pages manually in GitHub:

1. Open repository `Settings`.
2. Go to `Pages`.
3. Set `Build and deployment` source to `GitHub Actions`.
4. Re-run the workflow.

If the workflow cannot write the Pages deployment, set `Settings -> Actions -> General -> Workflow permissions` to `Read and write permissions`.

## Curation Notes

- The default UI language is English.
- Google Scholar is intentionally excluded from the data pipeline.
- Source links are normalized to exactly `Paper`, `Code`, and `Project`.
- Paper cards use a caption-only visual slot by default, avoiding unverified representative figures in the public build.
- Conference event homepages are not required for the paper link slot. Stable archive and proceedings links are preferred.
