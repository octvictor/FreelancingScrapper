"""SQLite storage layer shared by all scrapers and the Streamlit GUI.

Schema is intentionally source-agnostic: every scraper (LinkedIn, Behance,
Instagram, ...) writes into the same `companies` / `people` / `job_postings`
tables, tagged with a `source` column, so results from different platforms
can be browsed and cross-referenced in one place.
"""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path

import pandas as pd

DB_PATH = Path(__file__).resolve().parent.parent / "data" / "scraper.db"

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
"""

_TABLES = {"companies", "people", "job_postings", "scrape_runs"}


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


def fetch_table(table: str) -> pd.DataFrame:
    if table not in _TABLES:
        raise ValueError(f"Unknown table: {table}")
    with get_connection() as conn:
        # table name is validated against the fixed allowlist above, not user input
        return pd.read_sql_query(f"SELECT * FROM {table} ORDER BY id DESC", conn)
