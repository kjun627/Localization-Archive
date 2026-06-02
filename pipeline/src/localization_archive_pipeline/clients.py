from __future__ import annotations

import json
import urllib.parse
import urllib.request
from dataclasses import dataclass
from typing import Any


DEFAULT_TIMEOUT = 30


@dataclass
class OpenAlexClient:
    api_key: str
    mailto: str = "localization-archive@example.com"

    def search_works(self, query: str, per_page: int = 15) -> list[dict[str, Any]]:
        params = urllib.parse.urlencode(
            {
                "search": query,
                "per-page": per_page,
                "mailto": self.mailto,
                "api_key": self.api_key,
            }
        )
        url = f"https://api.openalex.org/works?{params}"
        payload = _get_json(url)
        return payload.get("results", [])


@dataclass
class SemanticScholarClient:
    api_key: str

    def get_paper(self, paper_id: str) -> dict[str, Any]:
        params = urllib.parse.urlencode(
            {
                "fields": "paperId,title,abstract,venue,year,url,referenceCount,citationCount,openAccessPdf"
            }
        )
        url = f"https://api.semanticscholar.org/graph/v1/paper/{urllib.parse.quote(paper_id)}?{params}"
        return _get_json(url, headers={"x-api-key": self.api_key})


def _get_json(url: str, headers: dict[str, str] | None = None) -> dict[str, Any]:
    request = urllib.request.Request(url, headers=headers or {})
    with urllib.request.urlopen(request, timeout=DEFAULT_TIMEOUT) as response:
        return json.loads(response.read().decode("utf-8"))

