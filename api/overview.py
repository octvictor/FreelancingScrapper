"""API routes for the Overview hub: launcher counts, headline stats,
due-soon deadlines, recent notes, and the "jump to..." search bar. Read-only
aggregation over the other tools' tables - thin wrapper around
storage/db.py, same pattern as every other api/*.py module.
"""
from __future__ import annotations

from fastapi import APIRouter

from storage import db

db.init_db()

router = APIRouter()


@router.get("/stats")
def get_overview():
    return db.get_overview_stats()


@router.get("/search")
def search(q: str = ""):
    q = q.strip()
    if not q:
        return {"results": []}
    return {"results": db.search_all(q)}
