"""API routes for the Finances tool: a Studio-Database-style table
(Title, currency-formatted Value, plus any number of user-added
freeform text columns) with a running SUM of the Value column. Thin
HTTP wrapper around storage/db.py, same pattern as api/gatherer.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class CurrencyUpdate(BaseModel):
    currency: str


class ColumnCreate(BaseModel):
    name: str = ""


class ColumnUpdate(BaseModel):
    name: str


class RowUpdate(BaseModel):
    title: str | None = None
    value: float | None = None


class CellUpdate(BaseModel):
    value: str | None = None


@router.get("")
def get_finance_data():
    return {
        "settings": db.get_finance_settings(),
        "columns": db.list_finance_columns(),
        "rows": db.list_finance_rows(),
    }


@router.put("/currency")
def update_currency(payload: CurrencyUpdate):
    return db.update_finance_currency(payload.currency)


@router.post("/columns")
def create_column(payload: ColumnCreate):
    return db.create_finance_column(payload.name)


@router.put("/columns/{column_id}")
def update_column(column_id: int, payload: ColumnUpdate):
    column = db.update_finance_column(column_id, payload.name)
    if column is None:
        raise HTTPException(404, "Column not found")
    return column


@router.post("/rows")
def create_row():
    return db.create_finance_row()


@router.put("/rows/{row_id}")
def update_row(row_id: int, payload: RowUpdate):
    updates = payload.model_dump(exclude_unset=True)
    row = db.update_finance_row(row_id, **updates)
    if row is None:
        raise HTTPException(404, "Row not found")
    return row


@router.delete("/rows/{row_id}")
def delete_row(row_id: int):
    db.delete_finance_row(row_id)
    return {"ok": True}


@router.put("/rows/{row_id}/cells/{column_id}")
def set_cell(row_id: int, column_id: int, payload: CellUpdate):
    db.set_finance_cell(row_id, column_id, payload.value)
    return {"ok": True}
