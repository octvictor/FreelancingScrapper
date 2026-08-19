// To Do tool - a Kanban board, one column per list, laid out side by
// side so every list is visible at once instead of clicked through one
// at a time (approved over the previous rail-plus-single-list-pane
// layout). Each task is a compact card carrying its list's color as a
// stripe, a Steps sub-checklist progress badge, and - if set - a due
// date shown via the shared dueDateMeta() urgency convention (nav.js).
// A task can carry freeform Notes and a Steps checklist (reusing the
// same .checklist-item markup/pattern as Personal Projects' checklist,
// namespaced separately so its buttons don't collide with that one).
// Favoriting only applies to lists, not individual tasks. $()/
// confirmDialog/dueDateMeta come from nav.js, escapeAttr from
// gatherer.js, openColorPresetPopover from nav.js.

let todoLists = [];
let todoTasksByList = {};
let activeTodoTaskId = null;
let activeTodoTaskListId = null;
let todoFavoritesOnly = false;
let todoCompletedExpanded = {};

// ---------- Board ----------

function todoCardHtml(task, listColor) {
    const isCompleted = !!task.completed;
    const dueBadge = task.due_date
        ? (() => {
              const meta = dueDateMeta(task.due_date);
              return `<span class="kcard-due ${meta.urgency}"><span class="kcard-due-dot"></span>${meta.label}</span>`;
          })()
        : "";
    const stepsBadge = task.step_count > 0
        ? `<span class="kcard-steps ${task.steps_done === task.step_count ? "done" : ""}">${task.steps_done}/${task.step_count} steps</span>`
        : "";
    return `
        <div class="kcard ${isCompleted ? "completed" : ""}" data-id="${task.id}" style="--stripe: ${isCompleted ? "var(--border)" : (listColor || "var(--text-faint)")};">
            <div class="kcard-stripe"></div>
            <div class="kcard-title">${escapeAttr(task.title) || "Untitled task"}</div>
            <div class="kcard-foot">
                <input type="checkbox" class="todo-task-checkbox" ${isCompleted ? "checked" : ""}>
                <span class="kcard-foot-meta">${dueBadge}${stepsBadge}</span>
            </div>
        </div>
    `;
}

function todoColumnHtml(list) {
    const tasks = todoTasksByList[list.id] || [];
    const active = tasks.filter((t) => !t.completed);
    const completed = tasks.filter((t) => t.completed);
    const expanded = !!todoCompletedExpanded[list.id];
    const dotStyle = list.color ? `background:${list.color}; border-color:transparent;` : "background:transparent;";

    return `
        <div class="kanban-col" data-id="${list.id}">
            <div class="kanban-col-head">
                <button class="swatch-btn ${list.color ? "" : "swatch-btn-empty"}" data-role="color" type="button" title="List color" style="${list.color ? `background:${list.color};` : ""}">${list.color ? "" : "&#9681;"}</button>
                <input type="text" class="kanban-col-title-input" data-role="title" value="${escapeAttr(list.title)}" placeholder="List name">
                <span class="kanban-col-count">${active.length}</span>
                <button class="todo-star-btn ${list.favorite ? "active" : ""}" data-role="favorite" type="button" title="Mark list favorite">&#9733;</button>
                <button class="kanban-col-delete" data-role="delete" type="button" title="Delete list">&times;</button>
            </div>
            <div class="kanban-col-tasks" data-role="tasks">
                ${active.length ? active.map((t) => todoCardHtml(t, list.color)).join("") : `<p class="todo-empty-state">No tasks yet.</p>`}
            </div>
            <button class="kanban-add-task" data-role="add-task" type="button">+ Add task</button>
            <div class="kanban-completed-wrap" data-role="completed-wrap" style="${completed.length ? "" : "display:none;"}">
                <button class="todo-completed-toggle ${expanded ? "expanded" : ""}" data-role="completed-toggle" type="button">
                    <span class="todo-completed-chevron">&#9662;</span>
                    <span data-role="completed-label">Completed (${completed.length})</span>
                </button>
                <div class="kanban-completed-list" data-role="completed-list" style="${expanded ? "" : "display:none;"}">
                    ${completed.map((t) => todoCardHtml(t, list.color)).join("")}
                </div>
            </div>
        </div>
    `;
}

