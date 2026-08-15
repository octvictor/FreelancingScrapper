"""API routes for the Calculator (Finances) tool: browser-tab-style
tables, each a Studio-Database-style ledger (Title, currency-formatted
Value, an optional row color, plus any number of user-added freeform
text columns) with a running SUM of the Value column. Thin HTTP
wrapper around storage/db.py, same pattern as api/gatherer.py.
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


class ColumnCreate(BaseModel):
    name: str = ""


class ColumnUpdate(BaseModel):
    name: str


class RowUpdate(BaseModel):
    title: str | None = None
    value: float | None = None
    color: str | None = None


class CellUpdate(BaseModel):
    value: str | None = None


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


@router.get("/tables/{table_id}")
def get_table_data(table_id: int):
    return {
        "columns": db.list_finance_columns(table_id),
        "rows": db.list_finance_rows(table_id),
    }


@router.post("/tables/{table_id}/columns")
def create_column(table_id: int, payload: ColumnCreate):
    return db.create_finance_column(table_id, payload.name)


@router.put("/columns/{column_id}")
def update_column(column_id: int, payload: ColumnUpdate):
    column = db.update_finance_column(column_id, payload.name)
    if column is None:
        raise HTTPException(404, "Column not found")
    return column


@router.delete("/columns/{column_id}")
def delete_column(column_id: int):
    db.delete_finance_column(column_id)
    return {"ok": True}


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


@router.put("/rows/{row_id}/cells/{column_id}")
def set_cell(row_id: int, column_id: int, payload: CellUpdate):
    db.set_finance_cell(row_id, column_id, payload.value)
    return {"ok": True}
