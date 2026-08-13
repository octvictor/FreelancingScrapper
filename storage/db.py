"""SQLite storage layer shared by all scrapers and the Streamlit GUI.

Schema is intentionally source-agnostic: every scraper writes into the
same `companies` / `people` / `job_postings` tables, tagged with a
`source` column, so future scrapers can reuse it without changes.
"""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from app_paths import DB_PATH

SCHEMA = """
CREATE TABLE IF NOT EXISTS companies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    source TEXT,
    url TEXT,
    industry TEXT,
    location TEXT,
    notes TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS people (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    title TEXT,
    company_name TEXT,
    location TEXT,
    profile_url TEXT UNIQUE,
    source TEXT NOT NULL,
    scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS job_postings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT,
    company_name TEXT,
    url TEXT UNIQUE,
    location TEXT,
    description TEXT,
    source TEXT NOT NULL,
    posted_date TEXT,
    scraped_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scrape_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    source TEXT NOT NULL,
    query TEXT,
    result_count INTEGER DEFAULT 0,
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    error TEXT
);

CREATE TABLE IF NOT EXISTS gatherer_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    url TEXT NOT NULL DEFAULT '',
    type TEXT NOT NULL DEFAULT 'Studio',
    status TEXT NOT NULL DEFAULT 'Not sent',
    sent_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    deadline TEXT,
    day_rate REAL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS project_docs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    stored_name TEXT NOT NULL,
    uploaded_at TEXT NOT NULL
);
"""

_TABLES = {"companies", "people", "job_postings", "scrape_runs", "gatherer_entries", "projects", "project_docs"}


def _now() -> str:
    return datetime.now(timezone.utc).isoformat()


@contextmanager
def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db() -> None:
    with get_connection() as conn:
        conn.executescript(SCHEMA)


def upsert_company(name, source, url=None, industry=None, location=None, notes=None) -> None:
    if not name:
        return
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO companies (name, source, url, industry, location, notes, first_seen, last_seen)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(name) DO UPDATE SET
                source=excluded.source,
                url=COALESCE(excluded.url, companies.url),
                industry=COALESCE(excluded.industry, companies.industry),
                location=COALESCE(excluded.location, companies.location),
                notes=COALESCE(excluded.notes, companies.notes),
                last_seen=excluded.last_seen
            """,
            (name, source, url, industry, location, notes, now, now),
        )


def insert_person(name, title, company_name, location, profile_url, source) -> None:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO people (name, title, company_name, location, profile_url, source, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(profile_url) DO UPDATE SET
                name=excluded.name,
                title=excluded.title,
                company_name=excluded.company_name,
                location=excluded.location,
                scraped_at=excluded.scraped_at
            """,
            (name, title, company_name, location, profile_url, source, now),
        )
    if company_name:
        upsert_company(company_name, source)


def insert_job(title, company_name, url, location, description, source, posted_date=None) -> None:
    now = _now()
    with get_connection() as conn:
        conn.execute(
            """
            INSERT INTO job_postings (title, company_name, url, location, description, source, posted_date, scraped_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(url) DO UPDATE SET
                title=excluded.title,
                company_name=excluded.company_name,
                location=excluded.location,
                description=excluded.description,
                posted_date=excluded.posted_date,
                scraped_at=excluded.scraped_at
            """,
            (title, company_name, url, location, description, source, posted_date, now),
        )
    if company_name:
        upsert_company(company_name, source)


def start_run(source: str, query: str) -> int:
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO scrape_runs (source, query, status, started_at) VALUES (?, ?, 'running', ?)",
            (source, query, _now()),
        )
        return cur.lastrowid


def finish_run(run_id: int, result_count: int, status: str = "completed", error: str | None = None) -> None:
    with get_connection() as conn:
        conn.execute(
            "UPDATE scrape_runs SET result_count=?, status=?, finished_at=?, error=? WHERE id=?",
            (result_count, status, _now(), error, run_id),
        )


