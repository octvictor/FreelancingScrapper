"""API routes for the Notes tool: a flat board of Google Keep-style
cards (title, body, color), manually reorderable. Thin HTTP wrapper
around storage/db.py, same pattern as api/gatherer.py and api/tracker.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class NoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    color: str | None = None


class ReorderPayload(BaseModel):
    ids: list[int]


@router.get("")
def list_notes():
    return {"notes": db.list_notes()}


@router.post("")
def create_note():
    return db.create_note()


@router.put("/reorder")
def reorder_notes(payload: ReorderPayload):
    db.reorder_notes(payload.ids)
    return {"ok": True}


@router.put("/{note_id}")
def update_note(note_id: int, payload: NoteUpdate):
    updates = payload.model_dump(exclude_unset=True)
    note = db.update_note(note_id, **updates)
    if note is None:
        raise HTTPException(404, "Note not found")
    return note


@router.delete("/{note_id}")
def delete_note(note_id: int):
    db.delete_note(note_id)
    return {"ok": True}
