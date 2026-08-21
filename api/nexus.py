"""API route for Nexus: the whole database as one node graph, for the
home page's graph view. Read-only aggregation over every other tool's
tables - thin wrapper around storage/db.py, same pattern as
api/overview.py.
"""
from __future__ import annotations

from fastapi import APIRouter

from storage import db

db.init_db()

router = APIRouter()


@router.get("/graph")
def get_graph():
    return db.get_nexus_graph()
