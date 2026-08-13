"""Behance scraper: paste a Behance search/listing URL, get the results
into the shared DB.

Why paste-a-URL instead of building the query ourselves (like the old
version of this file did): Behance's search endpoints now return a flat
403 on a plain HTTP request, even with a browser-like User-Agent - their
bot protection blocks the request itself, not just serving JS-only
content. A real browser (Playwright, same approach as the LinkedIn tab)
gets past that.

Once we're driving a real browser anyway, pasting a URL you built on
behance.net itself - search by keyword, filter by the Tools used on a
project, their Jobs search, any filter combination - covers all of it
automatically, with no need to reverse-engineer Behance's query
parameters (which aren't publicly documented and can't be verified from
this dev environment - no live network access to behance.net).

How to get a URL: go to behance.net, search or filter however you like
(keyword, Tools filter, Jobs section, etc.), and copy the URL from your
address bar.

Selectors below are best-effort and unverified against live markup for
the same reason. If a mock=False run comes back with 0 results, check
data/debug/behance-*.html for what was actually returned and update
RESULT_LINK_SELECTORS to match.

With mock=True (the app's default), none of the above applies - see
scrapers/mock_data.py.
"""
from __future__ import annotations

from datetime import datetime
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from app_paths import DEBUG_DIR
from scrapers import mock_data
from scrapers.common import launch_persistent_context, random_delay
from storage import db

# Candidate selectors for a result link, tried together (union, not
# first-match) since a listing page can mix profile/project/job links.
RESULT_LINK_SELECTORS = [
    "a[href*='/gallery/']",
    "a[href*='/user/']",
    "a[href*='/joblist/']",
    "a[href*='/job/']",
]


def _dump_debug_html(html: str, label: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (DEBUG_DIR / f"{label}-{ts}.html").write_text(html, encoding="utf-8")


def _with_page_param(url: str, page_num: int) -> str:
    parts = urlsplit(url)
    query = dict(parse_qsl(parts.query))
    query["page"] = str(page_num)
    return urlunsplit(parts._replace(query=urlencode(query)))


def _is_job_url(url: str) -> bool:
    return "/joblist/" in url or "/job/" in url


def _absolute(url: str) -> str:
    return url if url.startswith("http") else f"https://www.behance.net{url}"


def search(url: str, pages: int = 1, mock: bool = True) -> list[dict]:
    """Scrape a Behance search/listing URL you built yourself - project or
    user search, the Tools filter, Jobs, or any combination. See the
    module docstring for how to get that URL.
    """
    db.init_db()
    run_id = db.start_run("behance", url or "(mock)")

    if mock:
        results = mock_data.behance_leads(url or "3D studio")
        for r in results:
            db.upsert_company(r["name"], "behance", url=r["profile_url"], notes="mock result")
        db.finish_run(run_id, len(results))
        return results

    if not url:
        db.finish_run(run_id, 0, status="failed", error="missing url")
        raise RuntimeError("Paste a Behance search URL first (or turn on Mock mode).")

    from playwright.sync_api import sync_playwright  # imported lazily: not needed at all in mock mode

    results: list[dict] = []
    seen: set[str] = set()
    try:
        with sync_playwright() as p:
            context = launch_persistent_context(p, "behance")
            page = context.new_page()

            for page_num in range(1, pages + 1):
                page.goto(_with_page_param(url, page_num), wait_until="networkidle", timeout=30000)
                random_delay(1.5, 3.0)

                links = []
                for sel in RESULT_LINK_SELECTORS:
                    links.extend(page.query_selector_all(sel))

                if not links:
                    _dump_debug_html(page.content(), "behance-no-results")
                    continue

                for a in links:
                    href = a.get_attribute("href") or ""
                    text = (a.inner_text() or "").strip()
                    if not href or not text:
                        continue
                    full_url = _absolute(href)
                    if full_url in seen:
                        continue
                    seen.add(full_url)

                    if _is_job_url(full_url):
                        db.insert_job(
                            title=text, company_name=None, url=full_url,
                            location=None, description=None, source="behance",
                        )
                        results.append({"name": text, "url": full_url, "type": "job"})
                    else:
                        db.upsert_company(text, "behance", url=full_url, notes=f"from: {url}")
                        results.append({"name": text, "url": full_url, "type": "studio"})

            context.close()

        db.finish_run(run_id, len(results))
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(results), status="failed", error=str(exc))
        raise

    return results
