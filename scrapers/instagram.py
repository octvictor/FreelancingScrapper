"""Instagram scraper: check studio accounts for hiring signals.

Instagram is the most restrictive of the three sources - there is no
usable public API for search, and most content (including hashtag pages)
requires a logged-in session to view. That rules out "discover random
studios via hashtag" as a reliable primary workflow. What actually works
reasonably well:

  1. `scan_profiles(usernames)` - given a list of studio Instagram handles
     you already know about (curated by you, or fed in from the
     LinkedIn/Behance results), log in and check each profile's bio for
     hiring language ("we're hiring", "now hiring", "open position", ...)
     and pull the external link (often a careers page). This is the
     supported, low-volume, low-risk default.

  2. `search_hashtag(tag)` - best-effort hashtag scraping (e.g. #3dartist,
     #cgjobs) for discovery. This is explicitly higher risk: Instagram is
     aggressive about flagging automated hashtag/explore browsing on
     logged-in accounts, up to requiring phone/ID verification to unlock
     the account again. Use sparingly, in small batches, or skip it and
     rely on manual discovery + option 1.

Login checkpoints (suspicious-login prompts, 2FA, "confirm it's you")
can't be solved by this script. With BROWSER_HEADLESS=False (the default)
the browser window is visible - solve it by hand and the script continues.

Selectors here are best-effort and unverified against live markup (this
was built in a sandboxed dev environment with no network access to
instagram.com) - Instagram's DOM changes often, so check
data/debug/instagram-*.html and adjust if a mock=False run comes back
empty.

With mock=True (the app's default), none of the above applies - see
scrapers/mock_data.py.
"""
from __future__ import annotations

import json
import time
from datetime import datetime

from app_paths import DEBUG_DIR
from scrapers import mock_data
from scrapers.common import env, launch_persistent_context, random_delay
from storage import db

LOGIN_URL = "https://www.instagram.com/accounts/login/"

HIRING_KEYWORDS = [
    "we're hiring", "we are hiring", "now hiring", "hiring now",
    "open position", "open role", "job opening", "join our team",
    "careers page", "we're recruiting",
]

BIO_SELECTORS = ["header section div.-vDIg span", "header section div[class*='bio']"]
EXTERNAL_LINK_SELECTORS = ["header section a[href*='l.instagram.com']", "header a[rel='me nofollow noopener noreferrer']"]


def _dump_debug_html(page, label: str) -> None:
    DEBUG_DIR.mkdir(parents=True, exist_ok=True)
    ts = datetime.now().strftime("%Y%m%d-%H%M%S")
    (DEBUG_DIR / f"{label}-{ts}.html").write_text(page.content(), encoding="utf-8")


def _is_checkpoint(page) -> bool:
    url = page.url
    return "challenge" in url or "two_factor" in url or "checkpoint" in url


def login(page, username: str, password: str, wait_for_manual_checkpoint_sec: int = 180) -> None:
    page.goto("https://www.instagram.com/", wait_until="domcontentloaded")
    if page.query_selector("input[name='username']") is None and "instagram.com" in page.url:
        return  # already logged in via the persisted session

    page.goto(LOGIN_URL, wait_until="domcontentloaded")
    if page.query_selector("input[name='username']"):
        page.fill("input[name='username']", username)
        page.fill("input[name='password']", password)
        random_delay(0.5, 1.5)
        page.click("button[type='submit']")
        page.wait_for_load_state("domcontentloaded")

    if _is_checkpoint(page):
        print(
            "[instagram] Login checkpoint/verification detected. Complete it "
            f"by hand in the open browser window - waiting up to {wait_for_manual_checkpoint_sec}s..."
        )
        deadline = time.time() + wait_for_manual_checkpoint_sec
        while time.time() < deadline and _is_checkpoint(page):
            time.sleep(2)
        if _is_checkpoint(page):
            raise RuntimeError("Instagram login checkpoint was not resolved in time.")


def _extract_ld_json(page) -> dict | None:
    """Public profile pages typically embed an application/ld+json block
    with basic name/description info - a lighter, more stable source than
    the main DOM when it's present."""
    for script in page.query_selector_all("script[type='application/ld+json']"):
        try:
            data = json.loads(script.inner_text())
        except (json.JSONDecodeError, TypeError):
            continue
        if isinstance(data, dict) and data.get("@type") in {"Person", "ProfilePage"}:
            return data
    return None


def _profile_bio_and_link(page) -> tuple[str, str]:
    bio = ""
    for sel in BIO_SELECTORS:
        el = page.query_selector(sel)
        if el:
            bio = el.inner_text().strip()
            if bio:
                break
    link = ""
    for sel in EXTERNAL_LINK_SELECTORS:
        el = page.query_selector(sel)
        if el:
            link = el.get_attribute("href") or ""
            if link:
                break
    return bio, link


