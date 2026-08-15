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
        conn.executescript(SCHEMA)
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

        # `notes` shipped before `type` existed - same story.
        note_columns = {row["name"] for row in conn.execute("PRAGMA table_info(notes)")}
        if "type" not in note_columns:
            conn.execute("ALTER TABLE notes ADD COLUMN type TEXT NOT NULL DEFAULT 'text'")


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
        rows = conn.execute("SELECT * FROM projects ORDER BY position ASC, id DESC").fetchall()
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
            "FROM todo_lists tl ORDER BY tl.id"
        ).fetchall()
        return [dict(row) for row in rows]


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


def list_todo_tasks(list_id: int) -> list[dict]:
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT * FROM todo_tasks WHERE list_id=? ORDER BY position ASC, id DESC",
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
    allowed = {"title", "completed", "important", "notes"}
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
    allowed = {"title", "body", "color"}
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
