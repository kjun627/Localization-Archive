# Awesome Visual Localization Import Plan

This archive imports from `siyandong/awesome-visual-localization` in filtered batches rather than mirroring the whole list.

## Selection Rules

- Prefer papers that pass the existing venue filters: CORE A*/A conferences or SJR Q1/Q2 journals.
- Prioritize visual localization, relocalization, retrieval, local matching, scene-coordinate regression, pose refinement, and privacy-preserving localization.
- Defer arXiv-only, workshop-only, tool-only, or duplicate dataset pages unless they close a clear archive gap.

## Batch Order

1. Recent high-value gaps from 2024-2025 across pose regression, feature matching, SCR, and refinement.
2. Older foundation papers that current papers repeatedly cite but are missing from the archive.
3. Dataset and benchmark entries with stable proceedings or project pages.

## Citation Workflow

For new papers, add seed and curation records with empty citations first. Then run incremental citation checks only for the added paper ids:

```bash
python3 pipeline/audit_citations.py --paper-id paper:reloc3r-2025 --fail-on none
python3 pipeline/apply_citation_audit.py --audit data/generated/citation_audit_incremental.json
```

Pass all new ids in one audit command when importing a batch. This resolves the new sources, checks their references against the full archive, and uses incoming Semantic Scholar citation lookups to add existing-source edges to the new targets. A full audit should be reserved for periodic integrity checks or provider-cache refreshes.
