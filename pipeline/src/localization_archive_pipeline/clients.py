from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from collections.abc import Callable, Iterator
from typing import Any


DEFAULT_TIMEOUT = 30
SEMANTIC_SCHOLAR_PAPER_FIELDS = (
    "paperId,title,abstract,venue,year,url,referenceCount,citationCount,"
    "openAccessPdf,externalIds"
)
SEMANTIC_SCHOLAR_REFERENCE_FIELDS = (
    "citedPaper.paperId,citedPaper.title,citedPaper.year,citedPaper.url,"
    "citedPaper.externalIds"
)
SEMANTIC_SCHOLAR_CITATION_FIELDS = (
    "citingPaper.paperId,citingPaper.title,citingPaper.year,citingPaper.url,"
    "citingPaper.externalIds"
)
SEMANTIC_SCHOLAR_SEARCH_FIELDS = "paperId,title,venue,year,url,externalIds"


@dataclass
class OpenAlexClient:
    api_key: str | None = None
    mailto: str = "localization-archive@example.com"

    def search_works(
        self,
        query: str,
        per_page: int = 15,
        select: str | None = None,
    ) -> list[dict[str, Any]]:
        payload = {
            "search": query,
            "per-page": per_page,
            "mailto": self.mailto,
        }
        if self.api_key:
            payload["api_key"] = self.api_key
        if select:
            payload["select"] = select
        params = urllib.parse.urlencode(payload)
        url = f"https://api.openalex.org/works?{params}"
        payload = _get_json(url)
        return payload.get("results", [])


@dataclass
class SemanticScholarClient:
    api_key: str | None = None
    sleep_seconds: float | None = None
    max_retries: int = 3
    backoff_initial: float = 2.0
    sleep_fn: Callable[[float], None] = time.sleep

    def __post_init__(self) -> None:
        if self.sleep_seconds is None:
            self.sleep_seconds = 1.1 if self.api_key else 3.5
        self._last_request_at: float | None = None

    def get_paper(
        self,
        identifier: str,
        fields: str = SEMANTIC_SCHOLAR_PAPER_FIELDS,
    ) -> dict[str, Any]:
        params = urllib.parse.urlencode({"fields": fields})
        quoted_identifier = urllib.parse.quote(identifier, safe="")
        url = f"https://api.semanticscholar.org/graph/v1/paper/{quoted_identifier}?{params}"
        return self._request_json(url)

    def search_papers(
        self,
        query: str,
        limit: int = 5,
        fields: str = SEMANTIC_SCHOLAR_SEARCH_FIELDS,
    ) -> list[dict[str, Any]]:
        params = urllib.parse.urlencode(
            {
                "query": query,
                "limit": limit,
                "fields": fields,
            }
        )
        url = f"https://api.semanticscholar.org/graph/v1/paper/search?{params}"
        payload = self._request_json(url)
        return payload.get("data") or []

    def iter_references(
        self,
        paper_id: str,
        fields: str = SEMANTIC_SCHOLAR_REFERENCE_FIELDS,
        limit: int = 100,
    ) -> Iterator[dict[str, Any]]:
        offset = 0
        quoted_paper_id = urllib.parse.quote(paper_id, safe="")

        while True:
            params = urllib.parse.urlencode(
                {
                    "fields": fields,
                    "limit": limit,
                    "offset": offset,
                }
            )
            url = (
                "https://api.semanticscholar.org/graph/v1/paper/"
                f"{quoted_paper_id}/references?{params}"
            )
            payload = self._request_json(url)
            for item in payload.get("data") or []:
                yield item

            next_offset = payload.get("next")
            if next_offset is None:
                break
            offset = int(next_offset)

    def iter_citations(
        self,
        paper_id: str,
        fields: str = SEMANTIC_SCHOLAR_CITATION_FIELDS,
        limit: int = 100,
    ) -> Iterator[dict[str, Any]]:
        offset = 0
        quoted_paper_id = urllib.parse.quote(paper_id, safe="")

        while True:
            params = urllib.parse.urlencode(
                {
                    "fields": fields,
                    "limit": limit,
                    "offset": offset,
                }
            )
            url = (
                "https://api.semanticscholar.org/graph/v1/paper/"
                f"{quoted_paper_id}/citations?{params}"
            )
            payload = self._request_json(url)
            for item in payload.get("data") or []:
                yield item

            next_offset = payload.get("next")
            if next_offset is None:
                break
            offset = int(next_offset)

    def _headers(self) -> dict[str, str] | None:
        if not self.api_key:
            return None
        return {"x-api-key": self.api_key}

    def _request_json(self, url: str) -> dict[str, Any]:
        self._sleep_for_rate_limit()
        return _get_json(
            url,
            headers=self._headers(),
            max_retries=self.max_retries,
            backoff_initial=self.backoff_initial,
            sleep_fn=self.sleep_fn,
        )

    def _sleep_for_rate_limit(self) -> None:
        now = time.monotonic()
        if self._last_request_at is not None and self.sleep_seconds:
            elapsed = now - self._last_request_at
            remaining = self.sleep_seconds - elapsed
            if remaining > 0:
                self.sleep_fn(remaining)
        self._last_request_at = time.monotonic()


def _get_json(
    url: str,
    headers: dict[str, str] | None = None,
    max_retries: int = 0,
    retry_statuses: tuple[int, ...] = (429, 503),
    backoff_initial: float = 1.0,
    sleep_fn: Callable[[float], None] = time.sleep,
) -> dict[str, Any]:
    attempt = 0
    while True:
        request = urllib.request.Request(url, headers=headers or {})
        try:
            with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT) as response:
                return json.loads(response.read().decode("utf-8"))
        except urllib.error.HTTPError as error:
            if error.code not in retry_statuses or attempt >= max_retries:
                raise
            sleep_fn(backoff_initial * (2**attempt))
            attempt += 1
