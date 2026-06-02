# Data Collection Report

Date: 2026-06-02

## Seed Candidate Fetch

- Source: OpenAlex only
- Query: `3D visual localization absolute camera pose estimation`
- Limit: 25
- Output: `data/generated/seed_candidates.json`
- Semantic Scholar: not used by this fetch path; `SEMANTIC_SCHOLAR_API_KEY` is optional and not required.
- Google Scholar: excluded.

Command:

```bash
python3 pipeline/fetch_seed_candidates.py --query "3D visual localization absolute camera pose estimation" --limit 25
```

Initial sandbox run failed before reaching OpenAlex due DNS/network blocking:

```text
urllib.error.URLError: <urlopen error [Errno -3] Temporary failure in name resolution>
```

The same command passed after network access was approved and wrote 25 candidates.

## Venue-Tier Summary

- Total candidates: 25
- Included by current local venue filters: 4
- Excluded by current local venue filters: 21
- Included tiers: SJR Q1 = 3, SJR Q2 = 1
- Exclusion reasons: no SJR quartile match = 14, no CORE rank match = 7

Included candidates by current filter:

| Year | Title | Venue | Tier | Citations |
| --- | --- | --- | --- | --- |
| 2020 | Event-Based Vision: A Survey | IEEE Transactions on Pattern Analysis and Machine Intelligence | SJR Q1 | 1996 |
| 2014 | Visual Tracking: An Experimental Survey | IEEE Transactions on Pattern Analysis and Machine Intelligence | SJR Q1 | 1557 |
| 1998 | Example-based learning for view-based human face detection | IEEE Transactions on Pattern Analysis and Machine Intelligence | SJR Q1 | 1777 |
| 2016 | 300 Faces In-The-Wild Challenge: database and results | Image and Vision Computing | SJR Q2 | 749 |

## Manual Review Notes

- Review likely relevant conference papers that OpenAlex returned with `Unknown venue`; several DOI strings indicate CVPR, ICRA, or IROS, but the current saved OpenAlex fields did not expose a source name for automatic CORE matching.
- Prioritize manual checks for `Benchmarking 6DOF Outdoor Visual Localization in Changing Conditions`, `Real-time onboard 6DoF localization of an indoor MAV in degraded visual environments using a RGB-D camera`, `A robust and modular multi-sensor fusion approach applied to MAV navigation`, and `Robust localization for planar moving robot in changing environment`.
- Review high-citation relevant journal candidates currently excluded because the local SJR reference table is narrow, especially `ORB-SLAM3: An Accurate Open-Source Library for Visual, Visual-Inertial, and Multimap SLAM`.
- Treat broad surveys and off-topic high-citation results as recall noise unless they are needed for background or citation-neighborhood expansion.
- Next pass should either enrich OpenAlex venue extraction for conference papers or add a manual venue correction step before applying CORE/SJR filters.
