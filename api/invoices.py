"""API routes for the invoice editor.

An invoice here is something the user typed, not something found on disk -
Documents indexes the latter. Every field is free text and nothing on this
side totals, rounds or reformats: the invoice this was modelled on writes
"1 / 2" days, "$300,00" rates and "April 09/10" dates, and reproducing what
the user typed is the whole job.

New invoices are seeded from the defaults in Settings (the "invoice from"
block, the payment notes, the contact line) and then diverge freely - the
defaults are a starting point per invoice, not a live include, so an old
invoice never changes because a bank detail changed today.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

import app_paths
from storage import db

db.init_db()

router = APIRouter()

# Settings keys holding the parts that are the same on most invoices.
FROM_KEY = "invoice_from"
NOTES_KEY = "invoice_notes"
CONTACT_KEY = "invoice_contact"
PAYMENT_IMAGE_KEY = "invoice_payment_image"

DEFAULT_KEYS = [FROM_KEY, NOTES_KEY, CONTACT_KEY]

PAYMENT_IMAGE_DIR = app_paths.DATA_DIR / "invoice_assets"

# Images only, and by extension rather than by the browser's content-type,
# which is trivially wrong for uploads. The page embeds whatever this
# accepts directly in an <img>.
IMAGE_EXTENSIONS = {".png", ".jpg", ".jpeg", ".webp", ".gif", ".svg"}


class InvoiceUpdate(BaseModel):
    title: str | None = None
    bill_from: str | None = None
    bill_to: str | None = None
    project_number: str | None = None
    invoice_number: str | None = None
    invoice_date: str | None = None
    due_date: str | None = None
    project_label: str | None = None
    summary_label: str | None = None
    summary_year: str | None = None
    total_text: str | None = None
    notes: str | None = None
    contact: str | None = None


class RowUpdate(BaseModel):
    project_title: str | None = None
    project_desc: str | None = None
    client: str | None = None
    agency: str | None = None
    dates: str | None = None
    day_rate: str | None = None
    days_worked: str | None = None
    total: str | None = None


class RowOrder(BaseModel):
    row_ids: list[int]


class InvoiceDefaults(BaseModel):
    invoice_from: str | None = None
    invoice_notes: str | None = None
    invoice_contact: str | None = None


def _defaults() -> dict:
    stored = db.get_settings(DEFAULT_KEYS)
    return {key: stored[key] or "" for key in DEFAULT_KEYS}


def _payment_image_name() -> str | None:
    return db.get_setting(PAYMENT_IMAGE_KEY) or None


# ---------- Defaults (Settings) ----------

@router.get("/defaults")
def read_defaults():
    return {**_defaults(), "payment_image": _payment_image_name()}


@router.put("/defaults")
def write_defaults(payload: InvoiceDefaults):
    for key, value in payload.model_dump(exclude_unset=True).items():
        db.set_setting(key, (value or "").strip())
    return {**_defaults(), "payment_image": _payment_image_name()}


@router.post("/defaults/payment-image")
async def upload_payment_image(file: UploadFile):
    """The Wise card, or whatever else the user wants printed beside the
    payment notes. Stored as a file rather than in the DB so the print view
    can just point an <img> at it."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in IMAGE_EXTENSIONS:
        raise HTTPException(400, "That needs to be an image (png, jpg, webp, gif or svg)")

    PAYMENT_IMAGE_DIR.mkdir(parents=True, exist_ok=True)
    stored_name = f"{uuid.uuid4().hex}{suffix}"
    (PAYMENT_IMAGE_DIR / stored_name).write_bytes(await file.read())

    # Replaced, not accumulated: there is only ever one payment image, and
    # leaving the old file behind would quietly grow the data folder.
    previous = _payment_image_name()
    if previous:
        (PAYMENT_IMAGE_DIR / previous).unlink(missing_ok=True)
    db.set_setting(PAYMENT_IMAGE_KEY, stored_name)
    return {"payment_image": stored_name}


@router.delete("/defaults/payment-image")
def delete_payment_image():
    previous = _payment_image_name()
    if previous:
        (PAYMENT_IMAGE_DIR / previous).unlink(missing_ok=True)
    db.set_setting(PAYMENT_IMAGE_KEY, "")
    return {"ok": True}


@router.get("/payment-image")
def serve_payment_image():
    stored_name = _payment_image_name()
    if not stored_name:
        raise HTTPException(404, "No payment image set")
    path = PAYMENT_IMAGE_DIR / stored_name
    if not path.exists():
        raise HTTPException(404, "The payment image is missing from disk")
    return FileResponse(path)


# ---------- Invoices ----------
# Literal segments before any /{id} route: FastAPI matches in definition
# order, so "defaults" would otherwise be parsed as an invoice id.

@router.get("")
def list_invoices():
    return {"invoices": db.list_invoices()}


@router.post("")
def create_invoice():
    """Starts from the Settings defaults and one empty row, because an
    invoice with no rows has nothing to click and the first thing anyone
    does is add one."""
    defaults = _defaults()
    invoice = db.create_invoice(
        title="",
        bill_from=defaults[FROM_KEY],
        notes=defaults[NOTES_KEY],
        contact=defaults[CONTACT_KEY],
    )
    db.add_invoice_row(invoice["id"])
    return db.get_invoice(invoice["id"])


@router.get("/{invoice_id}")
def read_invoice(invoice_id: int):
    invoice = db.get_invoice(invoice_id)
    if invoice is None:
        raise HTTPException(404, "Invoice not found")
    return invoice


@router.put("/{invoice_id}")
def write_invoice(invoice_id: int, payload: InvoiceUpdate):
    invoice = db.update_invoice(invoice_id, **payload.model_dump(exclude_unset=True))
    if invoice is None:
        raise HTTPException(404, "Invoice not found")
    return invoice


@router.delete("/{invoice_id}")
def remove_invoice(invoice_id: int):
    db.delete_invoice(invoice_id)
    return {"ok": True}


# ---------- Rows ----------

@router.post("/{invoice_id}/rows")
def create_row(invoice_id: int):
    if db.get_invoice(invoice_id) is None:
        raise HTTPException(404, "Invoice not found")
    return db.add_invoice_row(invoice_id)


@router.put("/{invoice_id}/rows/reorder")
def reorder_rows(invoice_id: int, payload: RowOrder):
    db.reorder_invoice_rows(invoice_id, payload.row_ids)
    return {"ok": True}


@router.put("/{invoice_id}/rows/{row_id}")
def write_row(invoice_id: int, row_id: int, payload: RowUpdate):
    row = db.update_invoice_row(row_id, **payload.model_dump(exclude_unset=True))
    if row is None:
        raise HTTPException(404, "Row not found")
    return row


@router.delete("/{invoice_id}/rows/{row_id}")
def remove_row(invoice_id: int, row_id: int):
    db.delete_invoice_row(row_id)
    return {"ok": True}
