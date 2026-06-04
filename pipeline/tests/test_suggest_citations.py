from __future__ import annotations

import json
import sys
import tempfile
import unittest
import urllib.error
from pathlib import Path
from types import SimpleNamespace
from typing import Any


ROOT = Path(__file__).resolve().parents[2]
SRC = ROOT / "pipeline" / "src"
if str(SRC) not in sys.path:
    sys.path.insert(0, str(SRC))

from localization_archive_pipeline import clients
from localization_archive_pipeline.clients import SemanticScholarClient
from localization_archive_pipeline.models import PaperRecord
from localization_archive_pipeline.suggest_citations import (
    choose_semantic_candidate,
    extract_arxiv_id,
    extract_doi,
    generate_citation_candidates,
    build_citation_payload,
    load_cached_openalex_resolutions,
    load_cached_semantic_resolutions,
    normalize_title,
    save_provider_cache,
    SemanticReferences,
    semantic_scholar_identifiers,
)


def paper(
    paper_id: str,
    title: str,
    year: int,
    citations: list[str] | None = None,
    source_links: list[dict[str, str]] | None = None,
) -> PaperRecord:
    return PaperRecord(
        paper_id=paper_id,
        title=title,
        year=year,
        venue="IEEE/CVF Conference on Computer Vision and Pattern Recognition",
        venue_type="conference",
        venue_tier="A*",
        abstract="",
        summary="",
        problem="Visual localization",
        prior_gap="Prior methods were limited",
        citations=citations or [],
        source_links=source_links or [],
    )


