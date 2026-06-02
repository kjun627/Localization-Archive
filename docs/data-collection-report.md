# Data Collection Report

Date: 2026-06-02

## Scope

- Domain: 3D Visual Localization
- Google Scholar: excluded
- OpenAlex: used for candidate discovery and exact-title sanity checks
- Semantic Scholar: attempted without an API key, but search calls returned HTTP 429 in this session
- Venue rule: top-tier conferences or journals down to Q2

## Automated Candidate Fetch

Command:

```bash
python3 pipeline/fetch_seed_candidates.py --query "3D visual localization absolute camera pose estimation" --limit 50
```

Result:

- Output: `data/generated/seed_candidates.json`
- Total candidates: 50
- Included by local venue filters: 7
- Included candidates were mostly broad/off-topic recall noise such as surveys, face analysis, tracking, and monocular depth.

Interpretation:

- The broad OpenAlex query is useful for recall, but not precise enough to directly populate the archive.
- Several relevant CVPR/ICCV/ECCV papers expose DOI metadata but not a normalized OpenAlex venue source, so exact-title manual curation is still required.

## Exact-Title Checks

OpenAlex exact-title checks confirmed titles, years, DOI availability, and citation counts for the manually curated expansion set:

| Year | Paper | Venue | Link basis |
| --- | --- | --- | --- |
| 2013 | Scene Coordinate Regression Forests for Camera Relocalization in RGB-D Images | CVPR | DOI |
| 2015 | PoseNet: A Convolutional Network for Real-Time 6-DOF Camera Relocalization | ICCV | DOI |
| 2016 | NetVLAD: CNN Architecture for Weakly Supervised Place Recognition | CVPR | CVF page |
| 2017 | DSAC: Differentiable RANSAC for Camera Localization | CVPR | DOI |
| 2018 | Benchmarking 6DOF Outdoor Visual Localization in Changing Conditions | CVPR | DOI |
| 2019 | D2-Net: A Trainable CNN for Joint Description and Detection of Local Features | CVPR | DOI |
| 2020 | SuperGlue: Learning Feature Matching With Graph Neural Networks | CVPR | DOI |
| 2021 | LoFTR: Detector-Free Local Feature Matching With Transformers | CVPR | DOI |
| 2021 | Back to the Feature: Learning Robust Camera Localization From Pixels to Pose | CVPR | DOI |

## Reflected Archive Data

- Curated papers: 12
- Graph nodes: 71
- Graph edges: 102
- Citation edges: 18
- Added coverage:
  - Scene coordinate regression foundation
  - Direct pose regression
  - Retrieval-based place recognition
  - Differentiable RANSAC lineage
  - Outdoor long-term benchmark
  - Learned local features and matchers
  - Pixel-wise pose refinement
  - Efficient and mapping-agnostic regression methods

## Known Data Caveats

- Some citation edges are curated from known methodological lineage and should be verified against paper bibliographies in a later pass.
- Representative figure slots currently use captions/placeholders unless a `figure.url` is added to the paper curation YAML.
- OpenAlex venue normalization misses some conference sources, so the local venue filter should gain DOI-prefix or manual venue correction support.
- Semantic Scholar should be retried with throttling or a key if bulk reference extraction becomes necessary.