function renderTodoBoard() {
    const container = $("todo-board");
    const visibleLists = todoFavoritesOnly ? todoLists.filter((l) => l.favorite) : todoLists;

    if (visibleLists.length === 0 && !todoFavoritesOnly) {
        container.innerHTML = `<button class="kanban-col-new" id="todo-list-add-btn" type="button">+ New list</button>`;
        wireTodoAddListBtn();
        return;
    }

    if (visibleLists.length === 0) {
        container.innerHTML = `<p class="todo-empty-state">No favorite lists.</p>`;
        return;
    }

    container.innerHTML = visibleLists.map(todoColumnHtml).join("") +
        `<button class="kanban-col-new" id="todo-list-add-btn" type="button">+ New list</button>`;

    container.querySelectorAll(".kanban-col").forEach(wireTodoColumn);
    wireTodoAddListBtn();
}

function wireTodoAddListBtn() {
    $("todo-list-add-btn").addEventListener("click", async () => {
        const resp = await fetch("/api/todo/lists", { method: "POST" });
        const list = await resp.json();
        todoLists.push(list);
        todoTasksByList[list.id] = [];
        renderTodoBoard();
        const titleInput = document.querySelector(`.kanban-col[data-id="${list.id}"] [data-role="title"]`);
        if (titleInput) titleInput.focus();
    });
}

function wireTodoColumn(col) {
    const listId = parseInt(col.dataset.id, 10);

    col.querySelector("[data-role='color']").addEventListener("click", (e) => {
        e.stopPropagation();
        const current = todoLists.find((l) => l.id === listId)?.color || null;
        openColorPresetPopover(e.currentTarget, current, {
            onChange: (color) => setTodoListColor(listId, color),
            onClear: () => setTodoListColor(listId, null),
        });
    });

    const titleInput = col.querySelector("[data-role='title']");
    titleInput.addEventListener("blur", () => saveTodoListField(listId, { title: titleInput.value.trim() }));
    titleInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.target.blur();
    });

    col.querySelector("[data-role='favorite']").addEventListener("click", () => toggleTodoListFavorite(listId));

    col.querySelector("[data-role='delete']").addEventListener("click", async () => {
        const ok = await confirmDialog("This deletes all its tasks too. This can't be undone.", { title: "Delete this list?" });
        if (!ok) return;
        await fetch(`/api/todo/lists/${listId}`, { method: "DELETE" });
        todoLists = todoLists.filter((l) => l.id !== listId);
        delete todoTasksByList[listId];
        renderTodoBoard();
    });

    col.querySelector("[data-role='add-task']").addEventListener("click", async () => {
        const resp = await fetch(`/api/todo/lists/${listId}/tasks`, { method: "POST" });
        const task = await resp.json();
        if (!todoTasksByList[listId]) todoTasksByList[listId] = [];
        todoTasksByList[listId].unshift(task);
        renderTodoBoard();
        openTodoTaskModal(listId, task.id);
    });

    col.querySelector("[data-role='completed-toggle']").addEventListener("click", () => {
        todoCompletedExpanded[listId] = !todoCompletedExpanded[listId];
        renderTodoBoard();
    });

    wireTodoCards(col.querySelector("[data-role='tasks']"), listId);
    wireTodoCards(col.querySelector("[data-role='completed-list']"), listId);
}

function wireTodoCards(container, listId) {
    if (!container) return;
    container.querySelectorAll(".kcard").forEach((card) => {
        const taskId = parseInt(card.dataset.id, 10);

        card.addEventListener("click", (e) => {
            if (e.target.closest(".todo-task-checkbox")) return;
            openTodoTaskModal(listId, taskId);
        });

        const checkbox = card.querySelector(".todo-task-checkbox");
        checkbox.addEventListener("change", () => saveTodoTaskField(listId, taskId, { completed: checkbox.checked }));
    });
}

