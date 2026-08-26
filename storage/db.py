"""SQLite storage layer shared by every tool (Gatherer, Tracker)."""
import sqlite3
from contextlib import contextmanager
from datetime import datetime, timezone

from app_paths import DB_PATH

SCHEMA = """
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
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    paid TEXT NOT NULL DEFAULT 'Unpaid',
    client TEXT,
    deadline TEXT,
    day_rate REAL,
    currency TEXT NOT NULL DEFAULT 'USD',
    assets_text TEXT,
    notes_text TEXT,
    briefing_text TEXT,
    position INTEGER,
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

CREATE TABLE IF NOT EXISTS project_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    task TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'Active',
    duration TEXT NOT NULL DEFAULT 'Full',
    cost REAL,
    observation TEXT,
    task_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    description TEXT,
    status TEXT NOT NULL DEFAULT 'Active',
    assets_text TEXT,
    notes_text TEXT,
    references_text TEXT,
    position INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS personal_checklist_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    personal_project_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_lists (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    favorite INTEGER NOT NULL DEFAULT 0,
    color TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    list_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    important INTEGER NOT NULL DEFAULT 0,
    notes TEXT,
    due_date TEXT,
    position INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS todo_steps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    body TEXT,
    type TEXT NOT NULL DEFAULT 'text',
    color TEXT,
    position INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS note_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    note_id INTEGER NOT NULL,
    text TEXT NOT NULL DEFAULT '',
    checked INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT,
    updated_at TEXT NOT NULL
);

/* One row per (file, kind). Invoices and NFs are indexed separately and
   can legitimately point at overlapping trees, so a file that matches both
   searches belongs in both lists - which a UNIQUE(path) alone would
   silently prevent, letting whichever scan ran second steal the row. */
CREATE TABLE IF NOT EXISTS document_files (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    kind TEXT NOT NULL DEFAULT 'invoice',
    path TEXT NOT NULL,
    filename TEXT NOT NULL,
    display_name TEXT NOT NULL,
    sort_key TEXT NOT NULL,
    folder TEXT NOT NULL,
    group_name TEXT,
    size_bytes INTEGER NOT NULL,
    mtime REAL NOT NULL,
    year INTEGER,
    content_hash TEXT NOT NULL,
    missing INTEGER NOT NULL DEFAULT 0,
    indexed_at TEXT NOT NULL,
    UNIQUE (kind, path)
);

/* An invoice the user typed, as opposed to a PDF found on disk. Every
   field is free text on purpose: the source invoice this was modelled on
   writes "1 / 2" days and "$300,00" and "April 09/10", and the point is to
   reproduce what the user types, not to impose a number format on it. The
   one thing the app computes is nothing at all. */
CREATE TABLE IF NOT EXISTS invoices (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    bill_from TEXT,
    bill_to TEXT,
    project_number TEXT,
    invoice_number TEXT,
    invoice_date TEXT,
    due_date TEXT,
    project_label TEXT,
    summary_label TEXT,
    summary_year TEXT,
    total_text TEXT,
    notes TEXT,
    contact TEXT,
    /* 'rows' or 'free'. Both are kept when you switch, so flipping to free
       typing and back does not throw the rows away. */
    body_mode TEXT NOT NULL DEFAULT 'rows',
    free_body TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS invoice_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    invoice_id INTEGER NOT NULL REFERENCES invoices(id) ON DELETE CASCADE,
    -- The order rows were added in, and only that. Rows are not draggable
    -- and deliberately so: an invoice is typed top to bottom, and the one
    -- thing a drag could do here is silently reorder what was already
    -- checked. New rows land at the bottom, which is where they belong.
    position INTEGER NOT NULL DEFAULT 0,
    project_title TEXT,
    project_desc TEXT,
    client TEXT,
    agency TEXT,
    dates TEXT,
    day_rate TEXT,
    days_worked TEXT,
    total TEXT
);

CREATE INDEX IF NOT EXISTS idx_invoice_rows_invoice ON invoice_rows(invoice_id, position);

CREATE TABLE IF NOT EXISTS document_tags (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    color TEXT
);

/* Keyed to the file, not to its bytes. Hash-keying was tried first so a
   tag would follow a renamed or moved invoice, but duplicates are ordinary
   in these folders ("NF_XDS - Copy (2)") and byte-identical files share a
   hash, so tagging one silently tagged every copy - across both kinds,
   since a hash carries no kind either. Following a rename is now handled
   where it can be done unambiguously instead: see replace_document_index. */
CREATE TABLE IF NOT EXISTS document_file_tags (
    kind TEXT NOT NULL,
    path TEXT NOT NULL,
    tag_id INTEGER NOT NULL REFERENCES document_tags(id) ON DELETE CASCADE,
    PRIMARY KEY (kind, path, tag_id)
);

CREATE INDEX IF NOT EXISTS idx_document_files_hash ON document_files(content_hash);
CREATE INDEX IF NOT EXISTS idx_document_files_kind ON document_files(kind, missing);

CREATE TABLE IF NOT EXISTS finance_tables (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL DEFAULT '',
    currency TEXT NOT NULL DEFAULT 'USD',
    position INTEGER,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS finance_rows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    table_id INTEGER NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    value REAL,
    color TEXT,
    active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

"""


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
        # Runs *before* the schema script, not after it like every other
        # migration here. `document_files` shipped indexing one kind of
        # document, so it predates `kind` and its UNIQUE(path) - and SQLite
        # cannot drop a constraint in place. Left until later, the schema
        # script's own "CREATE INDEX ... ON document_files(kind, missing)"
        # would hit the old table first and fail the whole startup.
        #
        # Dropping it is safe: the index is a disposable mirror of the
        # user's own folders that the next rescan rebuilds in full, and
        # tags live in `document_file_tags` keyed by content hash rather
        # than by file id, so they survive this untouched.
        doc_columns = {row["name"] for row in conn.execute("PRAGMA table_info(document_files)")}

        # `document_file_tags` was keyed by content hash before it was keyed
        # by file. Read the assignments out first, while both old tables are
        # still readable, and translate hash -> the files that currently
        # carry it. Every file with that hash is kept, because that is
        # exactly what was on screen before this ran: the leak this change
        # fixes is a *future* tag hitting every copy, not a licence to
        # silently drop tags the user can already see. Untagging the copies
        # they did not mean is now one click each.
        tag_columns = {row["name"] for row in conn.execute("PRAGMA table_info(document_file_tags)")}
        rescued_tags: list[tuple[str, str, int]] = []
        if tag_columns and "content_hash" in tag_columns and doc_columns:
            # Two shapes to read from: a DB upgrading from the build before
            # last has no `kind` column at all, and everything it holds was
            # an invoice.
            kind_expr = "f.kind" if "kind" in doc_columns else "'invoice' AS kind"
            rescued_tags = [
                (row["kind"], row["path"], row["tag_id"])
                for row in conn.execute(
                    f"SELECT {kind_expr}, f.path, ft.tag_id FROM document_file_tags ft "
                    "JOIN document_files f ON f.content_hash = ft.content_hash"
                )
            ]
            conn.execute("DROP TABLE document_file_tags")

        if doc_columns and "kind" not in doc_columns:
            conn.execute("DROP TABLE document_files")

        conn.executescript(SCHEMA)

        for kind, path, tag_id in rescued_tags:
            conn.execute(
                "INSERT OR IGNORE INTO document_file_tags (kind, path, tag_id) VALUES (?,?,?)",
                (kind, path, tag_id),
            )
        # `projects` shipped before `description`/`currency` existed, so an
        # existing local DB's table predates the columns above - CREATE
        # TABLE IF NOT EXISTS won't retroactively add them, so patch them
        # in by hand.
        columns = {row["name"] for row in conn.execute("PRAGMA table_info(projects)")}
        if "description" not in columns:
            conn.execute("ALTER TABLE projects ADD COLUMN description TEXT")
        if "currency" not in columns:
            conn.execute("ALTER TABLE projects ADD COLUMN currency TEXT NOT NULL DEFAULT 'USD'")
        if "client" not in columns:
            conn.execute("ALTER TABLE projects ADD COLUMN client TEXT")
        for side_field in ("assets_text", "notes_text", "briefing_text"):
            if side_field not in columns:
                conn.execute(f"ALTER TABLE projects ADD COLUMN {side_field} TEXT")
        if "paid" not in columns:
            conn.execute("ALTER TABLE projects ADD COLUMN paid TEXT NOT NULL DEFAULT 'Unpaid'")
        if "position" not in columns:
            conn.execute("ALTER TABLE projects ADD COLUMN position INTEGER")
            # Existing rows all land on NULL, which sorts before real
            # values in the new position-ordered listing - backfill them
            # so their current (id-DESC, newest-first) order is preserved
            # instead of being scrambled the first time this runs.
            rows = conn.execute("SELECT id FROM projects ORDER BY id DESC").fetchall()
            for i, row in enumerate(rows):
                conn.execute("UPDATE projects SET position=? WHERE id=?", (i, row["id"]))

        # `project_tasks` shipped before `observation` existed - same
        # patch-in-by-hand story as above.
        task_columns = {row["name"] for row in conn.execute("PRAGMA table_info(project_tasks)")}
        if "observation" not in task_columns:
            conn.execute("ALTER TABLE project_tasks ADD COLUMN observation TEXT")

        # `todo_lists` shipped before `favorite`/`color` existed - same story.
        todo_list_columns = {row["name"] for row in conn.execute("PRAGMA table_info(todo_lists)")}
        if "favorite" not in todo_list_columns:
            conn.execute("ALTER TABLE todo_lists ADD COLUMN favorite INTEGER NOT NULL DEFAULT 0")
        if "color" not in todo_list_columns:
            conn.execute("ALTER TABLE todo_lists ADD COLUMN color TEXT")
        # ...and before columns could be dragged into an order at all. Seed
        # from the id order the board was already displaying, so an existing
        # board looks identical the first time it runs with this column.
        if "position" not in todo_list_columns:
            conn.execute("ALTER TABLE todo_lists ADD COLUMN position INTEGER NOT NULL DEFAULT 0")
            for position, row in enumerate(
                conn.execute("SELECT id FROM todo_lists ORDER BY id").fetchall()
            ):
                conn.execute("UPDATE todo_lists SET position=? WHERE id=?", (position, row["id"]))

        # `todo_tasks` shipped before `due_date` existed - same story.
        todo_task_columns = {row["name"] for row in conn.execute("PRAGMA table_info(todo_tasks)")}
        if "due_date" not in todo_task_columns:
            conn.execute("ALTER TABLE todo_tasks ADD COLUMN due_date TEXT")

        # ...and Documents' settings were a single unlabelled pair before
        # there were two kinds to keep apart. Whatever folder and terms the
        # user had configured were for invoices, so they move across under
        # the invoice keys rather than being dropped on the floor.
        legacy_path = conn.execute(
            "SELECT value FROM app_settings WHERE key='documents_path'"
        ).fetchone()
        if legacy_path is not None:
            for legacy, current in (("documents_path", "documents_invoice_path"),
                                    ("documents_terms", "documents_invoice_terms")):
                row = conn.execute("SELECT value FROM app_settings WHERE key=?", (legacy,)).fetchone()
                already = conn.execute("SELECT value FROM app_settings WHERE key=?", (current,)).fetchone()
                if row is not None and already is None:
                    conn.execute(
                        "INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?)",
                        (current, row["value"], _now()),
                    )
                conn.execute("DELETE FROM app_settings WHERE key=?", (legacy,))

        # `invoices` shipped with rows as the only way to write a body -
        # same patch-in-by-hand story as the columns above.
        invoice_columns = {row["name"] for row in conn.execute("PRAGMA table_info(invoices)")}
        if invoice_columns and "body_mode" not in invoice_columns:
            conn.execute("ALTER TABLE invoices ADD COLUMN body_mode TEXT NOT NULL DEFAULT 'rows'")
        if invoice_columns and "free_body" not in invoice_columns:
            conn.execute("ALTER TABLE invoices ADD COLUMN free_body TEXT")

        # `notes` shipped before `type` existed - same story.
        note_columns = {row["name"] for row in conn.execute("PRAGMA table_info(notes)")}
        if "type" not in note_columns:
            conn.execute("ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'text'")

        # Calculator's user-added freeform columns were removed as a
        # feature a while back, leaving `finance_columns` and its
        # `finance_cells` EAV side table unreachable - nothing has been
        # able to write to either since. They were kept around so an
        # older local DB wouldn't error out; now that every code path
        # referencing them is gone, drop them outright. DROP ... IF
        # EXISTS makes this a no-op on a DB that never had them.
        conn.execute("DROP TABLE IF EXISTS finance_cells")
        conn.execute("DROP TABLE IF EXISTS finance_columns")

        # Finances shipped as a single flat table before multi-table tabs
        # existed - `finance_rows` predates `table_id`, and the currency
        # used to live in a separate `finance_settings` singleton row
        # instead of on `finance_tables` directly. Patch the columns in,
        # then - if any pre-migration rows are found - create one default
        # table to own them (carrying over the old singleton's currency
        # if it's there) rather than losing them.
        finance_row_cols = {row["name"] for row in conn.execute("PRAGMA table_info(finance_rows)")}
        if "table_id" not in finance_row_cols:
            conn.execute("ALTER TABLE finance_rows ADD COLUMN table_id INTEGER")
        if "color" not in finance_row_cols:
            conn.execute("ALTER TABLE finance_rows ADD COLUMN color TEXT")
        if "active" not in finance_row_cols:
            conn.execute("ALTER TABLE finance_rows ADD COLUMN active INTEGER NOT NULL DEFAULT 1")

        orphan_rows = conn.execute("SELECT COUNT(*) FROM finance_rows WHERE table_id IS NULL").fetchone()[0]
        # Ten notes, to-do lists and Calculator rows were still carrying
        # colours from the palette that was retired when COLOR_PRESETS
        # (nav.js) was retuned - pale mints and slate blues that no swatch
        # in the picker can produce any more. They looked like a different
        # app's colours sitting next to the current ones, and reaching one
        # of them again meant remembering which item already had it.
        #
        # Mapped by hue in CIELAB rather than by eye: every retired colour
        # is within 25 degrees of hue of the preset it moves to, and the
        # three greens are within 3. Lightness is not preserved because it
        # cannot be - the retired set ran from near-white to near-black and
        # every current preset sits at L*47 - so hue is what carries the
        # colour's identity across.
        #
        # A one-time rewrite, not a display-time translation: these are the
        # user's own choices and they should stay editable as normal
        # afterwards. It re-runs harmlessly, since none of the old values
        # can be chosen again.
        for old, new in (
            ("#C2E0CE", "#417B5E"),   # pale mint    -> green
            ("#5C8C74", "#417B5E"),   # mid green    -> green
            ("#2E4A3D", "#417B5E"),   # dark green   -> green
            ("#88A8BF", "#4272A7"),   # pale blue    -> blue
            ("#597792", "#4272A7"),   # slate blue   -> blue
            ("#C6D9E6", "#4272A7"),   # palest blue  -> blue
        ):
            for table in ("notes", "todo_lists", "finance_rows"):
                conn.execute(
                    f"UPDATE {table} SET color=? WHERE color=? COLLATE NOCASE",
                    (new, old),
                )

        if orphan_rows:
            legacy_currency = "USD"
            has_settings_table = conn.execute(
                "SELECT name FROM sqlite_master WHERE type='table' AND name='finance_settings'"
            ).fetchone()
            if has_settings_table:
                settings_row = conn.execute("SELECT currency FROM finance_settings WHERE id=1").fetchone()
                if settings_row:
                    legacy_currency = settings_row["currency"]
            now = _now()
            cur = conn.execute(
                "INSERT INTO finance_tables (title, currency, position, created_at, updated_at) VALUES (?, ?, 0, ?, ?)",
                ("Finances", legacy_currency, now, now),
            )
            default_table_id = cur.lastrowid
            conn.execute("UPDATE finance_rows SET table_id=? WHERE table_id IS NULL", (default_table_id,))


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
    """log_count/log_sum back the card's footer stat - the number of Log
    rows under a project and their cost total, without a client round
    trip through the Log table."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT p.*, "
            "(SELECT COUNT(*) FROM project_tasks WHERE project_id = p.id) AS log_count, "
            "(SELECT COALESCE(SUM(cost), 0) FROM project_tasks WHERE project_id = p.id) AS log_sum "
            "FROM projects p ORDER BY position ASC, id DESC"
        ).fetchall()
        return [dict(row) for row in rows]


def create_project() -> dict:
    """Insert a blank project - the "+ New project" row calls this, then
    the modal opens on the returned row for the user to fill in, same
    create-then-edit-in-place pattern as Gatherer's rows. Gets the lowest
    position of any project so it lands at the top of the list, same
    spot a brand new row always used to appear in before drag-reordering
    existed."""
    now = _now()
    with get_connection() as conn:
        min_position = conn.execute("SELECT MIN(position) FROM projects").fetchone()[0]
        position = (min_position - 1) if min_position is not None else 0
        cur = conn.execute(
            "INSERT INTO projects (title, status, position, created_at, updated_at) VALUES ('', 'Active', ?, ?, ?)",
            (position, now, now),
        )
        row = conn.execute("SELECT * FROM projects WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def reorder_projects(ids: list[int]) -> None:
    """Assigns sequential positions matching the given id order - called
    after a drag-and-drop reorder in the UI. ids is only ever the
    currently-visible (Active or Completed) subset, never the full
    table; since the two views never render together, their position
    numbers are free to overlap without it being visible anywhere."""
    with get_connection() as conn:
        for position, project_id in enumerate(ids):
            conn.execute("UPDATE projects SET position=? WHERE id=?", (position, project_id))


def get_project(project_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None


def update_project(project_id: int, **fields) -> dict | None:
    allowed = {
        "title", "description", "status", "paid", "client", "deadline", "day_rate", "currency",
        "assets_text", "notes_text", "briefing_text",
    }
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
    """Deletes the project row and its docs/tasks, returning the deleted
    docs so the caller can also remove their files from disk - the DB
    layer doesn't touch the filesystem itself."""
    with get_connection() as conn:
        docs = [dict(r) for r in conn.execute("SELECT * FROM project_docs WHERE project_id=?", (project_id,)).fetchall()]
        conn.execute("DELETE FROM project_docs WHERE project_id=?", (project_id,))
        conn.execute("DELETE FROM project_tasks WHERE project_id=?", (project_id,))
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


