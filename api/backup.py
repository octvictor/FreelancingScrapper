"""Backing up everything VAIO holds, into one file you can put somewhere safe.

All of a person's use of this app - every project, note, task, invoice,
uploaded document and the payment image - lives in the `data` folder next
to the executable. That makes it easy to move and easy to lose: replacing
the app with a new version is safe, but a mistyped folder or a dead disk
is not, and there was no one-click way to take a copy.

A backup here is a single .zip of the whole data folder, named with the
moment it was taken. Restoring is deliberately manual - see the note on
the delete route - because an in-app "restore" button is a button that
overwrites everything you have, and the moment to think carefully about
that is not the moment you are panicking.
"""
from __future__ import annotations

import os
import shutil
import sqlite3
import tempfile
import zipfile
from datetime import datetime
from pathlib import Path

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

import app_paths
from storage import db

router = APIRouter()

BACKUP_DIR = app_paths.DATA_DIR / "backups"
PREFIX = "vaio-backup-"


class BackupName(BaseModel):
    name: str


def _safe_backup_path(name: str) -> Path:
    """Resolves a client-supplied name inside the backups folder, or 404s.

    The name comes from the browser, so it is treated as untrusted: it has
    to be a plain filename that resolves to something actually inside the
    backups folder. Without this check a name like "../../vaio.db" would
    let the delete route reach the live database.
    """
    if not name.startswith(PREFIX) or not name.endswith(".zip") or Path(name).name != name:
        raise HTTPException(400, "That is not a backup file name")
    target = (BACKUP_DIR / name).resolve()
    try:
        target.relative_to(BACKUP_DIR.resolve())
    except ValueError:
        raise HTTPException(400, "That path is outside the backups folder")
    if not target.exists():
        raise HTTPException(404, "That backup no longer exists")
    return target


def _describe(path: Path) -> dict:
    stat = path.stat()
    return {
        "name": path.name,
        "size_bytes": stat.st_size,
        "created_at": datetime.fromtimestamp(stat.st_mtime).isoformat(timespec="seconds"),
    }


@router.get("")
def list_backups():
    """Newest first, plus where they live so the UI can show a real path."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    files = sorted(BACKUP_DIR.glob(f"{PREFIX}*.zip"), key=lambda p: p.stat().st_mtime, reverse=True)
    return {"folder": str(BACKUP_DIR), "backups": [_describe(p) for p in files]}


@router.post("")
def create_backup():
    """Snapshots the database, then zips it with the uploaded files.

    The database is copied with sqlite3's own backup API rather than
    shutil.copy. A SQLite file being written to while it is copied can
    produce a torn copy - one that opens fine and is missing the last
    thing you did, or refuses to open at all. The backup API takes a
    consistent snapshot even while the app is running, which it always is
    when this route is called.
    """
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d_%H-%M-%S")
    archive = BACKUP_DIR / f"{PREFIX}{stamp}.zip"

    with tempfile.TemporaryDirectory() as tmp:
        snapshot = Path(tmp) / "vaio.db"
        source = sqlite3.connect(str(db.DB_PATH))
        try:
            target = sqlite3.connect(str(snapshot))
            try:
                source.backup(target)
            finally:
                target.close()
        finally:
            source.close()

        with zipfile.ZipFile(archive, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(snapshot, "data/vaio.db")

            # The uploaded files matter as much as the rows that point at
            # them: a backup with the invoice but not the payment image, or
            # the project but not its briefing PDF, is a backup that only
            # looks complete. The backups folder is skipped so backups do
            # not start containing each other.
            for folder in (app_paths.PROJECT_DOCS_DIR, app_paths.DATA_DIR / "invoice_assets"):
                if not folder.exists():
                    continue
                for path in folder.rglob("*"):
                    if path.is_file():
                        zf.write(path, str(Path("data") / path.relative_to(app_paths.DATA_DIR)))

    return {"folder": str(BACKUP_DIR), **_describe(archive)}


@router.delete("/{name}")
def delete_backup(name: str):
    """Deleting is the only management offered, and restoring is not here.

    Putting a backup back means closing VAIO, opening the .zip and copying
    `data/vaio.db` over the one next to the app. That is three steps a
    person does deliberately, rather than one button that silently
    replaces everything they have done since the backup was taken.
    """
    _safe_backup_path(name).unlink()
    return {"ok": True}


@router.post("/reveal")
def reveal_backups():
    """Opens the backups folder in Explorer/Finder, so the file can be
    copied somewhere that is not this disk - which is the only version of
    this feature that survives the drive failing."""
    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    import subprocess
    import sys

    path = str(BACKUP_DIR)
    try:
        if sys.platform == "darwin":
            subprocess.run(["open", path], check=False)
        elif os.name == "nt":
            os.startfile(path)  # type: ignore[attr-defined]
        else:
            subprocess.run(["xdg-open", path], check=False)
    except Exception as exc:
        raise HTTPException(500, f"Could not open the folder: {exc}")
    return {"ok": True, "folder": path}
