"""Shared helpers for the login-based scrapers (LinkedIn, Instagram)."""
from __future__ import annotations

import os
import random
import time
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

PROJECT_ROOT = Path(__file__).resolve().parent.parent
BROWSER_DATA_DIR = PROJECT_ROOT / "browser_data"


def env(name: str, default: str = "") -> str:
    return os.environ.get(name, default)


def is_headless() -> bool:
    return env("BROWSER_HEADLESS", "False").strip().lower() in {"1", "true", "yes"}


def random_delay(min_override: float | None = None, max_override: float | None = None) -> None:
    """Sleep a random, human-ish amount between page actions.

    This is the main defense against getting rate-limited or flagged as a
    bot - keep it, don't shorten it just to make a run finish faster.
    """
    lo = min_override if min_override is not None else float(env("SCRAPE_DELAY_MIN", "2.0"))
    hi = max_override if max_override is not None else float(env("SCRAPE_DELAY_MAX", "5.0"))
    time.sleep(random.uniform(lo, hi))


def launch_persistent_context(playwright, session_name: str):
    """Launch a Chromium context whose cookies/local storage persist on disk.

    Reusing the session means logging in once instead of on every run -
    repeated fresh logins are one of the things that gets automation
    flagged, so this is a deliberate anti-detection measure, not just
    convenience.
    """
    user_data_dir = BROWSER_DATA_DIR / session_name
    user_data_dir.mkdir(parents=True, exist_ok=True)
    return playwright.chromium.launch_persistent_context(
        str(user_data_dir),
        headless=is_headless(),
        viewport={"width": 1366, "height": 900},
    )
