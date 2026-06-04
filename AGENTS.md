# Repository Guidelines

## Project Structure & Module Organization

This repository combines a Python ETL pipeline with a Vite/React web app. Pipeline entry scripts live in `pipeline/*.py`; shared package code is in `pipeline/src/localization_archive_pipeline/`; Python tests are in `pipeline/tests/`. Curated paper records are one YAML file per paper in `data/curation/`, with references in `data/reference/` and seeds in `data/seeds.yaml`. Frontend code lives in `web/src/`; static files and the generated `graph.json` live in `web/public/`. Use `docs/` for curation notes and `assets/img/` for repository screenshots.

## Build, Test, and Development Commands

- `pip install .`: install the pipeline package.
- `python pipeline/validate_data.py`: validate curated YAML.
- `python pipeline/audit_citations.py --fail-on confirmed`: run the CI-style Semantic Scholar + OpenAlex citation audit.
- `python pipeline/audit_citations.py --paper-id paper:slug-year --fail-on none`: check one added paper against the existing citation cache.
- `python pipeline/apply_citation_audit.py`: merge audited missing citation edges into `data/seeds.yaml`.
- `python pipeline/build_graph.py`: regenerate `web/public/graph.json`.
- `python -m unittest discover pipeline/tests`: run Python tests.
- `cd web && npm ci`: install frontend dependencies.
- `cd web && npm run dev`: start Vite locally.
- `cd web && npm run build`: type-check and build the frontend.
- `cd web && npm run preview`: serve the production build.

## Coding Style & Naming Conventions

Use Python 3.11+ with 4-space indentation, type hints, dataclasses where appropriate, and small helpers for data normalization. Keep tests in `unittest` style with names like `test_extracts_arxiv_and_doi_identifiers`. Curated YAML filenames should be lowercase, hyphen-separated paper slugs ending in the year, such as `loftr-2021.yaml`, and must include the fields required by `data/curation/README.md`.

Frontend code uses TypeScript, React function components, hooks, ES modules, and double-quoted imports. Component files use PascalCase, for example `ArchiveBrowser.tsx`; shared types belong in `web/src/types.ts`.

## Testing Guidelines

Run `python -m unittest discover pipeline/tests` after pipeline changes. Run `python pipeline/validate_data.py` after editing `data/curation/*.yaml`. Run `cd web && npm run build` after frontend or graph-shape changes. There is no separate frontend test script, so the TypeScript build is the baseline check.

## Commit & Pull Request Guidelines

Recent history uses concise Conventional Commit-style subjects such as `feat: add semantic scholar citation suggestions` and `data: align citation graph with OpenAlex references`. Prefer `feat:`, `fix:`, `data:`, or `docs:`. Pull requests should describe changed data or behavior, list validation/build commands run, link issues when available, and include screenshots for UI changes.

## Security & Configuration Tips

Copy `.env.example` to `.env` for local keys such as `SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_API_KEY`. Do not commit real keys. Treat `web/public/graph.json` as generated output; update it by running the pipeline.
