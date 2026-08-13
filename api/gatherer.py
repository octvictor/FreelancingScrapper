"""API routes for the Gatherer tool: a manually-curated list of studios/
companies (title, URL, type, outreach status, date sent). Thin HTTP
wrapper around storage/db.py, same pattern as api/scrapper.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class EntryUpdate(BaseModel):
    title: str | None = None
    url: str | None = None
    type: str | None = None
    status: str | None = None
    sent_date: str | None = None


@router.get("/entries")
def list_entries():
    return {"entries": db.list_gatherer_entries()}


@router.post("/entries")
def create_entry():
    return db.create_gatherer_entry()


@router.put("/entries/{entry_id}")
def update_entry(entry_id: int, payload: EntryUpdate):
    updates = payload.model_dump(exclude_unset=True)
    entry = db.update_gatherer_entry(entry_id, **updates)
    if entry is None:
        raise HTTPException(404, "Entry not found")
    return entry


@router.delete("/entries/{entry_id}")
def delete_entry(entry_id: int):
    db.delete_gatherer_entry(entry_id)
    return {"ok": True}