def clear_table(table: str) -> None:
    """Wipe all rows from one table - used by the sidebar "reset demo
    data" control so repeated test runs don't pile up duplicate rows."""
    if table not in _TABLES:
        raise ValueError(f"Unknown table: {table}")
    with get_connection() as conn:
        conn.execute(f"DELETE FROM {table}")


# ---------- Gatherer: manually-curated studio/company list ----------

def list_gatherer_entries() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM gatherer_entries ORDER BY id").fetchall()
        return [dict(row) for row in rows]


def create_gatherer_entry() -> dict:
    """Insert a blank row with sensible defaults - the frontend's "+"
    button calls this, then renders the returned row as an editable
    line the user fills in directly (Notion-style), rather than opening
    a separate "new entry" form."""
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO gatherer_entries (title, url, type, status, created_at, updated_at) "
            "VALUES ('', '', 'Studio', 'Not sent', ?, ?)",
            (now, now),
        )
        row = conn.execute("SELECT * FROM gatherer_entries WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_gatherer_entry(entry_id: int, **fields) -> dict | None:
    allowed = {"title", "url", "type", "status", "sent_date"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM gatherer_entries WHERE id=?", (entry_id,)).fetchone()
            return dict(row) if row else None

    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE gatherer_entries SET {set_clause} WHERE id=?",
            (*updates.values(), entry_id),
        )
        row = conn.execute("SELECT * FROM gatherer_entries WHERE id=?", (entry_id,)).fetchone()
        return dict(row) if row else None


def delete_gatherer_entry(entry_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM gatherer_entries WHERE id=?", (entry_id,))


# ---------- Tracker: project cards + docs ----------

def list_projects() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM projects ORDER BY id DESC").fetchall()
        return [dict(row) for row in rows]


def create_project() -> dict:
    """Insert a blank project - the "+ New project" card calls this, then
    the modal opens on the returned row for the user to fill in, same
    create-then-edit-in-place pattern as Gatherer's rows."""
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO projects (title, status, created_at, updated_at) VALUES ('', 'Active', ?, ?)",
            (now, now),
        )
        row = conn.execute("SELECT * FROM projects WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def get_project(project_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None


def update_project(project_id: int, **fields) -> dict | None:
    allowed = {"title", "status", "deadline", "day_rate"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_project(project_id)

    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE projects SET {set_clause} WHERE id=?",
            (*updates.values(), project_id),
        )
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None


def delete_project(project_id: int) -> list[dict]:
    """Deletes the project row and its doc rows, returning the deleted
    docs so the caller can also remove their files from disk - the DB
    layer doesn't touch the filesystem itself."""
    with get_connection() as conn:
        docs = [dict(r) for r in conn.execute("SELECT * FROM project_docs WHERE project_id=?", (project_id,)).fetchall()]
        conn.execute("DELETE FROM project_docs WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM projects WHERE id=?", (project_id,))
        return docs


def list_project_docs(project_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM project_docs WHERE project_id=? ORDER BY id", (project_id,)).fetchall()
        return [dict(row) for row in rows]


def add_project_doc(project_id: int, filename: str, stored_name: str) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO project_docs (project_id, filename, stored_name, uploaded_at) VALUES (?, ?, ?, ?)",
            (project_id, filename, stored_name, now),
        )
        row = conn.execute("SELECT * FROM project_docs WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def get_project_doc(doc_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM project_docs WHERE id=?", (doc_id,)).fetchone()
        return dict(row) if row else None


def delete_project_doc(doc_id: int) -> dict | None:
    """Returns the deleted row (so the caller can remove its file from
    disk) or None if it didn't exist."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM project_docs WHERE id=?", (doc_id,)).fetchone()
        if row is None:
            return None
        conn.execute("DELETE FROM project_docs WHERE id=?", (doc_id,))
        return dict(row)