class FakeSemanticClient:
    api_key = None

    def __init__(
        self,
        papers_by_title: dict[str, dict[str, Any]],
        references_by_paper_id: dict[str, list[dict[str, Any]]],
        citations_by_paper_id: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self.papers_by_title = papers_by_title
        self.references_by_paper_id = references_by_paper_id
        self.citations_by_paper_id = citations_by_paper_id or {}

    def get_paper(self, identifier: str, fields: str) -> dict[str, Any]:
        raise AssertionError(f"unexpected identifier lookup: {identifier}")

    def search_papers(
        self,
        query: str,
        limit: int,
        fields: str,
    ) -> list[dict[str, Any]]:
        return [self.papers_by_title[query]]

    def iter_references(
        self,
        paper_id: str,
        fields: str,
        limit: int = 100,
    ) -> Any:
        return iter(self.references_by_paper_id.get(paper_id, []))

    def iter_citations(
        self,
        paper_id: str,
        fields: str,
        limit: int = 100,
    ) -> Any:
        return iter(self.citations_by_paper_id.get(paper_id, []))


class FakeResponse:
    def __init__(self, payload: dict[str, Any]) -> None:
        self.payload = payload

    def read(self) -> bytes:
        return json.dumps(self.payload).encode("utf-8")

    def __enter__(self) -> "FakeResponse":
        return self

    def __exit__(self, *_args: object) -> None:
        return None


class CitationSuggestionTests(unittest.TestCase):
    def test_extracts_arxiv_and_doi_identifiers(self) -> None:
        self.assertEqual(
            extract_arxiv_id("https://arxiv.org/pdf/2005.05179v2.pdf"),
            "2005.05179",
        )
        self.assertEqual(extract_arxiv_id("arXiv:cs/0304102v3"), "cs/0304102")
        self.assertEqual(
            extract_doi("https://doi.org/10.1109/CVPR.2017.123?download=true"),
            "10.1109/CVPR.2017.123",
        )

        record = paper(
            paper_id="paper:test",
            title="Test Paper",
            year=2024,
            source_links=[
                {"label": "DOI", "url": "https://doi.org/10.1109/CVPR.2017.123"},
                {"label": "arXiv", "url": "https://arxiv.org/abs/2401.12345v2"},
            ],
        )
        self.assertEqual(
            semantic_scholar_identifiers(record),
            ["arXiv:2401.12345", "DOI:10.1109/CVPR.2017.123"],
        )

    def test_title_matching_thresholds_use_score_and_year(self) -> None:
        record = paper("paper:test", "Detector-Free Local Feature Matching", 2021)
        self.assertEqual(
            normalize_title("LoFTR: Detector-Free Local Feature Matching!"),
            "loftr detector free local feature matching",
        )

        match, closest = choose_semantic_candidate(
            record,
            [{"paperId": "S1", "title": record.title, "year": 2022}],
            min_title_score=0.92,
        )
        self.assertIsNotNone(match)
        self.assertIsNone(closest)

        match, closest = choose_semantic_candidate(
            record,
            [{"paperId": "S2", "title": record.title, "year": 2024}],
            min_title_score=0.92,
        )
        self.assertIsNone(match)
        self.assertEqual(closest["bestSemanticScholarId"], "S2")

        match, closest = choose_semantic_candidate(
            record,
            [{"paperId": "S3", "title": record.title}],
            min_title_score=0.92,
        )
        self.assertIsNotNone(match)
        self.assertIsNone(closest)

    def test_classifies_missing_confirmed_and_unconfirmed_edges(self) -> None:
        records = [
            paper("paper:a", "Alpha Localization", 2021, citations=["paper:b"]),
            paper("paper:b", "Beta Features", 2020, citations=["paper:c"]),
            paper("paper:c", "Gamma Matching", 2019),
        ]
        semantic_client = FakeSemanticClient(
            papers_by_title={
                "Alpha Localization": {"paperId": "S2A", "title": "Alpha Localization", "year": 2021},
                "Beta Features": {"paperId": "S2B", "title": "Beta Features", "year": 2020},
                "Gamma Matching": {"paperId": "S2C", "title": "Gamma Matching", "year": 2019},
            },
            references_by_paper_id={
                "S2A": [
                    {"citedPaper": {"paperId": "S2B", "title": "Beta Features", "year": 2020}},
                    {"citedPaper": {"paperId": "S2C", "title": "Gamma Matching", "year": 2019}},
                ],
                "S2B": [],
                "S2C": [],
            },
        )

        payload = generate_citation_candidates(
            records=records,
            semantic_client=semantic_client,
            min_title_score=0.92,
            openalex_client=None,
        )

        self.assertFalse(payload["apiKeyUsed"])
        self.assertFalse(payload["semanticScholarApiKeyUsed"])
        self.assertFalse(payload["openAlexApiKeyUsed"])
        self.assertEqual(payload["providers"]["primary"], "Semantic Scholar Academic Graph")
        self.assertEqual(payload["providers"]["auxiliary"], "OpenAlex")
        self.assertEqual(payload["missingArchiveCitationCount"], 1)
        self.assertEqual(payload["recordedMismatchCount"], 1)
        self.assertEqual(payload["missingArchiveCitations"][0]["source"], "paper:a")
        self.assertEqual(payload["missingArchiveCitations"][0]["target"], "paper:c")
        self.assertEqual(payload["confirmedRecordedCitationCount"], 1)
        self.assertEqual(payload["confirmedRecordedCitations"][0]["target"], "paper:b")
        self.assertEqual(payload["unconfirmedRecordedCitationCount"], 1)
        self.assertEqual(payload["unconfirmedRecordedCitations"][0]["source"], "paper:b")
        self.assertEqual(
            payload["unconfirmedRecordedCitations"][0]["semanticScholarEvidence"]["status"],
            "not_found_in_references",
        )
        self.assertEqual(
            payload["missingArchiveCitations"][0]["openAlexStatus"],
            "openalex_unavailable",
        )

    def test_openalex_confirmation_confirms_recorded_edges(self) -> None:
        records = [
            paper("paper:a", "Alpha Localization", 2021, citations=["paper:b"]),
            paper("paper:b", "Beta Features", 2020),
        ]
        semantic_references = SemanticReferences(
            by_source={"paper:a": {}, "paper:b": {}},
            reference_counts={"paper:a": 0, "paper:b": 0},
            unavailable=[],
        )
        openalex_resolved = {
            "paper:a": SimpleNamespace(
                paper_id="paper:a",
                openalex_id="https://openalex.org/W1",
                referenced_works={"https://openalex.org/W2"},
            ),
            "paper:b": SimpleNamespace(
                paper_id="paper:b",
                openalex_id="https://openalex.org/W2",
                referenced_works=set(),
            ),
        }

        payload = build_citation_payload(
            records=records,
            semantic_resolved={},
            semantic_unresolved=[],
            semantic_references=semantic_references,
            openalex_resolved=openalex_resolved,
            openalex_unresolved=[],
            semantic_api_key_used=False,
            openalex_api_key_used=True,
        )

        self.assertEqual(payload["confirmedRecordedCitationCount"], 1)
        self.assertEqual(payload["unconfirmedRecordedCitationCount"], 0)
        self.assertEqual(
            payload["confirmedRecordedCitations"][0]["openAlexStatus"],
            "confirmed_by_openalex",
        )
        self.assertEqual(payload["confirmedRecordedCitations"][0]["source"], "paper:a")

    def test_incremental_mode_finds_incoming_citations_to_selected_paper(self) -> None:
        records = [
            paper("paper:new", "New Older Method", 2019),
            paper("paper:later", "Later Localization", 2021),
        ]
        semantic_client = FakeSemanticClient(
            papers_by_title={
                "New Older Method": {
                    "paperId": "S2NEW",
                    "title": "New Older Method",
                    "year": 2019,
                },
                "Later Localization": {
                    "paperId": "S2LATER",
                    "title": "Later Localization",
                    "year": 2021,
                },
            },
            references_by_paper_id={"S2NEW": []},
            citations_by_paper_id={
                "S2NEW": [
                    {
                        "citingPaper": {
                            "paperId": "S2LATER",
                            "title": "Later Localization",
                            "year": 2021,
                        }
                    }
                ]
            },
        )

        payload = generate_citation_candidates(
            records=records,
            semantic_client=semantic_client,
            min_title_score=0.92,
            openalex_client=None,
            source_records=[records[0]],
            include_incoming=True,
        )

        self.assertEqual(payload["missingArchiveCitationCount"], 1)
        self.assertEqual(payload["missingArchiveCitations"][0]["source"], "paper:later")
        self.assertEqual(payload["missingArchiveCitations"][0]["target"], "paper:new")
        self.assertEqual(
            payload["missingArchiveCitations"][0]["semanticScholarEvidence"]["status"],
            "found_in_citations",
        )

    def test_provider_cache_round_trips_resolved_ids(self) -> None:
        records = [
            paper("paper:a", "Alpha Localization", 2021),
            paper("paper:b", "Beta Features", 2020),
        ]
        payload = {
            "resolved": [
                {
                    "paperId": "paper:a",
                    "title": "Alpha Localization",
                    "year": 2021,
                    "semanticScholarId": "S2A",
                    "semanticScholarTitle": "Alpha Localization",
                    "semanticScholarYear": 2021,
                    "titleScore": 1.0,
                    "resolveMethod": "title_search",
                    "identifier": None,
                    "externalIds": {"DOI": "10.1/a"},
                }
            ],
            "openAlexResolved": [
                {
                    "paperId": "paper:b",
                    "title": "Beta Features",
                    "year": 2020,
                    "openAlexId": "https://openalex.org/W2",
                    "openAlexTitle": "Beta Features",
                    "openAlexYear": 2020,
                    "titleScore": 1.0,
                    "referenceCount": 1,
                    "referencedWorks": ["https://openalex.org/W1"],
                }
            ],
        }

        with tempfile.TemporaryDirectory() as temp_dir:
            cache_path = Path(temp_dir) / "citation_provider_cache.json"
            save_provider_cache(payload, cache_path, merge_existing=True)
            semantic = load_cached_semantic_resolutions(records, cache_path)
            openalex = load_cached_openalex_resolutions(records, cache_path)

        self.assertEqual(semantic["paper:a"].semantic_scholar_id, "S2A")
        self.assertEqual(openalex["paper:b"].openalex_id, "https://openalex.org/W2")
        self.assertEqual(openalex["paper:b"].referenced_works, {"https://openalex.org/W1"})

    def test_semantic_client_paginates_references(self) -> None:
        requested_urls: list[str] = []

        def fake_request(url: str) -> dict[str, Any]:
            requested_urls.append(url)
            if "offset=100" in url:
                return {"data": [{"citedPaper": {"paperId": "S2C"}}]}
            return {
                "next": 100,
                "data": [{"citedPaper": {"paperId": "S2B"}}],
            }

        client = SemanticScholarClient(sleep_seconds=0.0)
        client._request_json = fake_request  # type: ignore[method-assign]

        references = list(client.iter_references("S2A", fields="citedPaper.paperId", limit=100))

        self.assertEqual([item["citedPaper"]["paperId"] for item in references], ["S2B", "S2C"])
        self.assertEqual(len(requested_urls), 2)
        self.assertIn("offset=0", requested_urls[0])
        self.assertIn("offset=100", requested_urls[1])

    def test_semantic_client_treats_null_data_as_empty_results(self) -> None:
        client = SemanticScholarClient(sleep_seconds=0.0)
        client._request_json = lambda _url: {"data": None}  # type: ignore[method-assign]

        self.assertEqual(client.search_papers("missing paper"), [])
        self.assertEqual(list(client.iter_references("S2A")), [])
        self.assertEqual(list(client.iter_citations("S2A")), [])

    def test_semantic_client_retries_retryable_http_statuses(self) -> None:
        original_urlopen = clients.urllib.request.urlopen
        delays: list[float] = []
        requests: list[Any] = []

        def fake_urlopen(request: Any, timeout: int) -> FakeResponse:
            requests.append(request)
            if len(requests) == 1:
                raise urllib.error.HTTPError(
                    request.full_url,
                    429,
                    "Too Many Requests",
                    {},
                    None,
                )
            return FakeResponse({"paperId": "S2A", "title": "Alpha Localization"})

        clients.urllib.request.urlopen = fake_urlopen
        try:
            client = SemanticScholarClient(
                api_key="secret",
                sleep_seconds=0.0,
                max_retries=1,
                backoff_initial=0.25,
                sleep_fn=delays.append,
            )
            payload = client.get_paper("DOI:10.1109/CVPR.2017.123")
        finally:
            clients.urllib.request.urlopen = original_urlopen

        self.assertEqual(payload["paperId"], "S2A")
        self.assertEqual(delays, [0.25])
        self.assertEqual(len(requests), 2)
        self.assertIn("DOI%3A10.1109%2FCVPR.2017.123", requests[0].full_url)
        self.assertEqual(requests[0].headers["X-api-key"], "secret")


if __name__ == "__main__":
    unittest.main()
