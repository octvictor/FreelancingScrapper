"""Resolves where the app keeps its persistent state: the SQLite DB and
uploaded project docs.

This has to give the same answer whether the app is running from source
or from a PyInstaller-frozen build. In a frozen onefile build, `__file__`
for bundled modules points inside a temp directory that PyInstaller
extracts fresh on every launch and deletes afterward - anchoring paths
there would silently wipe the database every single time the app is
opened. `sys.executable`'s directory, by contrast, stays constant between
launches, so that's what frozen builds anchor to.
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
PROJECT_DOCS_DIR = DATA_DIR / "project_docs"

# The DB was called scraper.db back when this app was a job scraper. It
# gets renamed once, here, rather than asking anyone to move a file by
# hand - and deliberately at import time, because storage/db.py takes
# DB_PATH from this module and its get_connection() *creates* the file
# if it's missing. Resolving the name any later would risk sqlite
# happily making a new empty vaio.db while the real data sat untouched
# in scraper.db next to it.
#
# Every branch below is written to fail toward keeping data:
#   - if vaio.db already exists, use it and never touch the legacy file
#     (so a stray leftover scraper.db can't clobber the live DB);
#   - if there's nothing to migrate, just use the new name;
#   - if the rename itself fails - most likely on Windows, where a file
#     open in another process can't be renamed - keep using scraper.db
#     rather than silently starting from an empty database. The rename
#     is retried on the next launch.
LEGACY_DB_PATH = DATA_DIR / "scraper.db"


def _resolve_db_path() -> Path:
    current = DATA_DIR / "vaio.db"
    if current.exists() or not LEGACY_DB_PATH.exists():
        return current
    try:
        LEGACY_DB_PATH.rename(current)
    except OSError:
        return LEGACY_DB_PATH
    return current


DB_PATH = _resolve_db_path()
