"""Shared helpers for the login-based scrapers (LinkedIn, Instagram)."""
from __future__ import annotations

import os
import random
import time

from dotenv import load_dotenv

from app_paths import BROWSER_DATA_DIR, ENV_PATH

load_dotenv(ENV_PATH)


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def is_headless() -> bool:
    return env("BROWSER_HEADLESS", "False").strip().lower() in {"1", "true", "yes"}


def default_mock_mode() -> bool:
    """Fallback used only before the app's sidebar toggle has set anything -
    every scraper call in the app itself is passed an explicit `mock`
    argument driven by that toggle, this is just the .env-configured
    starting value."""
    return env("MOCK_MODE", "True").strip().lower() in {"1", "true", "yes"}


def random_delay(min_override: float | None = None, max_override: float | None = None) -> None:
    """Sleep a random, human-ish amount between page actions.

    This is the main defense against getting rate-limited or flagged as a
    bot - keep it, don't shorten it just to make a run finish faster.
    """
    lo = min_override if min_override is not None else float(env("SCRAPE_DELAY_MIN", "2.0"))
    hi = max_override if max_override is not None else float(env("SCRAPE_DELAY_MAX", "5.0"))
    time.sleep(random.uniform(lo, hi))


def ensure_chromium_installed(playwright) -> None:
    """Download Playwright's Chromium if it isn't already present.

    Called lazily, only from launch_persistent_context() - i.e. only when
    a real (mock=False) LinkedIn/Instagram scrape actually runs - not on
    every app launch. Mock mode and the packaged app's first boot never
    pay this cost, which can take 1-2 minutes and needs a normal internet
    connection. From source, `playwright install chromium` already covers
    this in the one-time setup; this is the safety net for the packaged
    build, which has no terminal to run that command from.
    """
    try:
        browser = playwright.chromium.launch(headless=True)
        browser.close()
        return
    except Exception:
        pass

    print("First real scrape: downloading the browser component (one-time, ~1-2 minutes)...")
    import sys

    from playwright.__main__ import main as playwright_main

    old_argv = sys.argv
    sys.argv = ["playwright", "install", "chromium"]
    try:
        playwright_main()
    except SystemExit as exc:
        if exc.code not in (None, 0):
            raise RuntimeError(
                "Couldn't download the browser component - check your internet connection and try again."
            ) from exc
    finally:
        sys.argv = old_argv


def launch_persistent_context(playwright, session_name: str):
    """Launch a Chromium context whose cookies/local storage persist on disk.

    Reusing the session means logging in once instead of on every run -
    repeated fresh logins are one of the things that gets automation
    flagged, so this is a deliberate anti-detection measure, not just
    convenience.
    """
    ensure_chromium_installed(playwright)
    user_data_dir = BROWSER_DATA_DIR / session_name
    user_data_dir.mkdir(parents=True, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        str(user_data_dir),
        headless=is_headless(),
        viewport={"width": 1366, "height": 900},
    )
