"""API routes for the To Do tool: multiple lists, each holding checkbox
tasks with an Importance star, freeform Notes, and a Steps checklist.
Thin HTTP wrapper around storage/db.py, same pattern as api/gatherer.py
and api/tracker.py.
"""
from __future__ import annotations

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from storage import db

db.init_db()

router = APIRouter()


class TodoListUpdate(BaseModel):
    title: str | None = None
    favorite: bool | None = None
    color: str | None = None


class TodoTaskUpdate(BaseModel):
    title: str | None = None
    completed: bool | None = None
    important: bool | None = None
    notes: str | None = None
    due_date: str | None = None


class TodoStepUpdate(BaseModel):
    text: str | None = None
    checked: bool | None = None


class ReorderPayload(BaseModel):
    ids: list[int]


@router.get("/lists")
def list_lists():
    return {"lists": db.list_todo_lists()}


@router.get("/due-soon")
def due_soon():
    return {"tasks": db.list_due_soon_todo_tasks()}


@router.put("/lists/reorder")
def reorder_lists(payload: ReorderPayload):
    """Declared above /lists/{list_id} on purpose: FastAPI matches routes in
    definition order, so with these the other way round "reorder" would be
    parsed as a list_id and rejected as a bad int."""
    db.reorder_todo_lists(payload.ids)
    return {"ok": True}


@router.put("/lists/{list_id}/tasks/reorder")
def reorder_tasks(list_id: int, payload: ReorderPayload):
    """ids are the tasks that should now be in this list, in order. A card
    dragged in from another column is included, and moves lists as part of
    the same call - see db.reorder_todo_tasks."""
    db.reorder_todo_tasks(list_id, payload.ids)
    return {"ok": True}


@router.post("/lists")
def create_list():
    return db.create_todo_list()


@router.put("/lists/{list_id}")
def update_list(list_id: int, payload: TodoListUpdate):
    updates = payload.model_dump(exclude_unset=True)
    todo_list = db.update_todo_list(list_id, **updates)
    if todo_list is None:
        raise HTTPException(404, "List not found")
    return todo_list


@router.delete("/lists/{list_id}")
def delete_list(list_id: int):
    db.delete_todo_list(list_id)
    return {"ok": True}


@router.get("/lists/{list_id}/tasks")
def list_tasks(list_id: int):
    return {"tasks": db.list_todo_tasks(list_id)}


@router.post("/lists/{list_id}/tasks")
def create_task(list_id: int):
    return db.create_todo_task(list_id)


@router.delete("/lists/{list_id}/tasks/completed")
def clear_completed_tasks(list_id: int):
    deleted = db.clear_completed_todo_tasks(list_id)
    return {"ok": True, "deleted": deleted}


@router.get("/lists/{list_id}/tasks/{task_id}")
def get_task(list_id: int, task_id: int):
    task = db.get_todo_task(task_id)
    if task is None or task["list_id"] != list_id:
        raise HTTPException(404, "Task not found")
    task["steps"] = db.list_todo_steps(task_id)
    return task


@router.put("/lists/{list_id}/tasks/{task_id}")
def update_task(list_id: int, task_id: int, payload: TodoTaskUpdate):
    updates = payload.model_dump(exclude_unset=True)
    task = db.update_todo_task(task_id, **updates)
    if task is None or task["list_id"] != list_id:
        raise HTTPException(404, "Task not found")
    return task


@router.delete("/lists/{list_id}/tasks/{task_id}")
def delete_task(list_id: int, task_id: int):
    db.delete_todo_task(task_id)
    return {"ok": True}


@router.post("/lists/{list_id}/tasks/{task_id}/steps")
def create_step(list_id: int, task_id: int):
    if db.get_todo_task(task_id) is None:
        raise HTTPException(404, "Task not found")
    return db.create_todo_step(task_id)


@router.put("/lists/{list_id}/tasks/{task_id}/steps/{step_id}")
def update_step(list_id: int, task_id: int, step_id: int, payload: TodoStepUpdate):
    updates = payload.model_dump(exclude_unset=True)
    step = db.update_todo_step(step_id, **updates)
    if step is None or step["task_id"] != task_id:
        raise HTTPException(404, "Step not found")
    return step


@router.delete("/lists/{list_id}/tasks/{task_id}/steps/{step_id}")
def delete_step(list_id: int, task_id: int, step_id: int):
    db.delete_todo_step(step_id)
    return {"ok": True}