def list_project_tasks(project_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM project_tasks WHERE project_id=? ORDER BY id", (project_id,)).fetchall()
        return [dict(row) for row in rows]


def create_project_task(project_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO project_tasks (project_id, task, status, duration, created_at, updated_at) "
            "VALUES (?, '', 'Active', 'Full', ?, ?)",
            (project_id, now, now),
        )
        row = conn.execute("SELECT * FROM project_tasks WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_project_task(task_id: int, **fields) -> dict | None:
    allowed = {"task", "status", "duration", "cost", "observation", "task_date"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM project_tasks WHERE id=?", (task_id,)).fetchone()
            return dict(row) if row else None

    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE project_tasks SET {set_clause} WHERE id=?",
            (*updates.values(), task_id),
        )
        row = conn.execute("SELECT * FROM project_tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None


def delete_project_task(task_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM project_tasks WHERE id=?", (task_id,))


# ---------- Tracker: personal projects ----------
# A separate, simpler table from `projects` - no client/deadline/day
# rate/docs/tasks, since personal projects don't bill anyone. Kept
# distinct rather than reusing `projects` with nullable fields so the
# two can keep diverging (a different section than Log is planned here
# later) without dragging billing-only columns along for the ride.

def list_personal_projects() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM personal_projects ORDER BY position ASC, id DESC").fetchall()
        return [dict(row) for row in rows]


def create_personal_project() -> dict:
    now = _now()
    with get_connection() as conn:
        min_position = conn.execute("SELECT MIN(position) FROM personal_projects").fetchone()[0]
        position = (min_position - 1) if min_position is not None else 0
        cur = conn.execute(
            "INSERT INTO personal_projects (title, status, position, created_at, updated_at) VALUES ('', 'Active', ?, ?, ?)",
            (position, now, now),
        )
        row = conn.execute("SELECT * FROM personal_projects WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def reorder_personal_projects(ids: list[int]) -> None:
    with get_connection() as conn:
        for position, project_id in enumerate(ids):
            conn.execute("UPDATE personal_projects SET position=? WHERE id=?", (position, project_id))


def get_personal_project(project_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM personal_projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None


def update_personal_project(project_id: int, **fields) -> dict | None:
    allowed = {"title", "description", "status", "assets_text", "notes_text", "references_text"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_personal_project(project_id)

    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE personal_projects SET {set_clause} WHERE id=?",
            (*updates.values(), project_id),
        )
        row = conn.execute("SELECT * FROM personal_projects WHERE id=?", (project_id,)).fetchone()
        return dict(row) if row else None


def delete_personal_project(project_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM personal_checklist_items WHERE personal_project_id=?", (project_id,))
        conn.execute("DELETE FROM personal_projects WHERE id=?", (project_id,))


def list_personal_checklist_items(project_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM personal_checklist_items WHERE personal_project_id=? ORDER BY id",
            (project_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def create_personal_checklist_item(project_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO personal_checklist_items (personal_project_id, text, checked, created_at, updated_at) "
            "VALUES (?, '', 0, ?, ?)",
            (project_id, now, now),
        )
        row = conn.execute("SELECT * FROM personal_checklist_items WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_personal_checklist_item(item_id: int, **fields) -> dict | None:
    allowed = {"text", "checked"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM personal_checklist_items WHERE id=?", (item_id,)).fetchone()
            return dict(row) if row else None

    if "checked" in updates:
        updates["checked"] = int(bool(updates["checked"]))
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE personal_checklist_items SET {set_clause} WHERE id=?",
            (*updates.values(), item_id),
        )
        row = conn.execute("SELECT * FROM personal_checklist_items WHERE id=?", (item_id,)).fetchone()
        return dict(row) if row else None


def delete_personal_checklist_item(item_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM personal_checklist_items WHERE id=?", (item_id,))


# ---------- To Do: lists, tasks, steps ----------
# Inspired by Microsoft To Do - multiple lists, each holding checkbox
# tasks. A task can carry an Importance star, freeform Notes, and a
# mini checklist of Steps (same shape as Personal Projects' checklist).

def list_todo_lists() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT tl.*, "
            "(SELECT COUNT(*) FROM todo_tasks t WHERE t.list_id = tl.id AND t.completed = 0) AS open_count "
            "FROM todo_lists tl ORDER BY tl.position ASC, tl.id ASC"
        ).fetchall()
        return [dict(row) for row in rows]


def reorder_todo_lists(ids: list[int]) -> None:
    with get_connection() as conn:
        for position, list_id in enumerate(ids):
            conn.execute("UPDATE todo_lists SET position=? WHERE id=?", (position, list_id))


def reorder_todo_tasks(list_id: int, ids: list[int]) -> None:
    """Positions every task in `ids` inside `list_id`, and moves any that
    belonged to a different list. One statement does both, because on a
    Kanban board dropping a card into another column IS the reorder - the
    two are never separate operations from the board's point of view."""
    with get_connection() as conn:
        for position, task_id in enumerate(ids):
            conn.execute(
                "UPDATE todo_tasks SET position=?, list_id=?, updated_at=? WHERE id=?",
                (position, list_id, _now(), task_id),
            )


def create_todo_list() -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO todo_lists (title, created_at, updated_at) VALUES ('', ?, ?)",
            (now, now),
        )
        row = conn.execute("SELECT * FROM todo_lists WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_todo_list(list_id: int, **fields) -> dict | None:
    allowed = {"title", "favorite", "color"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM todo_lists WHERE id=?", (list_id,)).fetchone()
            return dict(row) if row else None

    if "favorite" in updates:
        updates["favorite"] = int(bool(updates["favorite"]))
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE todo_lists SET {set_clause} WHERE id=?",
            (*updates.values(), list_id),
        )
        row = conn.execute("SELECT * FROM todo_lists WHERE id=?", (list_id,)).fetchone()
        return dict(row) if row else None


def delete_todo_list(list_id: int) -> None:
    with get_connection() as conn:
        task_ids = [r["id"] for r in conn.execute("SELECT id FROM todo_tasks WHERE list_id=?", (list_id,)).fetchall()]
        for task_id in task_ids:
            conn.execute("DELETE FROM todo_steps WHERE task_id=?", (task_id,))
        conn.execute("DELETE FROM todo_tasks WHERE list_id=?", (list_id,))
        conn.execute("DELETE FROM todo_lists WHERE id=?", (list_id,))


# "Due soon" means today, overdue, or inside this many days. Defined once
# because two things ask the question - Overview's panel and the toast - and
# a panel headed "Due Soon" that answers a different question than the
# notification is worse than either window being slightly wrong.
DUE_SOON_DAYS = 3


def list_due_soon_todo_tasks(days_ahead: int = DUE_SOON_DAYS) -> list[dict]:
    """Every incomplete task with a due date today, overdue, or within
    days_ahead days - across all lists. Backs the Due Soon notification
    toast, which is app-wide rather than scoped to one list."""
    with get_connection() as conn:
        # due_date != '' matters as much as IS NOT NULL, and is easy to
        # drop. A task with no due date stores "", not NULL - and SQLite
        # compares strings, where '' sorts before every date, so
        # "'' <= date('now','3 days')" is TRUE. Without this guard every
        # dateless task was reported as due soon, and ORDER BY put them at
        # the top of the toast. Overview's panel already had the guard,
        # which is why only the toast was over-counting.
        rows = conn.execute(
            "SELECT id, title, due_date, list_id FROM todo_tasks "
            "WHERE completed = 0 AND due_date IS NOT NULL AND due_date != '' "
            "AND due_date <= date('now', ? || ' days') "
            "ORDER BY due_date ASC",
            (str(days_ahead),),
        ).fetchall()
        return [dict(row) for row in rows]


def list_todo_tasks(list_id: int) -> list[dict]:
    """step_count/steps_done back the Kanban card's Steps badge, without a
    client round trip through each task's own steps list."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT t.*, "
            "(SELECT COUNT(*) FROM todo_steps WHERE task_id = t.id) AS step_count, "
            "(SELECT COUNT(*) FROM todo_steps WHERE task_id = t.id AND checked = 1) AS steps_done "
            "FROM todo_tasks t WHERE t.list_id=? ORDER BY t.position ASC, t.id DESC",
            (list_id,),
        ).fetchall()
        return [dict(row) for row in rows]


def clear_completed_todo_tasks(list_id: int) -> int:
    """Deletes every completed task (and its steps) in a list - the
    "Clean list" button's bulk action. Returns how many were removed."""
    with get_connection() as conn:
        task_ids = [
            r["id"] for r in conn.execute(
                "SELECT id FROM todo_tasks WHERE list_id=? AND completed=1", (list_id,)
            ).fetchall()
        ]
        for task_id in task_ids:
            conn.execute("DELETE FROM todo_steps WHERE task_id=?", (task_id,))
        conn.execute("DELETE FROM todo_tasks WHERE list_id=? AND completed=1", (list_id,))
        return len(task_ids)


def create_todo_task(list_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        min_position = conn.execute("SELECT MIN(position) FROM todo_tasks WHERE list_id=?", (list_id,)).fetchone()[0]
        position = (min_position - 1) if min_position is not None else 0
        cur = conn.execute(
            "INSERT INTO todo_tasks (list_id, title, position, created_at, updated_at) VALUES (?, '', ?, ?, ?)",
            (list_id, position, now, now),
        )
        row = conn.execute("SELECT * FROM todo_tasks WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def get_todo_task(task_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM todo_tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None


def update_todo_task(task_id: int, **fields) -> dict | None:
    allowed = {"title", "completed", "important", "notes", "due_date"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        return get_todo_task(task_id)

    for flag_field in ("completed", "important"):
        if flag_field in updates:
            updates[flag_field] = int(bool(updates[flag_field]))
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE todo_tasks SET {set_clause} WHERE id=?",
            (*updates.values(), task_id),
        )
        row = conn.execute("SELECT * FROM todo_tasks WHERE id=?", (task_id,)).fetchone()
        return dict(row) if row else None


def delete_todo_task(task_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM todo_steps WHERE task_id=?", (task_id,))
        conn.execute("DELETE FROM todo_tasks WHERE id=?", (task_id,))


def list_todo_steps(task_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM todo_steps WHERE task_id=? ORDER BY id", (task_id,)).fetchall()
        return [dict(row) for row in rows]


def create_todo_step(task_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO todo_steps (task_id, text, checked, created_at, updated_at) VALUES (?, '', 0, ?, ?)",
            (task_id, now, now),
        )
        row = conn.execute("SELECT * FROM todo_steps WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_todo_step(step_id: int, **fields) -> dict | None:
    allowed = {"text", "checked"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM todo_steps WHERE id=?", (step_id,)).fetchone()
            return dict(row) if row else None

    if "checked" in updates:
        updates["checked"] = int(bool(updates["checked"]))
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE todo_steps SET {set_clause} WHERE id=?",
            (*updates.values(), step_id),
        )
        row = conn.execute("SELECT * FROM todo_steps WHERE id=?", (step_id,)).fetchone()
        return dict(row) if row else None


def delete_todo_step(step_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM todo_steps WHERE id=?", (step_id,))


# ---------- Notes: Google Keep-style cards ----------
# A note is either "text" (title + freeform body) or "list" (title + a
# note_items checklist, same checkbox-and-title shape as todo_steps).
# Every note dict returned to the API carries an "items" list (empty for
# text notes) so the frontend doesn't need to branch on type to read it.

def _attach_items(conn, notes: list[dict]) -> list[dict]:
    if not notes:
        return notes
    item_rows = conn.execute(
        f"SELECT * FROM note_items WHERE note_id IN ({','.join('?' * len(notes))}) ORDER BY id",
        [n["id"] for n in notes],
    ).fetchall()
    items_by_note: dict[int, list[dict]] = {}
    for item in item_rows:
        items_by_note.setdefault(item["note_id"], []).append(dict(item))
    for note in notes:
        note["items"] = items_by_note.get(note["id"], [])
    return notes


def list_notes() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM notes ORDER BY position ASC, id DESC").fetchall()
        return _attach_items(conn, [dict(row) for row in rows])


def create_note(note_type: str = "text") -> dict:
    now = _now()
    with get_connection() as conn:
        min_position = conn.execute("SELECT MIN(position) FROM notes").fetchone()[0]
        position = (min_position - 1) if min_position is not None else 0
        cur = conn.execute(
            "INSERT INTO notes (title, type, position, created_at, updated_at) VALUES ('', ?, ?, ?, ?)",
            (note_type, position, now, now),
        )
        row = conn.execute("SELECT * FROM notes WHERE id=?", (cur.lastrowid,)).fetchone()
        note = dict(row)
        note["items"] = []
        return note


def reorder_notes(ids: list[int]) -> None:
    with get_connection() as conn:
        for position, note_id in enumerate(ids):
            conn.execute("UPDATE notes SET position=? WHERE id=?", (position, note_id))


def update_note(note_id: int, **fields) -> dict | None:
    allowed = {"title", "body", "color", "type"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
            if row is None:
                return None
            return _attach_items(conn, [dict(row)])[0]

    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE notes SET {set_clause} WHERE id=?",
            (*updates.values(), note_id),
        )
        row = conn.execute("SELECT * FROM notes WHERE id=?", (note_id,)).fetchone()
        if row is None:
            return None
        return _attach_items(conn, [dict(row)])[0]


def delete_note(note_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM note_items WHERE note_id=?", (note_id,))
        conn.execute("DELETE FROM notes WHERE id=?", (note_id,))


def list_note_items(note_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM note_items WHERE note_id=? ORDER BY id", (note_id,)).fetchall()
        return [dict(row) for row in rows]


def create_note_item(note_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO note_items (note_id, text, checked, created_at, updated_at) VALUES (?, '', 0, ?, ?)",
            (note_id, now, now),
        )
        row = conn.execute("SELECT * FROM note_items WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_note_item(item_id: int, **fields) -> dict | None:
    allowed = {"text", "checked"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if not updates:
        with get_connection() as conn:
            row = conn.execute("SELECT * FROM note_items WHERE id=?", (item_id,)).fetchone()
            return dict(row) if row else None

    if "checked" in updates:
        updates["checked"] = int(bool(updates["checked"]))
    updates["updated_at"] = _now()
    set_clause = ", ".join(f"{k}=?" for k in updates)
    with get_connection() as conn:
        conn.execute(
            f"UPDATE note_items SET {set_clause} WHERE id=?",
            (*updates.values(), item_id),
        )
        row = conn.execute("SELECT * FROM note_items WHERE id=?", (item_id,)).fetchone()
        return dict(row) if row else None


def delete_note_item(item_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM note_items WHERE id=?", (item_id,))


# ---------- Calculator (Finances): browser-tab-style tables, each a ----------
# ---------- Studio-Database-style ledger with a Value SUM -------------------
# Each `finance_tables` row is one tab, with its own title and currency.
# Title/Value/color/active are fixed columns on `finance_rows` - rows
# briefly supported user-added freeform columns too, but that feature
# and its two backing tables are gone (see the DROP in init_db).

def list_finance_tables() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM finance_tables ORDER BY position ASC, id ASC").fetchall()
        return [dict(row) for row in rows]


def create_finance_table(title: str = "Untitled") -> dict:
    now = _now()
    with get_connection() as conn:
        max_position = conn.execute("SELECT MAX(position) FROM finance_tables").fetchone()[0]
        position = (max_position + 1) if max_position is not None else 0
        cur = conn.execute(
            "INSERT INTO finance_tables (title, currency, position, created_at, updated_at) VALUES (?, 'USD', ?, ?, ?)",
            (title, position, now, now),
        )
        row = conn.execute("SELECT * FROM finance_tables WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_finance_table(table_id: int, **fields) -> dict | None:
    allowed = {"title", "currency"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if updates:
        updates["updated_at"] = _now()
        set_clause = ", ".join(f"{k}=?" for k in updates)
        with get_connection() as conn:
            conn.execute(f"UPDATE finance_tables SET {set_clause} WHERE id=?", (*updates.values(), table_id))
            row = conn.execute("SELECT * FROM finance_tables WHERE id=?", (table_id,)).fetchone()
            return dict(row) if row else None
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM finance_tables WHERE id=?", (table_id,)).fetchone()
        return dict(row) if row else None


def delete_finance_table(table_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM finance_rows WHERE table_id=?", (table_id,))
        conn.execute("DELETE FROM finance_tables WHERE id=?", (table_id,))


def list_finance_rows(table_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute("SELECT * FROM finance_rows WHERE table_id=? ORDER BY id", (table_id,)).fetchall()
        return [dict(row) for row in rows]


def create_finance_row(table_id: int) -> dict:
    now = _now()
    with get_connection() as conn:
        cur = conn.execute(
            "INSERT INTO finance_rows (table_id, title, created_at, updated_at) VALUES (?, '', ?, ?)",
            (table_id, now, now),
        )
        row = conn.execute("SELECT * FROM finance_rows WHERE id=?", (cur.lastrowid,)).fetchone()
        return dict(row)


def update_finance_row(row_id: int, **fields) -> dict | None:
    allowed = {"title", "value", "color", "active"}
    updates = {k: v for k, v in fields.items() if k in allowed}
    if updates:
        updates["updated_at"] = _now()
        set_clause = ", ".join(f"{k}=?" for k in updates)
        with get_connection() as conn:
            conn.execute(f"UPDATE finance_rows SET {set_clause} WHERE id=?", (*updates.values(), row_id))
            row = conn.execute("SELECT * FROM finance_rows WHERE id=?", (row_id,)).fetchone()
            return dict(row) if row else None
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM finance_rows WHERE id=?", (row_id,)).fetchone()
        return dict(row) if row else None


def delete_finance_row(row_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM finance_rows WHERE id=?", (row_id,))


# ---------- Overview: cross-tool launcher counts, stats, search ----------

def get_overview_stats() -> dict:
    """Everything the Overview hub needs in one round trip: each tool's
    launcher badge count, the three headline stat values (same numbers as
    three of those badges - the hub deliberately repeats them, nothing is
    computed twice), upcoming project deadlines, the most recently touched
    notes, incomplete to-dos, active projects, and a small preview of the
    newest notes for Overview's Full Board layout."""
    with get_connection() as conn:
        active_projects = conn.execute(
            "SELECT COUNT(*) FROM projects WHERE status='Active'"
        ).fetchone()[0]
        studios_logged = conn.execute("SELECT COUNT(*) FROM gatherer_entries").fetchone()[0]
        active_tasks = conn.execute(
            "SELECT COUNT(*) FROM todo_tasks WHERE completed=0"
        ).fetchone()[0]
        notes_count = conn.execute("SELECT COUNT(*) FROM notes").fetchone()[0]
        finance_tables_count = conn.execute("SELECT COUNT(*) FROM finance_tables").fetchone()[0]

        # Tasks due within DUE_SOON_DAYS, soonest first. Projects have
        # deadlines too, but a project deadline is weeks out and a task's is
        # the thing that decides what you do today - which is what this panel
        # is for. Overdue sorts to the top for free, being an earlier date.
        #
        # The date window is the point. Without it this listed the five
        # soonest dated tasks whatever their date, so a task due in three
        # months sat under a heading that says "Due Soon".
        due_soon = [
            dict(row)
            for row in conn.execute(
                "SELECT t.id, t.title, t.due_date, t.list_id, "
                "tl.title AS list_title, tl.color AS list_color "
                "FROM todo_tasks t JOIN todo_lists tl ON tl.id = t.list_id "
                "WHERE t.completed = 0 AND t.due_date IS NOT NULL AND t.due_date != '' "
                "AND t.due_date <= date('now', ? || ' days') "
                "ORDER BY t.due_date ASC LIMIT 5",
                (str(DUE_SOON_DAYS),),
            ).fetchall()
        ]

        recent_notes = [
            dict(row)
            for row in conn.execute(
                "SELECT id, body, type, updated_at, "
                "(SELECT text FROM note_items WHERE note_id = notes.id ORDER BY id LIMIT 1) AS first_item_text "
                "FROM notes ORDER BY updated_at DESC LIMIT 3"
            ).fetchall()
        ]

        today_focus = [
            dict(row)
            for row in conn.execute(
                "SELECT t.id, t.title, t.list_id, tl.title AS list_title, tl.color AS list_color "
                "FROM todo_tasks t JOIN todo_lists tl ON tl.id = t.list_id "
                "WHERE t.completed = 0 "
                "ORDER BY t.created_at DESC LIMIT 5"
            ).fetchall()
        ]

        active_project_list = [
            dict(row)
            for row in conn.execute(
                "SELECT id, title, client, status FROM projects "
                "WHERE status='Active' ORDER BY position ASC, id DESC LIMIT 3"
            ).fetchall()
        ]

        notes_preview = [
            dict(row)
            for row in conn.execute(
                "SELECT id, body, type, color, created_at, "
                "(SELECT COUNT(*) FROM note_items WHERE note_id = notes.id) AS item_count, "
                "(SELECT text FROM note_items WHERE note_id = notes.id ORDER BY id LIMIT 1) AS first_item_text "
                "FROM notes ORDER BY created_at DESC LIMIT 4"
            ).fetchall()
        ]

    return {
        "counts": {
            "tracker": active_projects,
            "gatherer": studios_logged,
            "todo": active_tasks,
            "notes": notes_count,
            "finance": finance_tables_count,
        },
        "due_soon": due_soon,
        "recent_notes": recent_notes,
        "today_focus": today_focus,
        "active_projects": active_project_list,
        "notes_preview": notes_preview,
    }


def _note_label(body: str | None, first_item_text: str | None) -> str:
    """Notes have no title - the search/overview surfaces that used to
    show one now show a short snippet of the actual content instead:
    the first line of a text note's body, or a list note's first item."""
    snippet = (body or "").strip().splitlines()[0].strip() if body and body.strip() else (first_item_text or "").strip()
    if not snippet:
        return "Empty note"
    return snippet if len(snippet) <= 60 else snippet[:60].rstrip() + "…"


def search_all(query: str, limit_per_type: int = 6) -> list[dict]:
    """Backs the Overview search bar - one LIKE query per searchable
    table. SQLite's LIKE is already case-insensitive for ASCII, which
    covers this app's use case. Notes have no title field to match
    against - matches their body text or, for a list note, any item's
    text, and returns a short snippet as the display label."""
    like = f"%{query}%"
    results: list[dict] = []
    with get_connection() as conn:
        for row in conn.execute(
            "SELECT id, title FROM projects WHERE title LIKE ? LIMIT ?", (like, limit_per_type)
        ):
            results.append({"type": "project", "id": row["id"], "title": row["title"] or "Untitled project"})
        for row in conn.execute(
            "SELECT id, title FROM gatherer_entries WHERE title LIKE ? LIMIT ?", (like, limit_per_type)
        ):
            results.append({"type": "studio", "id": row["id"], "title": row["title"] or "Untitled"})
        for row in conn.execute(
            "SELECT id, list_id, title FROM todo_tasks WHERE title LIKE ? LIMIT ?", (like, limit_per_type)
        ):
            results.append({
                "type": "task",
                "id": row["id"],
                "list_id": row["list_id"],
                "title": row["title"] or "Untitled task",
            })
        for row in conn.execute(
            "SELECT DISTINCT n.id, n.body, "
            "(SELECT text FROM note_items WHERE note_id = n.id AND text LIKE ? ORDER BY id LIMIT 1) AS matched_item_text "
            "FROM notes n LEFT JOIN note_items ni ON ni.note_id = n.id "
            "WHERE n.body LIKE ? OR ni.text LIKE ? LIMIT ?",
            (like, like, like, limit_per_type),
        ):
            results.append({"type": "note", "id": row["id"], "title": _note_label(row["body"], row["matched_item_text"])})
    return results


# ---------- Settings ----------
# One key/value table rather than a column per setting, so the next setting
# is an INSERT and not a migration.

def get_setting(key: str, default: str | None = None) -> str | None:
    with get_connection() as conn:
        row = conn.execute("SELECT value FROM app_settings WHERE key=?", (key,)).fetchone()
        return row["value"] if row else default


def get_settings(keys: list[str]) -> dict[str, str | None]:
    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT key, value FROM app_settings WHERE key IN ({','.join('?' * len(keys))})",
            keys,
        ).fetchall()
        found = {row["key"]: row["value"] for row in rows}
        return {key: found.get(key) for key in keys}


def set_setting(key: str, value: str | None) -> None:
    with get_connection() as conn:
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?,?,?) "
            "ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=excluded.updated_at",
            (key, value, _now()),
        )


# ---------- Documents index ----------
# Everything here describes files that live on the user's own disk. Nothing
# in this module ever writes to them - the index is a read-only mirror, and
# the only rows deleted are ones for files that are gone.

def replace_document_index(kind: str, records: list[dict]) -> dict:
    """Swaps one kind's slice of the index for a fresh scan, in one
    transaction.

    Scoped to `kind` throughout: rescanning invoices must not mark every NF
    missing just because that scan did not produce them. Files that vanished
    are marked missing rather than deleted, so tags keyed to their hash
    survive a file that comes back later. Returns what changed so the UI can
    report it without diffing the list itself.
    """
    now = _now()
    with get_connection() as conn:
        # Only rows that were actually present. Including already-missing
        # ones made `gone` cumulative - every file that had ever vanished
        # came back in it on every scan, so the status line reported a
        # growing "N missing" forever and the rename check below saw four
        # candidate sources where there was one.
        before = {
            row["path"]
            for row in conn.execute(
                "SELECT path FROM document_files WHERE kind=? AND missing=0", (kind,)
            )
        }
        seen = {rec["path"] for rec in records}

        for rec in records:
            conn.execute(
                "INSERT INTO document_files "
                "(kind, path, filename, display_name, sort_key, folder, group_name, "
                " size_bytes, mtime, year, content_hash, missing, indexed_at) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,0,?) "
                "ON CONFLICT(kind, path) DO UPDATE SET "
                "  filename=excluded.filename, display_name=excluded.display_name, "
                "  sort_key=excluded.sort_key, folder=excluded.folder, "
                "  group_name=excluded.group_name, size_bytes=excluded.size_bytes, "
                "  mtime=excluded.mtime, year=excluded.year, "
                "  content_hash=excluded.content_hash, missing=0, indexed_at=excluded.indexed_at",
                (kind, rec["path"], rec["filename"], rec["display_name"], rec["sort_key"],
                 rec["folder"], rec["group_name"], rec["size_bytes"], rec["mtime"],
                 rec["year"], rec["content_hash"], now),
            )

        gone = before - seen
        for path in gone:
            conn.execute(
                "UPDATE document_files SET missing=1 WHERE kind=? AND path=?", (kind, path)
            )

        # Follow a rename or a move, but only when it is unambiguous. Tags
        # hang off (kind, path), so a file that came back under a new name
        # would otherwise arrive untagged. If exactly one path with hash H
        # vanished and exactly one new path with the same H appeared, that
        # is a rename and the tags move with it. If a hash has copies -
        # "NF_XDS - Copy (2)" and friends - neither side is a single path,
        # the rule does not fire, and nothing is guessed at.
        added = seen - before
        if gone and added:
            by_hash: dict[str, dict[str, list[str]]] = {}
            for rec in records:
                if rec["path"] in added:
                    by_hash.setdefault(rec["content_hash"], {"gone": [], "new": []})["new"].append(rec["path"])
            for path in gone:
                row = conn.execute(
                    "SELECT content_hash FROM document_files WHERE kind=? AND path=?", (kind, path)
                ).fetchone()
                if row and row["content_hash"] in by_hash:
                    by_hash[row["content_hash"]]["gone"].append(path)
            for sides in by_hash.values():
                if len(sides["gone"]) != 1 or len(sides["new"]) != 1:
                    continue
                old_path, new_path = sides["gone"][0], sides["new"][0]
                conn.execute(
                    "UPDATE OR IGNORE document_file_tags SET path=? WHERE kind=? AND path=?",
                    (new_path, kind, old_path),
                )
                conn.execute(
                    "DELETE FROM document_file_tags WHERE kind=? AND path=?", (kind, old_path)
                )

        return {"indexed": len(records), "added": len(seen - before), "missing": len(gone)}


def known_document_files(kind: str) -> dict[str, dict]:
    """path -> {mtime, size_bytes, content_hash} for one kind, so a rescan
    can skip hashing anything whose mtime and size are unchanged."""
    with get_connection() as conn:
        return {
            row["path"]: dict(row)
            for row in conn.execute(
                "SELECT path, mtime, size_bytes, content_hash FROM document_files WHERE kind=?",
                (kind,),
            )
        }


def list_document_files(kind: str | None = None, include_missing: bool = False) -> list[dict]:
    with get_connection() as conn:
        clauses, params = [], []
        if not include_missing:
            clauses.append("missing = 0")
        if kind is not None:
            clauses.append("kind = ?")
            params.append(kind)
        where = (" WHERE " + " AND ".join(clauses)) if clauses else ""
        rows = conn.execute(
            f"SELECT * FROM document_files{where} ORDER BY kind, group_name IS NULL, "
            "group_name COLLATE NOCASE, sort_key",
            params,
        ).fetchall()
        files = [dict(row) for row in rows]

        tags: dict[tuple[str, str], list[dict]] = {}
        for row in conn.execute(
            "SELECT ft.kind, ft.path, t.id, t.name, t.color FROM document_file_tags ft "
            "JOIN document_tags t ON t.id = ft.tag_id ORDER BY t.name COLLATE NOCASE"
        ):
            tags.setdefault((row["kind"], row["path"]), []).append(
                {"id": row["id"], "name": row["name"], "color": row["color"]}
            )
        for f in files:
            f["tags"] = tags.get((f["kind"], f["path"]), [])
        return files


def get_document_file(file_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM document_files WHERE id=?", (file_id,)).fetchone()
        return dict(row) if row else None


def clear_document_index(kind: str | None = None) -> None:
    with get_connection() as conn:
        if kind is None:
            conn.execute("DELETE FROM document_files")
        else:
            conn.execute("DELETE FROM document_files WHERE kind=?", (kind,))


# ---------- Invoices ----------
# Written by the user rather than found on disk (that is document_files),
# and every column is TEXT: see the schema comment. Nothing here totals,
# rounds or reformats anything.

INVOICE_FIELDS = (
    "title", "bill_from", "bill_to", "project_number", "invoice_number",
    "invoice_date", "due_date", "project_label", "summary_label",
    "summary_year", "total_text", "notes", "contact",
    "body_mode", "free_body",
)

INVOICE_ROW_FIELDS = (
    "project_title", "project_desc", "client", "agency",
    "dates", "day_rate", "days_worked", "total",
)


def _invoice_with_rows(conn, row) -> dict:
    invoice = dict(row)
    invoice["rows"] = [
        dict(r) for r in conn.execute(
            "SELECT * FROM invoice_rows WHERE invoice_id=? ORDER BY position, id",
            (invoice["id"],),
        )
    ]
    return invoice


def list_invoices() -> list[dict]:
    """Newest first, and without their rows - the list only shows a name and
    a date, and pulling every row of every invoice to render that would be
    work thrown away."""
    with get_connection() as conn:
        return [dict(r) for r in conn.execute(
            "SELECT * FROM invoices ORDER BY id DESC"
        )]


def get_invoice(invoice_id: int) -> dict | None:
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
        return _invoice_with_rows(conn, row) if row else None


def create_invoice(**fields) -> dict:
    now = _now()
    cols = [f for f in INVOICE_FIELDS if f in fields]
    with get_connection() as conn:
        cur = conn.execute(
            f"INSERT INTO invoices ({', '.join(cols + ['created_at', 'updated_at'])}) "
            f"VALUES ({', '.join('?' * (len(cols) + 2))})",
            [fields[c] for c in cols] + [now, now],
        )
        row = conn.execute("SELECT * FROM invoices WHERE id=?", (cur.lastrowid,)).fetchone()
        return _invoice_with_rows(conn, row)


def update_invoice(invoice_id: int, **fields) -> dict | None:
    cols = [f for f in INVOICE_FIELDS if f in fields]
    with get_connection() as conn:
        if cols:
            conn.execute(
                f"UPDATE invoices SET {', '.join(c + '=?' for c in cols)}, updated_at=? WHERE id=?",
                [fields[c] for c in cols] + [_now(), invoice_id],
            )
        row = conn.execute("SELECT * FROM invoices WHERE id=?", (invoice_id,)).fetchone()
        return _invoice_with_rows(conn, row) if row else None


def delete_invoice(invoice_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM invoice_rows WHERE invoice_id=?", (invoice_id,))
        conn.execute("DELETE FROM invoices WHERE id=?", (invoice_id,))


def add_invoice_row(invoice_id: int, **fields) -> dict:
    cols = [f for f in INVOICE_ROW_FIELDS if f in fields]
    with get_connection() as conn:
        nxt = conn.execute(
            "SELECT COALESCE(MAX(position), -1) + 1 FROM invoice_rows WHERE invoice_id=?",
            (invoice_id,),
        ).fetchone()[0]
        cur = conn.execute(
            f"INSERT INTO invoice_rows (invoice_id, position{''.join(', ' + c for c in cols)}) "
            f"VALUES ({', '.join('?' * (len(cols) + 2))})",
            [invoice_id, nxt] + [fields[c] for c in cols],
        )
        return dict(conn.execute(
            "SELECT * FROM invoice_rows WHERE id=?", (cur.lastrowid,)
        ).fetchone())


def update_invoice_row(row_id: int, **fields) -> dict | None:
    cols = [f for f in INVOICE_ROW_FIELDS if f in fields]
    with get_connection() as conn:
        if cols:
            conn.execute(
                f"UPDATE invoice_rows SET {', '.join(c + '=?' for c in cols)} WHERE id=?",
                [fields[c] for c in cols] + [row_id],
            )
        row = conn.execute("SELECT * FROM invoice_rows WHERE id=?", (row_id,)).fetchone()
        return dict(row) if row else None


def delete_invoice_row(row_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM invoice_rows WHERE id=?", (row_id,))


# ---------- Document tags ----------

def list_document_tags() -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT t.*, (SELECT COUNT(*) FROM document_file_tags ft WHERE ft.tag_id = t.id) "
            "AS file_count FROM document_tags t ORDER BY t.name COLLATE NOCASE"
        ).fetchall()
        return [dict(row) for row in rows]


def create_document_tag(name: str, color: str | None = None) -> dict:
    """Reuses an existing tag whose name differs only in case. The UNIQUE
    index is case-sensitive, so without this "Paid" typed over an existing
    "paid" quietly becomes a second tag that means the same thing - and the
    two then sit side by side on the same file."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT * FROM document_tags WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        if row is None:
            conn.execute("INSERT INTO document_tags (name, color) VALUES (?,?)", (name, color))
        elif color is not None:
            conn.execute("UPDATE document_tags SET color=? WHERE id=?", (color, row["id"]))
        row = conn.execute(
            "SELECT * FROM document_tags WHERE name = ? COLLATE NOCASE", (name,)
        ).fetchone()
        return dict(row)


def set_document_tag_color(tag_id: int, color: str | None) -> dict | None:
    with get_connection() as conn:
        conn.execute("UPDATE document_tags SET color=? WHERE id=?", (color, tag_id))
        row = conn.execute("SELECT * FROM document_tags WHERE id=?", (tag_id,)).fetchone()
        return dict(row) if row else None


def delete_document_tag(tag_id: int) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM document_file_tags WHERE tag_id=?", (tag_id,))
        conn.execute("DELETE FROM document_tags WHERE id=?", (tag_id,))


def set_document_file_tags(kind: str, path: str, tag_ids: list[int]) -> None:
    with get_connection() as conn:
        conn.execute("DELETE FROM document_file_tags WHERE kind=? AND path=?", (kind, path))
        for tag_id in tag_ids:
            conn.execute(
                "INSERT OR IGNORE INTO document_file_tags (kind, path, tag_id) VALUES (?,?,?)",
                (kind, path, tag_id),
            )
