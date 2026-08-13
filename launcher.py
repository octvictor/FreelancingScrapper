"""Entry point for the packaged (PyInstaller) build - what run.sh/run.bat
run from source, and what the built .exe/.app runs when double-clicked.

This exists separately from `streamlit run app.py` because a frozen build
has no `streamlit` CLI on PATH to invoke - it has to be driven from
Python code instead. It also imports every scraper/storage module up
front purely so PyInstaller's static analyzer bundles them: app.py is
executed by Streamlit as a script path at runtime, not imported as a
module from here, so anything only referenced inside app.py would
otherwise be invisible to the bundler and missing from the build.
"""
from __future__ import annotations

import sys
from pathlib import Path

import pandas  # noqa: F401
import requests  # noqa: F401
from bs4 import BeautifulSoup  # noqa: F401
from dotenv import load_dotenv, set_key  # noqa: F401

import app_paths  # noqa: F401
import storage.db  # noqa: F401
import scrapers.common  # noqa: F401
import scrapers.linkedin_salesnav  # noqa: F401
import scrapers.behance  # noqa: F401
import scrapers.instagram  # noqa: F401


def _bundled_app_py() -> str:
    """app.py's source is bundled as a data file (see build_app.sh/.bat)
    and needs to be handed to Streamlit as a real file path - unlike the
    modules above, Streamlit reads and execs this file directly rather
    than importing it, so it has to exist on disk at runtime."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / "app.py")


def _ensure_chromium_installed() -> None:
    """The packaged build doesn't bundle the ~300MB Chromium binary
    itself (only the lightweight Playwright driver) - it downloads once
    on first launch instead, same as `playwright install chromium` would
    from a terminal. Requires a normal internet connection on the user's
    machine; this is a no-op on every launch after the first."""
    from playwright.sync_api import sync_playwright

    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            browser.close()
        return
    except Exception:
        pass

    print("First run: downloading the browser component (one-time, ~1-2 minutes)...")
    from playwright.__main__ import main as playwright_main

    sys.argv = ["playwright", "install", "chromium"]
    try:
        playwright_main()
    except SystemExit as exc:
        if exc.code not in (None, 0):
            # Don't take down the whole app over this - Behance and the Data
            # Browser tab don't need a browser at all. LinkedIn/Instagram
            # will surface their own clear error when actually used.
            print(f"Warning: browser download failed ({exc}). LinkedIn/Instagram tabs won't work until this succeeds.")


if __name__ == "__main__":
    _ensure_chromium_installed()

    from streamlit.web import cli as stcli

    sys.argv = ["streamlit", "run", _bundled_app_py(), "--global.developmentMode=false"]
    sys.exit(stcli.main())