def get_profile_info(page, username: str) -> dict:
    page.goto(f"https://www.instagram.com/{username}/", wait_until="domcontentloaded")
    random_delay(1.5, 3.0)

    ld_json = _extract_ld_json(page)
    bio, external_link = _profile_bio_and_link(page)

    if not bio and not ld_json:
        _dump_debug_html(page, f"instagram-profile-{username}")

    description = (ld_json or {}).get("description", "") if ld_json else ""
    full_name = (ld_json or {}).get("name", username) if ld_json else username
    combined_text = f"{bio} {description}".lower()
    is_hiring = any(kw in combined_text for kw in HIRING_KEYWORDS)

    return {
        "username": username,
        "full_name": full_name,
        "bio": bio or description,
        "external_link": external_link,
        "is_hiring": is_hiring,
        "profile_url": f"https://www.instagram.com/{username}/",
    }


def _save_profile(info: dict) -> None:
    db.upsert_company(
        info["full_name"] or info["username"],
        "instagram",
        url=info["external_link"] or info["profile_url"],
        notes=info["bio"][:500],
    )
    if info["is_hiring"]:
        db.insert_job(
            title="(unspecified - see bio/profile)",
            company_name=info["full_name"] or info["username"],
            url=info["profile_url"],
            location=None,
            description=info["bio"],
            source="instagram",
        )


def scan_profiles(usernames: list[str], run_label: str | None = None, mock: bool = True) -> list[dict]:
    """Log in once, then check each given Instagram handle's bio for
    hiring language. Low-volume by design - pass a curated list, not a
    firehose."""
    db.init_db()
    run_id = db.start_run("instagram_profiles", run_label or ", ".join(usernames) or "(mock)")

    if mock:
        results = mock_data.instagram_profiles(usernames)
        for info in results:
            _save_profile(info)
        db.finish_run(run_id, len(results))
        return results

    ig_user = env("INSTAGRAM_USERNAME")
    ig_pass = env("INSTAGRAM_PASSWORD")
    if not ig_user or not ig_pass:
        db.finish_run(run_id, 0, status="failed", error="missing credentials")
        raise RuntimeError("Set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD in .env (or the Settings tab) first.")

    from playwright.sync_api import sync_playwright  # imported lazily: not needed at all in mock mode

    results: list[dict] = []
    try:
        with sync_playwright() as p:
            context = launch_persistent_context(p, "instagram")
            page = context.new_page()
            login(page, ig_user, ig_pass)

            for username in usernames:
                info = get_profile_info(page, username)
                results.append(info)
                _save_profile(info)
                random_delay()

            context.close()

        db.finish_run(run_id, len(results))
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(results), status="failed", error=str(exc))
        raise

    return results


def search_hashtag(tag: str, max_posts: int = 20, mock: bool = True) -> list[dict]:
    """Best-effort hashtag discovery. Higher risk than scan_profiles - see
    module docstring. Returns post URLs found on the hashtag page; it does
    not open each post (that would multiply the request volume and risk
    further), so treat this as a list of leads to review by hand."""
    db.init_db()
    run_id = db.start_run("instagram_hashtag", tag or "(mock)")

    if mock:
        results = mock_data.instagram_hashtag_posts(tag, max_posts)
        db.finish_run(run_id, len(results))
        return results

    ig_user = env("INSTAGRAM_USERNAME")
    ig_pass = env("INSTAGRAM_PASSWORD")
    if not ig_user or not ig_pass:
        db.finish_run(run_id, 0, status="failed", error="missing credentials")
        raise RuntimeError("Set INSTAGRAM_USERNAME and INSTAGRAM_PASSWORD in .env (or the Settings tab) first.")

    from playwright.sync_api import sync_playwright  # imported lazily: not needed at all in mock mode

    post_urls: list[str] = []
    try:
        with sync_playwright() as p:
            context = launch_persistent_context(p, "instagram")
            page = context.new_page()
            login(page, ig_user, ig_pass)

            page.goto(f"https://www.instagram.com/explore/tags/{tag}/", wait_until="domcontentloaded")
            random_delay()

            seen: set[str] = set()
            scroll_attempts = 0
            while len(post_urls) < max_posts and scroll_attempts < 10:
                links = page.query_selector_all("article a")
                if not links:
                    _dump_debug_html(page, f"instagram-hashtag-{tag}")
                for a in links:
                    href = a.get_attribute("href") or ""
                    if "/p/" in href and href not in seen:
                        seen.add(href)
                        post_urls.append(f"https://www.instagram.com{href}")
                        if len(post_urls) >= max_posts:
                            break
                page.mouse.wheel(0, 2000)
                random_delay(1.5, 3.0)
                scroll_attempts += 1

            context.close()

        results = [{"post_url": u, "hashtag": tag} for u in post_urls]
        db.finish_run(run_id, len(results))
    except Exception as exc:  # noqa: BLE001 - log the failure on the run, then re-raise for the caller/UI
        db.finish_run(run_id, len(post_urls), status="failed", error=str(exc))
        raise

    return results
