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
from dotenv import load_dotenv, set_key  # noqa: F401

import app_paths  # noqa: F401
import storage.db  # noqa: F401
import scrapers.common  # noqa: F401
import scrapers.mock_data  # noqa: F401
import scrapers.linkedin_salesnav  # noqa: F401
import scrapers.instagram  # noqa: F401


def _bundled_app_py() -> str:
    """app.py's source is bundled as a data file (see build_app.sh/.bat)
    and needs to be handed to Streamlit as a real file path - unlike the
    modules above, Streamlit reads and execs this file directly rather
    than importing it, so it has to exist on disk at runtime."""
    base = Path(getattr(sys, "_MEIPASS", Path(__file__).resolve().parent))
    return str(base / "app.py")


if __name__ == "__main__":
    # Note: the browser component (Chromium) is NOT downloaded here at
    # startup on purpose - see scrapers/common.py:ensure_chromium_installed.
    # It's fetched lazily on first real (mock=False) scrape instead, so
    # Safe mode and every other tab stay instant with no network dependency.
    from streamlit.web import cli as stcli

    sys.argv = ["streamlit", "run", _bundled_app_py(), "--global.developmentMode=false"]
    sys.exit(stcli.main())
