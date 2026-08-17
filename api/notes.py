"""API routes for the Notes tool: a flat board of Google Keep-style
cards, either a "text" note (title + body) or a "list" note (title +
a note_items checklist). Thin HTTP wrapper around storage/db.py, same
pattern as api/gatherer.py and api/tracker.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class NoteCreate(BaseModel):
    type: str = "text"


class NoteUpdate(BaseModel):
    title: str | None = None
    body: str | None = None
    color: str | None = None
    type: str | None = None


class ReorderPayload(BaseModel):
    ids: list[int]


class NoteItemUpdate(BaseModel):
    text: str | None = None
    checked: bool | None = None


@router.get("")
def list_notes():
    return {"notes": db.list_notes()}


@router.post("")
def create_note(payload: NoteCreate):
    return db.create_note(note_type=payload.type)


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


@router.post("/{note_id}/items")
def create_note_item(note_id: int):
    return db.create_note_item(note_id)


@router.put("/{note_id}/items/{item_id}")
def update_note_item(note_id: int, item_id: int, payload: NoteItemUpdate):
    updates = payload.model_dump(exclude_unset=True)
    item = db.update_note_item(item_id, **updates)
    if item is None:
        raise HTTPException(404, "Item not found")
    return item


@router.delete("/{note_id}/items/{item_id}")
def delete_note_item(note_id: int, item_id: int):
    db.delete_note_item(item_id)
    return {"ok": True}
