"""API routes for Documents: a read-only browser over a folder of PDFs the
user nominates, plus the app's general settings store.

Nothing here writes to the scanned folder. The only filesystem calls are
the walk in storage/docscan.py, and handing a path to the OS to open.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db, docscan

db.init_db()

router = APIRouter()

PATH_KEY = "documents_path"
TERMS_KEY = "documents_terms"


class DocumentSettings(BaseModel):
    documents_path: str | None = None
    documents_terms: str | None = None


class TagCreate(BaseModel):
    name: str
    color: str | None = None


class TagColor(BaseModel):
    color: str | None = None


class TagIds(BaseModel):
    tag_ids: list[int]


class OpenRequest(BaseModel):
    id: int
    reveal: bool = False


def _current() -> tuple[str, list[str]]:
    settings = db.get_settings([PATH_KEY, TERMS_KEY])
    return settings[PATH_KEY] or "", docscan.parse_terms(settings[TERMS_KEY])


# ---------- Settings ----------

@router.get("/settings")
def read_settings():
    path, terms = _current()
    return {
        "documents_path": path,
        "documents_terms": db.get_setting(TERMS_KEY) or "",
        "preview": docscan.preview(path, terms),
    }


@router.put("/settings")
def write_settings(payload: DocumentSettings):
    """Saves both fields and answers with the match count, so the Settings
    field can say "4 folders, 37 PDFs" rather than leaving you to judge a
    search term by staring at the list it produced."""
    if payload.documents_path is not None:
        db.set_setting(PATH_KEY, payload.documents_path.strip())
    if payload.documents_terms is not None:
        db.set_setting(TERMS_KEY, payload.documents_terms.strip())
    path, terms = _current()
    return {
        "documents_path": path,
        "documents_terms": db.get_setting(TERMS_KEY) or "",
        "preview": docscan.preview(path, terms),
    }


# ---------- Index ----------
# Literal segments are declared before any /{id} route: FastAPI matches in
# definition order, so with these the other way round "rescan" would be
# parsed as a file id and rejected as a bad int.

@router.get("/files")
def list_files():
    return {"files": db.list_document_files(), "tags": db.list_document_tags()}


@router.post("/rescan")
def rescan():
    path, terms = _current()
    check = docscan.preview(path, terms)
    if not check["ok"]:
        # An unreadable folder must not look like an empty one - clearing the
        # index here would silently throw away a working list because of a
        # permissions prompt that had not been answered yet.
        return {"ok": False, "reason": check["reason"], "indexed": 0, "added": 0, "missing": 0}
    records = docscan.scan(path, terms, known=db.known_document_files())
    result = db.replace_document_index(records)
    return {"ok": True, "reason": None, **result}


@router.post("/open")
def open_file(payload: OpenRequest):
    """Hands a file to the system viewer. VAIO is not a PDF reader."""
    record = db.get_document_file(payload.id)
    if record is None:
        raise HTTPException(404, "File not found in the index")

    root, _ = _current()
    target = Path(record["path"])
    try:
        # The id comes from the client, so the path it resolves to is checked
        # against the nominated folder before anything is handed to the OS.
        # A stale or crafted id must not be able to open something outside it.
        root_resolved = Path(root).expanduser().resolve()
        target_resolved = target.resolve()
        target_resolved.relative_to(root_resolved)
    except (ValueError, OSError):
        raise HTTPException(400, "That file is outside the documents folder")

    if not target_resolved.exists():
        raise HTTPException(404, "That file is no longer on disk")

    try:
        if sys.platform == "darwin":
            args = ["open", "-R", str(target_resolved)] if payload.reveal else ["open", str(target_resolved)]
            subprocess.run(args, check=False)
        elif os.name == "nt":
            if payload.reveal:
                subprocess.run(["explorer", "/select,", str(target_resolved)], check=False)
            else:
                os.startfile(str(target_resolved))  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", str(target_resolved.parent if payload.reveal else target_resolved)],
                           check=False)
    except OSError as exc:
        raise HTTPException(500, f"Could not open that file: {exc}")
    return {"ok": True}


# ---------- Tags ----------

@router.get("/tags")
def list_tags():
    return {"tags": db.list_document_tags()}


@router.post("/tags")
def create_tag(payload: TagCreate):
    name = payload.name.strip()
    if not name:
        raise HTTPException(400, "A tag needs a name")
    return db.create_document_tag(name, payload.color)


@router.put("/tags/{tag_id}")
def update_tag(tag_id: int, payload: TagColor):
    tag = db.set_document_tag_color(tag_id, payload.color)
    if tag is None:
        raise HTTPException(404, "Tag not found")
    return tag


@router.delete("/tags/{tag_id}")
def delete_tag(tag_id: int):
    db.delete_document_tag(tag_id)
    return {"ok": True}


@router.put("/files/{file_id}/tags")
def set_file_tags(file_id: int, payload: TagIds):
    record = db.get_document_file(file_id)
    if record is None:
        raise HTTPException(404, "File not found in the index")
    # Stored against the hash, not the id, so the tags follow the file if it
    # is renamed or moved outside the app.
    db.set_document_file_tags(record["content_hash"], payload.tag_ids)
    return {"ok": True}