// ---------- List fields ----------

async function saveTodoListField(listId, updates) {
    const resp = await fetch(`/api/todo/lists/${listId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = todoLists.findIndex((l) => l.id === updated.id);
    if (idx !== -1) todoLists[idx] = updated;
    renderTodoBoard();
}

function setTodoListColor(listId, color) {
    saveTodoListField(listId, { color });
}

async function toggleTodoListFavorite(id) {
    const list = todoLists.find((l) => l.id === id);
    await saveTodoListField(id, { favorite: !list.favorite });
}

$("todo-favorites-filter").addEventListener("click", () => {
    todoFavoritesOnly = !todoFavoritesOnly;
    $("todo-favorites-filter").classList.toggle("active", todoFavoritesOnly);
    renderTodoBoard();
});

// ---------- Task fields ----------

async function saveTodoTaskField(listId, taskId, updates) {
    const resp = await fetch(`/api/todo/lists/${listId}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const tasks = todoTasksByList[listId] || [];
    const idx = tasks.findIndex((t) => t.id === updated.id);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], ...updated };
    renderTodoBoard();
    if (updates.completed !== undefined) refreshTodoListCounts();
}

async function refreshTodoListCounts() {
    const resp = await fetch("/api/todo/lists");
    const data = await resp.json();
    todoLists = data.lists;
    renderTodoBoard();
}

// ---------- Task detail modal ----------

async function openTodoTaskModal(listId, id) {
    const resp = await fetch(`/api/todo/lists/${listId}/tasks/${id}`);
    const task = await resp.json();
    activeTodoTaskId = id;
    activeTodoTaskListId = listId;

    $("todo-modal-completed").checked = !!task.completed;
    $("todo-modal-title").value = task.title || "";
    $("todo-modal-due-date").value = task.due_date || "";
    $("todo-modal-notes").value = task.notes || "";
    renderTodoSteps(task.steps || []);

    $("todo-modal-backdrop").style.display = "flex";
    $("todo-modal-title").focus();
}

function closeTodoTaskModal() {
    $("todo-modal-backdrop").style.display = "none";
    activeTodoTaskId = null;
    activeTodoTaskListId = null;
}

async function saveActiveTodoTask(updates) {
    if (activeTodoTaskId === null) return;
    await saveTodoTaskField(activeTodoTaskListId, activeTodoTaskId, updates);
}

$("todo-modal-close").addEventListener("click", closeTodoTaskModal);
$("todo-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "todo-modal-backdrop") closeTodoTaskModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("todo-modal-backdrop").style.display !== "none") closeTodoTaskModal();
});

$("todo-modal-title").addEventListener("blur", (e) => saveActiveTodoTask({ title: e.target.value.trim() }));
$("todo-modal-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
});

$("todo-modal-completed").addEventListener("change", (e) => saveActiveTodoTask({ completed: e.target.checked }));

$("todo-modal-due-date").addEventListener("change", (e) => saveActiveTodoTask({ due_date: e.target.value || null }));

$("todo-modal-notes").addEventListener("blur", (e) => saveActiveTodoTask({ notes: e.target.value.trim() || null }));

$("todo-modal-delete-btn").addEventListener("click", async () => {
    if (activeTodoTaskId === null) return;
    const ok = await confirmDialog("This can't be undone.", { title: "Delete this task?" });
    if (!ok) return;
    await fetch(`/api/todo/lists/${activeTodoTaskListId}/tasks/${activeTodoTaskId}`, { method: "DELETE" });
    const tasks = todoTasksByList[activeTodoTaskListId] || [];
    todoTasksByList[activeTodoTaskListId] = tasks.filter((t) => t.id !== activeTodoTaskId);
    closeTodoTaskModal();
    renderTodoBoard();
    refreshTodoListCounts();
});

