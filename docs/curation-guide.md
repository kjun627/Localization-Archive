# Curation Guide

## Inclusion Rules

- Conferences must be `CORE A*` or `CORE A`
- Journals must be `SJR Q1` or `SJR Q2`
- Unranked venues stay excluded unless manually approved later

## Curation Standard

Each paper should capture:

- the concrete problem the paper solves
- what prior work could not solve
- which metrics are used
- why those metrics are necessary
- which datasets are used
- which dataset-specific limitations remain

## Writing Rules

- Keep paper titles exact
- Prefer direct claims over vague summaries
- Mark uncertain interpretations with lower `confidence`
- Use `needs_review` instead of filling unsupported claims

## Citation Checks

- Add `SEMANTIC_SCHOLAR_API_KEY` and `OPENALEX_API_KEY` to `.env` before full citation audits.
- Run `python pipeline/audit_citations.py --fail-on confirmed` to check curated citations with Semantic Scholar references first and OpenAlex as corroborating evidence.
- The audit updates `data/reference/citation_provider_cache.json`, which stores reusable Semantic Scholar and OpenAlex provider ids.
- After adding or editing one paper, prefer `python pipeline/audit_citations.py --paper-id paper:your-slug-year --fail-on none`. This reuses the provider cache and checks only that paper's outgoing references plus incoming citations from archived papers.
- Run `python pipeline/apply_citation_audit.py` to merge audited `missingArchiveCitations` into `data/seeds.yaml`.
- Run `python pipeline/suggest_citations.py` when you want a candidate report without failing the process.

