"""Resolves where the app keeps its persistent state: the SQLite DB, saved
browser login sessions, debug HTML dumps, and .env.

This has to give the same answer whether the app is running from source
(`streamlit run app.py`) or from a PyInstaller-frozen build. In a frozen
onefile build, `__file__` for bundled modules points inside a temp
directory that PyInstaller extracts fresh on every launch and deletes
afterward - anchoring paths there would silently wipe the database and
force a fresh LinkedIn login (checkpoint and all) every single
time the app is opened. `sys.executable`'s directory, by contrast, stays
constant between launches, so that's what frozen builds anchor to.
"""
from __future__ import annotations

import sys
from pathlib import Path


def _app_root() -> Path:
    if getattr(sys, "frozen", False):
        return Path(sys.executable).resolve().parent
    return Path(__file__).resolve().parent


APP_ROOT = _app_root()
DATA_DIR = APP_ROOT / "data"
BROWSER_DATA_DIR = APP_ROOT / "browser_data"
DEBUG_DIR = DATA_DIR / "debug"
ENV_PATH = APP_ROOT / ".env"
DB_PATH = DATA_DIR / "scraper.db"