// ---------- Steps checklist (within the task modal) ----------
// Same markup/pattern as Personal Projects' Checklist, namespaced to
// #todo-modal-steps-list so its rows don't collide with that one.

function todoStepHtml(step) {
    return `
        <div class="checklist-item ${step.checked ? "checked" : ""}" data-id="${step.id}">
            <input type="checkbox" class="checklist-checkbox" ${step.checked ? "checked" : ""}>
            <input type="text" class="cell-input checklist-text" data-field="text" placeholder="Step" value="${escapeAttr(step.text)}">
            <button class="row-delete-btn" data-role="delete" title="Delete step">&times;</button>
        </div>
    `;
}

function wireTodoStepRow(row) {
    const stepId = parseInt(row.dataset.id, 10);

    const checkbox = row.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", () => {
        row.classList.toggle("checked", checkbox.checked);
        saveTodoStep(stepId, { checked: checkbox.checked });
    });

    const textInput = row.querySelector(".checklist-text");
    textInput.addEventListener("blur", () => saveTodoStep(stepId, { text: textInput.value.trim() }));
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") textInput.blur();
    });

    row.querySelector("[data-role='delete']").addEventListener("click", async () => {
        if (activeTodoTaskId === null) return;
        await fetch(`/api/todo/lists/${activeTodoTaskListId}/tasks/${activeTodoTaskId}/steps/${stepId}`, { method: "DELETE" });
        row.remove();
        refreshActiveTodoTaskStepsBadge();
    });

    return textInput;
}

function renderTodoSteps(steps) {
    $("todo-modal-steps-list").innerHTML = steps.map(todoStepHtml).join("");
    document.querySelectorAll("#todo-modal-steps-list .checklist-item").forEach(wireTodoStepRow);
}

async function saveTodoStep(stepId, updates) {
    if (activeTodoTaskId === null) return;
    await fetch(`/api/todo/lists/${activeTodoTaskListId}/tasks/${activeTodoTaskId}/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    refreshActiveTodoTaskStepsBadge();
}

// Keeps the card behind the modal in step with Steps add/remove/check
// edits, without waiting for the modal to close - same live-sync
// pattern used for Project Manager's Logs/SUM stat.
async function refreshActiveTodoTaskStepsBadge() {
    if (activeTodoTaskId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeTodoTaskListId}/tasks/${activeTodoTaskId}`);
    if (!resp.ok) return;
    const task = await resp.json();
    const tasks = todoTasksByList[activeTodoTaskListId] || [];
    const idx = tasks.findIndex((t) => t.id === activeTodoTaskId);
    if (idx !== -1) tasks[idx] = { ...tasks[idx], step_count: task.steps.length, steps_done: task.steps.filter((s) => s.checked).length };
    renderTodoBoard();
}

$("todo-modal-step-add-btn").addEventListener("click", async () => {
    if (activeTodoTaskId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeTodoTaskListId}/tasks/${activeTodoTaskId}/steps`, { method: "POST" });
    const step = await resp.json();
    $("todo-modal-steps-list").insertAdjacentHTML("beforeend", todoStepHtml(step));
    const row = document.querySelector(`#todo-modal-steps-list .checklist-item[data-id="${step.id}"]`);
    wireTodoStepRow(row).focus();
    refreshActiveTodoTaskStepsBadge();
});

// ---------- Init / refresh ----------
// refreshTodoBoard is callable again (not just at load) so nav.js can
// re-fetch on every navigation to this page, same staleness-bug fix
// pattern as Notes/Overview.

async function refreshTodoBoard() {
    const resp = await fetch("/api/todo/lists");
    const data = await resp.json();
    todoLists = data.lists;
    todoTasksByList = {};
    await Promise.all(
        todoLists.map(async (list) => {
            const taskResp = await fetch(`/api/todo/lists/${list.id}/tasks`);
            const taskData = await taskResp.json();
            todoTasksByList[list.id] = taskData.tasks;
        })
    );
    renderTodoBoard();
}

refreshTodoBoard();
