"""API routes for the Tracker tool: project cards (title, status,
deadline, day rate) with attached Docs (contract/invoice files, stored
together as a flat list). Thin HTTP wrapper around storage/db.py, same
pattern as api/gatherer.py - the one difference is Docs also touch the
filesystem (uploaded files live under app_paths.PROJECT_DOCS_DIR), so
this module - not storage/db.py - owns reading/writing/deleting them.
"""
from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile
from fastapi.responses import FileResponse
from pydantic import BaseModel

from app_paths import PROJECT_DOCS_DIR
from storage import db

db.init_db()

router = APIRouter()


class ProjectUpdate(BaseModel):
    title: str | None = None
    description: str | None = None
    status: str | None = None
    deadline: str | None = None
    day_rate: float | None = None


class TaskUpdate(BaseModel):
    task: str | None = None
    status: str | None = None
    duration: str | None = None
    cost: float | None = None
    task_date: str | None = None


def _project_dir(project_id: int) -> Path:
    return PROJECT_DOCS_DIR / str(project_id)


@router.get("/projects")
def list_projects():
    return {"projects": db.list_projects()}


@router.post("/projects")
def create_project():
    return db.create_project()


@router.get("/projects/{project_id}")
def get_project(project_id: int):
    project = db.get_project(project_id)
    if project is None:
        raise HTTPException(404, "Project not found")
    project["docs"] = db.list_project_docs(project_id)
    project["tasks"] = db.list_project_tasks(project_id)
    return project


@router.put("/projects/{project_id}")
def update_project(project_id: int, payload: ProjectUpdate):
    updates = payload.model_dump(exclude_unset=True)
    project = db.update_project(project_id, **updates)
    if project is None:
        raise HTTPException(404, "Project not found")
    return project


@router.delete("/projects/{project_id}")
def delete_project(project_id: int):
    docs = db.delete_project(project_id)
    for doc in docs:
        (_project_dir(project_id) / doc["stored_name"]).unlink(missing_ok=True)
    return {"ok": True}


@router.post("/projects/{project_id}/docs")
async def upload_doc(project_id: int, file: UploadFile):
    if db.get_project(project_id) is None:
        raise HTTPException(404, "Project not found")

    original_name = Path(file.filename or "file").name
    stored_name = f"{uuid.uuid4().hex}_{original_name}"
    project_dir = _project_dir(project_id)
    project_dir.mkdir(parents=True, exist_ok=True)
    contents = await file.read()
    (project_dir / stored_name).write_bytes(contents)

    return db.add_project_doc(project_id, original_name, stored_name)


@router.get("/projects/{project_id}/docs/{doc_id}")
def download_doc(project_id: int, doc_id: int):
    doc = db.get_project_doc(doc_id)
    if doc is None or doc["project_id"] != project_id:
        raise HTTPException(404, "Doc not found")
    path = _project_dir(project_id) / doc["stored_name"]
    if not path.exists():
        raise HTTPException(404, "File missing on disk")
    return FileResponse(path, filename=doc["filename"])


@router.delete("/projects/{project_id}/docs/{doc_id}")
def delete_doc(project_id: int, doc_id: int):
    doc = db.delete_project_doc(doc_id)
    if doc is None or doc["project_id"] != project_id:
        raise HTTPException(404, "Doc not found")
    (_project_dir(project_id) / doc["stored_name"]).unlink(missing_ok=True)
    return {"ok": True}


@router.get("/projects/{project_id}/tasks")
def list_tasks(project_id: int):
    return {"tasks": db.list_project_tasks(project_id)}


@router.post("/projects/{project_id}/tasks")
def create_task(project_id: int):
    if db.get_project(project_id) is None:
        raise HTTPException(404, "Project not found")
    return db.create_project_task(project_id)


@router.put("/projects/{project_id}/tasks/{task_id}")
def update_task(project_id: int, task_id: int, payload: TaskUpdate):
    updates = payload.model_dump(exclude_unset=True)
    task = db.update_project_task(task_id, **updates)
    if task is None or task["project_id"] != project_id:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/projects/{project_id}/tasks/{task_id}")
def delete_task(project_id: int, task_id: int):
    db.delete_project_task(task_id)
    return {"ok": True}
