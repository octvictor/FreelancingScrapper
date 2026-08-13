"""LinkedIn Sales Navigator scraper.

Personal-use tool: drives a real, logged-in browser session under YOUR OWN
LinkedIn account against a Sales Navigator lead search you already built
(e.g. current title contains "3D Artist" OR "CG Artist"), and pulls the
visible results - name, title, company, location, profile URL - into the
shared SQLite DB. That gives you both a people list and, via the company
names attached to each lead, a derived list of studios that employ 3D
artists.

Read this before running with `mock=False` at any real volume:
  - This automates an *authenticated* session, a materially higher-risk
    activity than scraping public pages. LinkedIn actively detects and bans
    automation on Sales Navigator. Keep runs small (tens, not hundreds) and
    keep SCRAPE_DELAY_* in .env conservative.
  - Sales Navigator's DOM changes fairly often. The selectors below are a
    best-effort starting point, not a guarantee. If a run comes back empty,
    check data/debug/*.html (dumped automatically on a no-results page) and
    update the selector lists to match what LinkedIn is currently
    rendering.
  - Login checkpoints (2FA, "verify it's you", CAPTCHA) can't be solved by
    this script. With BROWSER_HEADLESS=False (the default) the browser
    window is visible - solve the checkpoint by hand and the script
    continues on its own.

With `mock=True` (the app's default), none of the above applies - no
browser, no network, no login. See scrapers/mock_data.py.
"""
from __future__ import annotations

import time
from datetime import datetime

from app_paths import DEBUG_DIR
from scrapers import mock_data
from scrapers.common import env, launch_persistent_context, random_delay
from storage import db

LOGIN_URL = "https://www.linkedin.com/login"

# Candidate selectors per field, tried in order. Sales Navigator's markup
# shifts between rollouts, so we don't rely on a single selector.
RESULT_ITEM_SELECTORS = [
    "ol.artdeco-list li.artdeco-list__item",
    "li.search-results__result-item",
    "div[data-x-search-result='LEAD']",
]
NAME_SELECTORS = [
    "a[data-anonymize='person-name']",
    ".artdeco-entity-lockup__title a",
    "a.result-lockup__name",
]
TITLE_SELECTORS = ["span[data-anonymize='title']", ".artdeco-entity-lockup__subtitle"]
COMPANY_SELECTORS = ["a[data-anonymize='company-name']", ".artdeco-entity-lockup__subtitle a"]
LOCATION_SELECTORS = [".artdeco-entity-lockup__caption", "span[data-anonymize='location']"]
NEXT_BUTTON_SELECTORS = ["button[aria-label='Next']", "button.search-results__pagination-next"]


def _first_match_text(scope, selectors: list[str]) -> str:
    for sel in selectors:
        el = scope.query_selector(sel)
        if el:
            text = el.inner_text().strip()
            if text:
                return text
    return ""


def _first_match_href(scope, selectors: list[str]) -> str:
    for sel in selectors:
        el = scope.query_selector(sel)
        if el:
            href = el.get_attribute("href") or ""
            if href:
                return href.split("?")[0]
    return ""


def _dump_debug_html(page, label: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (DEBUG_DIR / f"{label}-{ts}.html").write_text(page.content(), encoding="utf-8")


def _is_checkpoint(page) -> bool:
    url = page.url
    return "checkpoint" in url or "challenge" in url


def login(page, email: str, password: str, wait_for_manual_checkpoint_sec: int = 180) -> None:
    page.goto("https://www.linkedin.com/feed/", wait_until="domcontentloaded")
    if "linkedin.com/feed" in page.url and "login" not in page.url:
        return  # already logged in via the persisted session

    page.goto(LOGIN_URL, wait_until="domcontentloaded")
    if page.query_selector("#username"):
        page.fill("#username", email)
        page.fill("#password", password)
        random_delay(0.5, 1.5)
        page.click("button[type='submit']")
        page.wait_for_load_state("domcontentloaded")

    if _is_checkpoint(page):
        print(
            "[linkedin] Login checkpoint/verification detected. Complete it by "
            f"hand in the open browser window - waiting up to {wait_for_manual_checkpoint_sec}s..."
        )
        deadline = time.time() + wait_for_manual_checkpoint_sec
        while time.time() < deadline and _is_checkpoint(page):
            time.sleep(2)
        if _is_checkpoint(page):
            raise RuntimeError("LinkedIn login checkpoint was not resolved in time.")


def _save(results: list[dict]) -> None:
    for r in results:
        db.insert_person(r["name"], r["title"], r["company_name"], r["location"], r["profile_url"], "linkedin_salesnav")


def scrape_search(search_url: str, max_results: int = 10, run_label: str | None = None, mock: bool = True) -> list[dict]:
    """Scrape up to `max_results` leads from a Sales Navigator search URL.

    `search_url` should be a URL you get by building/saving a search inside
    Sales Navigator itself (e.g. filtered on current title) and copying it
    from the address bar - this script doesn't build the query for you.
    """
    db.init_db()
    run_id = db.start_run("linkedin_salesnav", run_label or search_url or "(mock)")

    if mock:
        results = mock_data.linkedin_leads(max_results)
        _save(results)
        db.finish_run(run_id, len(results))
        return results

    email = env("LINKEDIN_EMAIL")
    password = env("LINKEDIN_PASSWORD")
    if not email or not password:
        db.finish_run(run_id, 0, status="failed", error="missing credentials")
        raise RuntimeError("Set LINKEDIN_EMAIL and LINKEDIN_PASSWORD in .env (or the Settings tab) first.")

    from playwright.sync_api import sync_playwright  # imported lazily: not needed at all in mock mode

    results: list[dict] = []
    try:
        with sync_playwright() as p:
            context = launch_persistent_context(p, "linkedin")
            page = context.new_page()
            login(page, email, password)

            page.goto(search_url, wait_until="domcontentloaded")
            random_delay()

            seen_urls: set[str] = set()
            while len(results) < max_results:
                # nudge a scroll so lazy-loaded lead cards render
                page.mouse.wheel(0, 1500)
                random_delay(1.0, 2.5)

                items = []
                for sel in RESULT_ITEM_SELECTORS:
                    items = page.query_selector_all(sel)
                    if items:
                        break

                if not items:
                    _dump_debug_html(page, "linkedin-no-results")
                    break

                for item in items:
                    if len(results) >= max_results:
                        break
                    profile_url = _first_match_href(item, NAME_SELECTORS)
                    if not profile_url or profile_url in seen_urls:
                        continue
                    name = _first_match_text(item, NAME_SELECTORS)
                    if not name:
                        continue
                    seen_urls.add(profile_url)
                    title = _first_match_text(item, TITLE_SELECTORS)
                    company = _first_match_text(item, COMPANY_SELECTORS)
                    location = _first_match_text(item, LOCATION_SELECTORS)
                    results.append(
                        {
                            "name": name,
                            "title": title,
                            "company_name": company,
                            "location": location,
                            "profile_url": profile_url,
                        }
                    )
                    db.insert_person(name, title, company, location, profile_url, "linkedin_salesnav")

                if len(results) >= max_results:
                    break

                next_btn = None
                for sel in NEXT_BUTTON_SELECTORS:
                    next_btn = page.query_selector(sel)
                    if next_btn:
                        break
                if not next_btn or next_btn.is_disabled():
                    break
                next_btn.click()
                random_delay()

            context.close()

        db.finish_run(run_id, len(results), status="completed")
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(results), status="failed", error=str(exc))
        raise

    return results
