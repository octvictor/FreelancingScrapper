"""Walks a folder the user nominated and indexes the PDFs that match.

Strictly read-only. Nothing in this module opens a file for writing,
renames, moves or deletes anything under the scanned path - the user's
folder tree is the system of record and VAIO is a lens over it. The only
bytes read are the first chunk of each file, for the content hash.
"""
from __future__ import annotations

import hashlib
import os
import re
from datetime import datetime, timezone
from pathlib import Path

# Directories never worth walking. A missed skip is seconds per scan on a
# real work folder, and none of these has ever held an invoice.
SKIP_DIRS = {
    "node_modules", "__pycache__", "Library", "System",
    ".git", ".svn", ".venv", "venv", "env",
    "$RECYCLE.BIN", "System Volume Information",
}

# Phase one indexes PDFs only. Widening this is the one-line change.
EXTENSIONS = {".pdf"}

# Enough bytes to tell two files apart without reading a 200MB one in full.
# Combined with the size, a collision between two real invoices is not a
# plausible risk.
HASH_BYTES = 64 * 1024

_DIGITS = re.compile(r"(\d+)")


def natural_key(name: str) -> str:
    """Sort key where digit runs compare as numbers.

    Plain string sorting gives "Invoice 1, Invoice 10, Invoice 2", which is
    the first thing anyone notices in a list of numbered invoices. Zero-pads
    each run to a fixed width so ordinary string comparison does the right
    thing - and stays a TEXT column SQLite can ORDER BY directly.
    """
    return "".join(
        part.rjust(12, "0") if part.isdigit() else part.lower()
        for part in _DIGITS.split(name)
    )


def parse_terms(raw: str | None) -> list[str]:
    """"Invoice, Fatura" -> ["invoice", "fatura"]. Lowercased for matching."""
    if not raw:
        return []
    return [t.strip().lower() for t in raw.split(",") if t.strip()]


def _matches(filename: str, folder_parts: list[str], terms: list[str]) -> bool:
    """A file qualifies if a term is in its own name OR in any folder above
    it. Folder-only would miss a loose "Invoice 7.pdf"; filename-only would
    miss "fatura_003.pdf" sitting inside an Invoices folder. Either catches
    both, and the search box narrows afterwards."""
    haystacks = [filename.lower()] + [p.lower() for p in folder_parts]
    return any(term in hay for term in terms for hay in haystacks)


_YEARISH = re.compile(r"^(19|20)\d{2}$")


def _group_of(parts: list[str], terms: list[str]) -> str | None:
    """The folder a file belongs *to*, walking up until a name means something.

    The obvious rule - "the folder above the folder the file is in" - breaks
    the moment a tree has an extra level: /Clients/Cedar/2024/Invoices/x.pdf
    groups under "2024", and every client with a year folder collapses into
    the same handful of meaningless groups. So instead this walks up from the
    file and skips names that carry no identity: the search terms themselves
    (an "Invoices" folder says only what is inside it, which is why the file
    matched) and bare years. The first name left is the client, the project,
    whatever the user actually organises by.

    Returns None only if every level up to the root was skipped.
    """
    for name in reversed(parts):
        low = name.lower()
        if _YEARISH.match(name):
            continue
        if any(term in low for term in terms):
            continue
        return name
    return None


def _hash_file(path: str, size: int) -> str:
    h = hashlib.sha256()
    h.update(str(size).encode())
    with open(path, "rb") as fh:
        h.update(fh.read(HASH_BYTES))
    return h.hexdigest()


def scan(root: str, terms: list[str], known: dict[str, dict] | None = None) -> list[dict]:
    """Returns one record per matching file. `known` is the existing index -
    a file whose mtime and size are unchanged keeps its stored hash instead
    of being re-read, which is what makes a rescan cheap."""
    known = known or {}
    root_path = Path(root).expanduser().resolve()
    if not terms or not root_path.is_dir():
        return []

    records: list[dict] = []

    def walk(directory: Path, parts: list[str]) -> None:
        try:
            entries = list(os.scandir(directory))
        except (PermissionError, OSError):
            # An unreadable subfolder skips itself, it does not fail the scan.
            return
        for entry in entries:
            name = entry.name
            if name.startswith("."):
                continue
            try:
                is_dir = entry.is_dir(follow_symlinks=False)
            except OSError:
                continue
            if is_dir:
                if name not in SKIP_DIRS:
                    walk(Path(entry.path), parts + [name])
                continue
            if Path(name).suffix.lower() not in EXTENSIONS:
                continue
            if not _matches(name, parts, terms):
                continue
            try:
                stat = entry.stat()
            except OSError:
                continue

            prior = known.get(entry.path)
            unchanged = (
                prior
                and prior["size_bytes"] == stat.st_size
                and abs(prior["mtime"] - stat.st_mtime) < 0.001
            )
            try:
                content_hash = prior["content_hash"] if unchanged else _hash_file(entry.path, stat.st_size)
            except OSError:
                continue

            stem = Path(name).stem
            records.append({
                "path": entry.path,
                "filename": name,
                "display_name": stem,
                "sort_key": natural_key(stem),
                "folder": parts[-1] if parts else root_path.name,
                "group_name": _group_of(parts, terms),
                "size_bytes": stat.st_size,
                "mtime": stat.st_mtime,
                "year": datetime.fromtimestamp(stat.st_mtime, timezone.utc).year,
                "content_hash": content_hash,
            })

    walk(root_path, [])
    records.sort(key=lambda r: ((r["group_name"] or "").lower(), r["sort_key"]))
    return records


def preview(root: str, terms: list[str]) -> dict:
    """Counts for the Settings field, so a term can be judged as it is typed
    rather than by staring at the resulting list and wondering what it
    missed. Reports why a path failed rather than returning an empty count,
    since "no matches" and "cannot read that folder" look identical."""
    if not root:
        return {"ok": False, "reason": "no_path", "folders": 0, "files": 0}
    root_path = Path(root).expanduser()
    if not root_path.exists():
        return {"ok": False, "reason": "not_found", "folders": 0, "files": 0}
    if not root_path.is_dir():
        return {"ok": False, "reason": "not_a_folder", "folders": 0, "files": 0}
    if not os.access(root_path, os.R_OK):
        return {"ok": False, "reason": "unreadable", "folders": 0, "files": 0}
    if not terms:
        return {"ok": False, "reason": "no_terms", "folders": 0, "files": 0}

    records = scan(str(root_path), terms)
    folders = {Path(r["path"]).parent for r in records}
    return {"ok": True, "reason": None, "folders": len(folders), "files": len(records)}
