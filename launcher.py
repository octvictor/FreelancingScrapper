"""Entry point for the packaged (PyInstaller) build - what run.sh/run.bat
run from source, and what the built .exe/.app runs when double-clicked.

Runs the same FastAPI app (server:app) `uvicorn server:app` would from a
terminal - this just does it from Python so the frozen build doesn't
need a `uvicorn` CLI on PATH, and opens the browser automatically since
there's no terminal to read the URL from once packaged.
"""
from __future__ import annotations

import threading
import time
import webbrowser

import uvicorn

# Defensive: api/scrapper.py only imports this lazily, inside a function
# body, when a scrape actually runs. PyInstaller's static analysis scans
# function bodies too so this is normally redundant, but an explicit
# top-level import here is cheap insurance against it being missed.
import scrapers.linkedin_salesnav  # noqa: F401
from server import app

HOST = "127.0.0.1"
PORT = 8501


def _open_browser() -> None:
    time.sleep(1.2)
    webbrowser.open(f"http://{HOST}:{PORT}")


if __name__ == "__main__":
    threading.Thread(target=_open_browser, daemon=True).start()
    uvicorn.run(app, host=HOST, port=PORT)
