# Localization Archive

Citation hypernetwork for `3D Visual Localization` papers.

## What This Repository Contains

- `pipeline/`: Python ETL and graph builder
- `data/`: seed papers, venue ranking references, curated annotations, generated graph data
- `web/`: GitHub Pages frontend
- `docs/`: operating notes for curation and updates

## Scope

The v1 graph includes only:

- conferences ranked `CORE A*` or `CORE A`
- journals ranked `SJR Q1` or `SJR Q2`

The data APIs are:

- `OpenAlex`
- `Semantic Scholar`

`Google Scholar` is intentionally excluded.

## Quick Start

1. Copy `.env.example` to `.env` and set:
   - `OPENALEX_API_KEY`
   - `SEMANTIC_SCHOLAR_API_KEY`
2. Create a Python environment and install pipeline dependencies.
3. Install frontend dependencies in `web/`.
4. Build graph data with:

```bash
python3 pipeline/build_graph.py
```

5. Validate seed and curation consistency:

```bash
python3 pipeline/validate_data.py
```

6. Fetch candidate papers once API keys are available:

```bash
python3 pipeline/fetch_seed_candidates.py --limit 20
```

7. Start the frontend:

```bash
cd web
npm install
npm run dev
```

## Data Flow

1. Curate seed papers in `data/seeds.yaml`
2. Maintain venue filters in `data/reference/`
3. Add or review paper annotations in `data/curation/`
4. Run `pipeline/build_graph.py`
5. Commit the updated `web/public/graph.json`

## Deployment

The repository includes a GitHub Pages workflow in `.github/workflows/deploy.yml`.
