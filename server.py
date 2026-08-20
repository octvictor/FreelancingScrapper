"""VAIO - FastAPI backend + static frontend server.

Run with: uvicorn server:app --reload (or ./run.sh / run.bat)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.gatherer import router as gatherer_router
from api.tracker import router as tracker_router
from api.todo import router as todo_router
from api.notes import router as notes_router
from api.finance import router as finance_router
from api.overview import router as overview_router

FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"


class NoCacheStaticFiles(StaticFiles):
    """Without an explicit Cache-Control header, browsers apply their own
    heuristic caching to static files and can keep serving a stale
    index.html/JS/CSS for a while after a `git pull` even across a plain
    refresh - confusing during active development, where a file changing
    is the whole point. `no-cache` still allows conditional (304) responses
    via the ETag/Last-Modified StaticFiles already sets, so this doesn't
    disable caching outright, it just forces a freshness check every time."""

    def file_response(self, *args, **kwargs):
        response = super().file_response(*args, **kwargs)
        response.headers["Cache-Control"] = "no-cache"
        return response


app = FastAPI(title="VAIO")
app.include_router(gatherer_router, prefix="/api/gatherer")
app.include_router(tracker_router, prefix="/api/tracker")
app.include_router(todo_router, prefix="/api/todo")
app.include_router(notes_router, prefix="/api/notes")
app.include_router(finance_router, prefix="/api/finance")
app.include_router(overview_router, prefix="/api/overview")
app.mount("/static", NoCacheStaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html", headers={"Cache-Control": "no-cache"})
