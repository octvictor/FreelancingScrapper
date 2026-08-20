"""API routes for the Calculator (Finances) tool: browser-tab-style
tables, each a Studio-Database-style ledger (Title, currency-formatted
Value, an optional row color, an active/inactive toggle) with a
running SUM of the Value column. Thin HTTP wrapper around
storage/db.py, same pattern as api/gatherer.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class TableCreate(BaseModel):
    title: str = "Untitled"


class TableUpdate(BaseModel):
    title: str | None = None
    currency: str | None = None


class RowUpdate(BaseModel):
    title: str | None = None
    value: float | None = None
    color: str | None = None
    active: bool | None = None


@router.get("/tables")
def list_tables():
    return {"tables": db.list_finance_tables()}


@router.post("/tables")
def create_table(payload: TableCreate):
    return db.create_finance_table(payload.title)


@router.put("/tables/{table_id}")
def update_table(table_id: int, payload: TableUpdate):
    updates = payload.model_dump(exclude_unset=True)
    table = db.update_finance_table(table_id, **updates)
    if table is None:
        raise HTTPException(404, "Table not found")
    return table


@router.delete("/tables/{table_id}")
def delete_table(table_id: int):
    db.delete_finance_table(table_id)
    return {"ok": True}


@router.get("/tables/{table_id}")
def get_table_data(table_id: int):
    return {"rows": db.list_finance_rows(table_id)}


@router.post("/tables/{table_id}/rows")
def create_row(table_id: int):
    return db.create_finance_row(table_id)


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
