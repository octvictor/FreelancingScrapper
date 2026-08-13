"""Freelancing Tools - FastAPI backend + static frontend server.

Run with: uvicorn server:app --reload (or ./run.sh / run.bat)
"""
from __future__ import annotations

from pathlib import Path

from fastapi import FastAPI
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from api.scrapper import router as scrapper_router

FRONTEND_DIR = Path(__file__).resolve().parent / "frontend"

app = FastAPI(title="Freelancing Tools")
app.include_router(scrapper_router, prefix="/api/scrapper")
app.mount("/static", StaticFiles(directory=FRONTEND_DIR / "static"), name="static")


@app.get("/")
def index():
    return FileResponse(FRONTEND_DIR / "index.html")
