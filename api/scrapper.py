"""API routes for the Scrapper tool - thin HTTP wrapper around
scrapers/linkedin_salesnav.py and storage/db.py. Those modules have no
UI-framework dependency, so this is the only file that changed when the
frontend moved off Streamlit.
"""
from __future__ import annotations

import os

from dotenv import load_dotenv, set_key
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app_paths import ENV_PATH
from scrapers.common import default_mock_mode
from storage import db

load_dotenv(ENV_PATH)
db.init_db()

router = APIRouter()


class ScrapeRequest(BaseModel):
    search_url: str = ""
    max_results: int = 10
    mock: bool = True


class SettingsRequest(BaseModel):
    linkedin_email: str = ""
    linkedin_password: str = ""
    headless: bool = False
    delay_min: float = 2.0
    delay_max: float = 5.0


@router.get("/status")
def status():
    return {
        "safe_mode_default": default_mock_mode(),
        "linkedin_configured": bool(os.environ.get("LINKEDIN_EMAIL")),
    }


@router.get("/settings")
def get_settings():
    return {
        "linkedin_email": os.environ.get("LINKEDIN_EMAIL", ""),
        "headless": os.environ.get("BROWSER_HEADLESS", "False").strip().lower() in {"1", "true", "yes"},
        "delay_min": float(os.environ.get("SCRAPE_DELAY_MIN", 2.0)),
        "delay_max": float(os.environ.get("SCRAPE_DELAY_MAX", 5.0)),
    }


@router.post("/settings")
def save_settings(payload: SettingsRequest):
    updates = {
        "BROWSER_HEADLESS": str(payload.headless),
        "SCRAPE_DELAY_MIN": str(payload.delay_min),
        "SCRAPE_DELAY_MAX": str(payload.delay_max),
    }
    if payload.linkedin_email:
        updates["LINKEDIN_EMAIL"] = payload.linkedin_email
    if payload.linkedin_password:
        updates["LINKEDIN_PASSWORD"] = payload.linkedin_password

    for key, value in updates.items():
        set_key(str(ENV_PATH), key, value)
    load_dotenv(ENV_PATH, override=True)
    return {"ok": True}


@router.post("/scrape")
def scrape(payload: ScrapeRequest):
    from scrapers import linkedin_salesnav  # lazy: keeps Playwright out of the import path for mock-only usage

    if not payload.mock and not payload.search_url:
        raise HTTPException(400, "Paste a Sales Navigator search URL first (or turn on Safe mode).")
    if not payload.mock and not os.environ.get("LINKEDIN_EMAIL"):
        raise HTTPException(400, "Set your LinkedIn credentials in Settings first (or turn on Safe mode).")

    try:
        results = linkedin_salesnav.scrape_search(
            payload.search_url, max_results=payload.max_results, mock=payload.mock
        )
    except Exception as exc:  # noqa: BLE001 - surface scraper failures to the frontend instead of a bare 500
        raise HTTPException(500, str(exc)) from exc

    return {"results": results}


@router.post("/reset")
def reset():
    for table in ["companies", "people", "job_postings", "scrape_runs"]:
        db.clear_table(table)
    return {"ok": True}
