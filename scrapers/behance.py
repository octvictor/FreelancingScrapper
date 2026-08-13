"""Behance scraper: discover CG/3D studios via public search.

Behance's search/profile pages don't require login, so this uses plain
HTTP requests + BeautifulSoup rather than a browser - much lighter and
lower-risk than the LinkedIn/Instagram scrapers.

Scope note: Behance's dedicated "Joblist" job board was discontinued a
while back, so there's no reliable job listing left to scrape there. This
module focuses on what Behance is actually still good for: discovering
studios/teams working in CG or 3D via project and user search. Treat the
`notes` field on discovered companies as a lead, not a confirmed opening -
check the studio's own site/LinkedIn for actual job posts.

Caveat: Behance's search UI is a JS-rendered React app. Depending on what
the server ships in the initial HTML response, the DOM selectors below
may come back empty for you. This was written without live network access
to verify current markup (sandboxed dev environment) - if a search with
mock=False returns 0 results, check data/debug/behance-*.html for what
was actually returned and update CARD_SELECTORS / NAME_SELECTORS to
match. If the page genuinely ships empty on first load (fully
client-rendered), this needs to be ported to Playwright the same way
linkedin_salesnav.py works.

With mock=True (the app's default), none of the above applies - see
scrapers/mock_data.py.
"""
from __future__ import annotations

import json
from datetime import datetime

from app_paths import DEBUG_DIR
from scrapers import mock_data
from storage import db

SEARCH_USERS_URL = "https://www.behance.net/search/users"
SEARCH_PROJECTS_URL = "https://www.behance.net/search/projects"

HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
        "(KHTML, like Gecko) Chrome/124.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}

# Candidate DOM selectors, tried in order - Behance's CSS-module class
# names are hashed/build-specific, so these are best-effort starting
# points; verify against data/debug/*.html and adjust as needed.
CARD_SELECTORS = ["div[data-testid='search-result']", "div[class*='SearchResult']", "a[class*='ProjectCover']"]
NAME_SELECTORS = ["a[data-testid='user-name']", "[class*='UserCard'] a", "h3", "h4"]


def _dump_debug_html(html: str, label: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (DEBUG_DIR / f"{label}-{ts}.html").write_text(html, encoding="utf-8")


def _find_embedded_json(soup) -> dict | None:
    """Best-effort: many React/Next apps embed initial page state as JSON
    in a <script> tag - try the common patterns before giving up on a
    page that looked empty via plain DOM selectors."""
    for script in soup.find_all("script"):
        if script.get("id") in {"__NEXT_DATA__", "beconfig-store_state"}:
            try:
                return json.loads(script.string or "{}")
            except (json.JSONDecodeError, TypeError):
                continue
    return None


def _fetch(url: str, params: dict):
    import requests

    resp = requests.get(url, params=params, headers=HEADERS, timeout=20)
    resp.raise_for_status()
    from bs4 import BeautifulSoup

    return BeautifulSoup(resp.text, "html.parser")


def _absolute(url: str) -> str:
    return f"https://www.behance.net{url}" if url.startswith("/") else url


def search_users(query: str, pages: int = 1, mock: bool = True) -> list[dict]:
    """Search Behance user/team profiles matching `query`, e.g. "3D studio"."""
    db.init_db()
    run_id = db.start_run("behance_users", query)

    if mock:
        results = mock_data.behance_leads(query)
        for r in results:
            db.upsert_company(r["name"], "behance", url=r["profile_url"], notes=f"matched user search: {query}")
        db.finish_run(run_id, len(results))
        return results

    results: list[dict] = []
    seen: set[str] = set()
    try:
        for page_num in range(1, pages + 1):
            soup = _fetch(SEARCH_USERS_URL, {"search": query, "page": page_num})

            cards = []
            for sel in CARD_SELECTORS:
                cards = soup.select(sel)
                if cards:
                    break
            if not cards:
                _dump_debug_html(str(soup), f"behance-users-{query}")
                continue

            for card in cards:
                name_el = None
                for sel in NAME_SELECTORS:
                    name_el = card.select_one(sel)
                    if name_el:
                        break
                link_el = card if card.name == "a" else card.find("a")
                name = name_el.get_text(strip=True) if name_el else None
                href = link_el.get("href") if link_el else None
                if not name or not href:
                    continue
                url = _absolute(href)
                if url in seen:
                    continue
                seen.add(url)
                results.append({"name": name, "profile_url": url})
                db.upsert_company(name, "behance", url=url, notes=f"matched user search: {query}")

        db.finish_run(run_id, len(results))
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(results), status="failed", error=str(exc))
        raise
    return results


def search_projects_for_studios(query: str, pages: int = 1, mock: bool = True) -> list[dict]:
    """Search Behance projects (e.g. "3D animation studio") and pull the
    owning creator/team as a possible studio lead."""
    db.init_db()
    run_id = db.start_run("behance_projects", query)

    if mock:
        results = mock_data.behance_leads(query)
        for r in results:
            db.upsert_company(r["name"], "behance", url=r["profile_url"], notes=f"matched project search: {query}")
        db.finish_run(run_id, len(results))
        return results

    results: list[dict] = []
    seen: set[str] = set()
    try:
        for page_num in range(1, pages + 1):
            soup = _fetch(SEARCH_PROJECTS_URL, {"search": query, "page": page_num})
            owner_links = soup.select("a[href*='/user/'], [class*='Owners'] a")
            if not owner_links:
                _dump_debug_html(str(soup), f"behance-projects-{query}")
                continue

            for a in owner_links:
                name = a.get_text(strip=True)
                href = a.get("href")
                if not name or not href:
                    continue
                url = _absolute(href)
                if url in seen:
                    continue
                seen.add(url)
                results.append({"name": name, "profile_url": url})
                db.upsert_company(name, "behance", url=url, notes=f"matched project search: {query}")

        db.finish_run(run_id, len(results))
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(results), status="failed", error=str(exc))
        raise
    return results
