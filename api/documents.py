"""API routes for Documents: a read-only browser over folders of PDFs the
user nominates, plus the app's general settings store.

Documents indexes two *kinds* - invoices and NFs - which are the same
machinery pointed at two different folders with two different search terms.
Every route below is scoped by kind for that reason: rescanning invoices
must never touch the NF index, and vice versa.

Nothing here writes to the scanned folders. The only filesystem calls are
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

# The two kinds, in the order the page stacks them. Adding a third is a
# line here plus a section in the page - nothing else in this file names
# "invoice" or "nf" directly.
KINDS = ("invoice", "nf")
KIND_LABELS = {"invoice": "Invoices", "nf": "NFs"}


def _keys(kind: str) -> tuple[str, str]:
    return f"documents_{kind}_path", f"documents_{kind}_terms"


def _valid_kind(kind: str) -> str:
    if kind not in KINDS:
        raise HTTPException(400, f"Unknown document kind: {kind}")
    return kind


class DocumentSettings(BaseModel):
    kind: str
    documents_path: str | None = None
    documents_terms: str | None = None


class RescanRequest(BaseModel):
    # None means every kind - what the page's own Rescan sends.
    kind: str | None = None


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


def _current(kind: str) -> tuple[str, list[str]]:
    path_key, terms_key = _keys(kind)
    settings = db.get_settings([path_key, terms_key])
    return settings[path_key] or "", docscan.parse_terms(settings[terms_key])


def _kind_settings(kind: str) -> dict:
    path, terms = _current(kind)
    _, terms_key = _keys(kind)
    return {
        "kind": kind,
        "label": KIND_LABELS[kind],
        "documents_path": path,
        "documents_terms": db.get_setting(terms_key) or "",
        "preview": docscan.preview(path, terms),
    }


# ---------- Settings ----------

@router.get("/settings")
def read_settings():
    return {"kinds": [_kind_settings(kind) for kind in KINDS]}


@router.put("/settings")
def write_settings(payload: DocumentSettings):
    """Saves one kind's two fields and answers with that kind's match count,
    so the Settings field can say "4 folders, 37 PDFs" rather than leaving
    you to judge a search term by staring at the list it produced."""
    kind = _valid_kind(payload.kind)
    path_key, terms_key = _keys(kind)
    if payload.documents_path is not None:
        db.set_setting(path_key, payload.documents_path.strip())
    if payload.documents_terms is not None:
        db.set_setting(terms_key, payload.documents_terms.strip())
    return _kind_settings(kind)


# ---------- Index ----------
# Literal segments are declared before any /{id} route: FastAPI matches in
# definition order, so with these the other way round "rescan" would be
# parsed as a file id and rejected as a bad int.

@router.get("/files")
def list_files():
    """Both kinds in one response. The page renders them as two sections but
    shares one tag vocabulary, and one request keeps the two lists from
    arriving a frame apart."""
    return {
        "files": db.list_document_files(),
        "tags": db.list_document_tags(),
        "kinds": [{"kind": k, "label": KIND_LABELS[k]} for k in KINDS],
    }


def _rescan_kind(kind: str) -> dict:
    path, terms = _current(kind)
    check = docscan.preview(path, terms)
    if not check["ok"]:
        # An unreadable folder must not look like an empty one - clearing the
        # index here would silently throw away a working list because of a
        # permissions prompt that had not been answered yet.
        return {"kind": kind, "ok": False, "reason": check["reason"],
                "indexed": 0, "added": 0, "missing": 0}
    records = docscan.scan(path, terms, known=db.known_document_files(kind))
    result = db.replace_document_index(kind, records)
    return {"kind": kind, "ok": True, "reason": None, **result}


@router.post("/rescan")
def rescan(payload: RescanRequest | None = None):
    """One kind, or every kind when none is named. Each kind reports its own
    outcome: a missing NF folder is not a reason to hide that the invoice
    scan succeeded."""
    kinds = KINDS if payload is None or payload.kind is None else (_valid_kind(payload.kind),)
    results = [_rescan_kind(kind) for kind in kinds]
    return {"results": results, "ok": any(r["ok"] for r in results)}


@router.post("/open")
def open_file(payload: OpenRequest):
    """Hands a file to the system viewer. VAIO is not a PDF reader."""
    record = db.get_document_file(payload.id)
    if record is None:
        raise HTTPException(404, "File not found in the index")

    # Checked against the root of *this file's* kind. Using either root for
    # every file would let an NF path pass the invoice folder's check.
    root, _ = _current(record["kind"])
    target = Path(record["path"])
    try:
        # The id comes from the client, so the path it resolves to is checked
        # against the nominated folder before anything is handed to the OS.
        # A stale or crafted id must not be able to open something outside it.
        root_resolved = Path(root).expanduser().resolve()
        target_resolved = target.resolve()
        target_resolved.relative_to(root_resolved)
    except (ValueError, OSError):
        raise HTTPException(400, "That file is outside its documents folder")

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
    # Stored against (kind, path) - this file, not every file that happens
    # to share its bytes. A rename or move is picked up on the next rescan
    # instead, where it can be told apart from a copy.
    db.set_document_file_tags(record["kind"], record["path"], payload.tag_ids)
    return {"ok": True}
