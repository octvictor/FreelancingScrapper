// To Do tool - inspired by Microsoft To Do. Multiple lists, each a set
// of checkbox tasks. A task can be starred Important, carry freeform
// Notes, and hold a Steps checklist (reusing the same .checklist-item
// markup/pattern as Personal Projects' checklist, namespaced separately
// so its buttons don't collide with that one). $()/confirmDialog come
// from nav.js, escapeAttr from gatherer.js.

let todoLists = [];
let activeListId = null;
let activeTodoTasks = [];
let activeTodoTaskId = null;
let todoCompletedExpanded = false;
let todoImportantOnly = false;

// ---------- Lists rail ----------
// Each row is a container with two independent controls: the main
// area (dot + title) selects the list, and a star - always visible,
// grey by default, gold once favorited - toggles favorite status
// directly from the rail without needing to select the list first.

function todoListItemHtml(list) {
    const isActive = list.id === activeListId;
    const dotStyle = list.color
        ? `background:${list.color}; border-color:transparent;`
        : "background:transparent;";
    return `
        <div class="todo-list-item ${isActive ? "active" : ""}" data-id="${list.id}">
            <button class="todo-list-item-main" data-role="select" type="button">
                <span class="todo-list-dot" style="${dotStyle}"></span>
                <span class="todo-list-item-title">${escapeAttr(list.title) || "Untitled list"}</span>
            </button>
            ${list.open_count > 0 ? `<span class="todo-list-count">${list.open_count}</span>` : ""}
            <button class="todo-list-fav-btn todo-star-btn ${list.favorite ? "active" : ""}" data-role="favorite" type="button" title="Mark list favorite">&#9733;</button>
        </div>
    `;
}

function renderTodoLists() {
    const container = $("todo-lists");
    if (todoLists.length === 0) {
        container.innerHTML = `<p class="todo-empty-state">No lists yet.</p>`;
        return;
    }
    container.innerHTML = todoLists.map(todoListItemHtml).join("");
    container.querySelectorAll(".todo-list-item").forEach((row) => {
        const id = parseInt(row.dataset.id, 10);
        row.querySelector("[data-role='select']").addEventListener("click", () => selectTodoList(id));
        row.querySelector("[data-role='favorite']").addEventListener("click", () => toggleTodoListFavorite(id));
    });
}

async function toggleTodoListFavorite(id) {
    const list = todoLists.find((l) => l.id === id);
    const willBeFavorite = !list.favorite;
    const resp = await fetch(`/api/todo/lists/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ favorite: willBeFavorite }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = todoLists.findIndex((l) => l.id === updated.id);
    if (idx !== -1) todoLists[idx] = updated;
    renderTodoLists();
}

async function selectTodoList(id) {
    activeListId = id;
    todoCompletedExpanded = false;
    todoImportantOnly = false;
    $("todo-filter-important").classList.remove("active");
    const list = todoLists.find((l) => l.id === id);
    $("todo-list-title").value = list ? list.title || "" : "";
    updateTodoColorBtn(list && list.color);
    $("todo-tasks-pane").style.display = "";
    renderTodoLists();
    await loadTodoTasks();
}

// ---------- List color ----------
// A small popover (built and torn down on demand, like nav.js's custom
// dropdown panels) offering a preset palette plus a "no color" swatch.

const TODO_LIST_COLORS = ["#7fb2d9", "#86efac", "#fbbf24", "#f0a848", "#e57373", "#c9a3fb"];
let todoColorPopover = null;

function updateTodoColorBtn(color) {
    const btn = $("todo-list-color-btn");
    btn.style.background = color || "transparent";
    btn.classList.toggle("swatch-btn-empty", !color);
    btn.innerHTML = color ? "" : "&#9681;";
}

function closeTodoColorPopover() {
    if (!todoColorPopover) return;
    todoColorPopover.remove();
    todoColorPopover = null;
    document.removeEventListener("click", onTodoColorPopoverOutsideClick);
}

function onTodoColorPopoverOutsideClick(e) {
    if (todoColorPopover && !todoColorPopover.contains(e.target) && e.target.id !== "todo-list-color-btn") {
        closeTodoColorPopover();
    }
}

function openTodoColorPopover() {
    closeTodoColorPopover();
    const btn = $("todo-list-color-btn");
    const rect = btn.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel color-popover open";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + 6 + "px";

    const noneSwatch = document.createElement("button");
    noneSwatch.type = "button";
    noneSwatch.className = "color-swatch none";
    noneSwatch.title = "No color";
    noneSwatch.addEventListener("click", () => setTodoListColor(null));
    panel.appendChild(noneSwatch);

    TODO_LIST_COLORS.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-swatch";
        swatch.style.background = color;
        swatch.title = color;
        swatch.addEventListener("click", () => setTodoListColor(color));
        panel.appendChild(swatch);
    });

    document.body.appendChild(panel);
    todoColorPopover = panel;
    setTimeout(() => document.addEventListener("click", onTodoColorPopoverOutsideClick));
}

async function setTodoListColor(color) {
    if (activeListId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ color }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = todoLists.findIndex((l) => l.id === updated.id);
    if (idx !== -1) todoLists[idx] = updated;
    updateTodoColorBtn(updated.color);
    renderTodoLists();
    closeTodoColorPopover();
}

$("todo-list-color-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (todoColorPopover) closeTodoColorPopover();
    else openTodoColorPopover();
});

async function refreshTodoLists() {
    const resp = await fetch("/api/todo/lists");
    const data = await resp.json();
    todoLists = data.lists;
    renderTodoLists();
}

$("todo-list-add-btn").addEventListener("click", async () => {
    const resp = await fetch("/api/todo/lists", { method: "POST" });
    const list = await resp.json();
    todoLists.push(list);
    await selectTodoList(list.id);
    $("todo-list-title").focus();
});

$("todo-list-title").addEventListener("blur", async (e) => {
    if (activeListId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: e.target.value.trim() }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = todoLists.findIndex((l) => l.id === updated.id);
    if (idx !== -1) todoLists[idx] = updated;
    renderTodoLists();
});
$("todo-list-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
});

$("todo-list-delete-btn").addEventListener("click", async () => {
    if (activeListId === null) return;
    const ok = await confirmDialog("This deletes all its tasks too. This can't be undone.", { title: "Delete this list?" });
    if (!ok) return;
    await fetch(`/api/todo/lists/${activeListId}`, { method: "DELETE" });
    todoLists = todoLists.filter((l) => l.id !== activeListId);
    if (todoLists.length > 0) {
        await selectTodoList(todoLists[0].id);
    } else {
        activeListId = null;
        activeTodoTasks = [];
        $("todo-tasks-pane").style.display = "none";
        renderTodoLists();
    }
});

// ---------- Task list ----------

async function loadTodoTasks() {
    if (activeListId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks`);
    const data = await resp.json();
    activeTodoTasks = data.tasks;
    renderTodoTasks();
}

function todoTaskRowHtml(task) {
    const isImportant = !!task.important;
    const isCompleted = !!task.completed;
    return `
        <div class="todo-task-row ${isCompleted ? "completed" : ""}" data-id="${task.id}">
            <input type="checkbox" class="todo-task-checkbox" ${isCompleted ? "checked" : ""}>
            <span class="todo-task-title">${escapeAttr(task.title) || "Untitled task"}</span>
            <button class="todo-star-btn ${isImportant ? "active" : ""}" type="button" title="Mark important">${isImportant ? "&#9733;" : "&#9734;"}</button>
            <button class="row-delete-btn" data-role="delete" title="Delete task">&times;</button>
        </div>
    `;
}

function wireTodoTaskRows(container) {
    container.querySelectorAll(".todo-task-row").forEach((row) => {
        const taskId = parseInt(row.dataset.id, 10);

        row.addEventListener("click", (e) => {
            if (e.target.closest(".todo-task-checkbox, .todo-star-btn, .row-delete-btn")) return;
            openTodoTaskModal(taskId);
        });

        const checkbox = row.querySelector(".todo-task-checkbox");
        checkbox.addEventListener("change", () => saveTodoTaskField(taskId, { completed: checkbox.checked }));

        row.querySelector(".todo-star-btn").addEventListener("click", () => {
            const task = activeTodoTasks.find((t) => t.id === taskId);
            saveTodoTaskField(taskId, { important: !task.important });
        });

        row.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!(await confirmDialog("This can't be undone.", { title: "Delete this task?" }))) return;
            await fetch(`/api/todo/lists/${activeListId}/tasks/${taskId}`, { method: "DELETE" });
            activeTodoTasks = activeTodoTasks.filter((t) => t.id !== taskId);
            renderTodoTasks();
            refreshTodoLists();
        });
    });
}

function renderTodoTasks() {
    const base = todoImportantOnly ? activeTodoTasks.filter((t) => t.important) : activeTodoTasks;
    const active = base.filter((t) => !t.completed);
    const completed = base.filter((t) => t.completed);

    $("todo-task-list").innerHTML = active.length
        ? active.map(todoTaskRowHtml).join("")
        : `<p class="todo-empty-state">${todoImportantOnly ? "No important tasks." : "No tasks yet."}</p>`;

    // The whole Completed section (Clean included, now that it lives in
    // its header) hides itself when there's nothing completed to show -
    // no separate disabled-state needed on the Clean button.
    $("todo-completed-wrap").style.display = completed.length > 0 ? "" : "none";
    $("todo-completed-label").textContent = `Completed (${completed.length})`;
    $("todo-completed-list").innerHTML = completed.map(todoTaskRowHtml).join("");
    $("todo-completed-list").style.display = todoCompletedExpanded ? "" : "none";
    $("todo-completed-toggle").classList.toggle("expanded", todoCompletedExpanded);

    wireTodoTaskRows($("todo-task-list"));
    wireTodoTaskRows($("todo-completed-list"));
}

$("todo-filter-important").addEventListener("click", () => {
    todoImportantOnly = !todoImportantOnly;
    $("todo-filter-important").classList.toggle("active", todoImportantOnly);
    renderTodoTasks();
});

$("todo-clean-list-btn").addEventListener("click", async () => {
    if (activeListId === null) return;
    const completedCount = activeTodoTasks.filter((t) => t.completed).length;
    if (completedCount === 0) return;
    const ok = await confirmDialog(
        `This deletes ${completedCount} completed task${completedCount === 1 ? "" : "s"}. This can't be undone.`,
        { title: "Clean this list?", confirmText: "Clean" }
    );
    if (!ok) return;
    await fetch(`/api/todo/lists/${activeListId}/tasks/completed`, { method: "DELETE" });
    activeTodoTasks = activeTodoTasks.filter((t) => !t.completed);
    renderTodoTasks();
    refreshTodoLists();
});

async function saveTodoTaskField(taskId, updates) {
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = activeTodoTasks.findIndex((t) => t.id === updated.id);
    if (idx !== -1) activeTodoTasks[idx] = updated;
    renderTodoTasks();
    if (updates.completed !== undefined) refreshTodoLists();
}

$("todo-completed-toggle").addEventListener("click", () => {
    todoCompletedExpanded = !todoCompletedExpanded;
    renderTodoTasks();
});

$("todo-task-add-btn").addEventListener("click", async () => {
    if (activeListId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks`, { method: "POST" });
    const task = await resp.json();
    activeTodoTasks.unshift(task);
    renderTodoTasks();
    refreshTodoLists();
    openTodoTaskModal(task.id);
});

// ---------- Task detail modal ----------

async function openTodoTaskModal(id) {
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks/${id}`);
    const task = await resp.json();
    activeTodoTaskId = id;

    $("todo-modal-completed").checked = !!task.completed;
    $("todo-modal-title").value = task.title || "";
    $("todo-modal-star").classList.toggle("active", !!task.important);
    $("todo-modal-star").innerHTML = task.important ? "&#9733;" : "&#9734;";
    $("todo-modal-notes").value = task.notes || "";
    renderTodoSteps(task.steps || []);

    $("todo-modal-backdrop").style.display = "flex";
    $("todo-modal-title").focus();
}

function closeTodoTaskModal() {
    $("todo-modal-backdrop").style.display = "none";
    activeTodoTaskId = null;
}

async function saveActiveTodoTask(updates) {
    if (activeTodoTaskId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks/${activeTodoTaskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = activeTodoTasks.findIndex((t) => t.id === updated.id);
    if (idx !== -1) activeTodoTasks[idx] = updated;
    renderTodoTasks();
    if (updates.completed !== undefined) refreshTodoLists();
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

$("todo-modal-star").addEventListener("click", () => {
    const willBeImportant = !$("todo-modal-star").classList.contains("active");
    $("todo-modal-star").classList.toggle("active", willBeImportant);
    $("todo-modal-star").innerHTML = willBeImportant ? "&#9733;" : "&#9734;";
    saveActiveTodoTask({ important: willBeImportant });
});

$("todo-modal-notes").addEventListener("blur", (e) => saveActiveTodoTask({ notes: e.target.value.trim() || null }));

$("todo-modal-delete-btn").addEventListener("click", async () => {
    if (activeTodoTaskId === null) return;
    const ok = await confirmDialog("This can't be undone.", { title: "Delete this task?" });
    if (!ok) return;
    await fetch(`/api/todo/lists/${activeListId}/tasks/${activeTodoTaskId}`, { method: "DELETE" });
    activeTodoTasks = activeTodoTasks.filter((t) => t.id !== activeTodoTaskId);
    closeTodoTaskModal();
    renderTodoTasks();
    refreshTodoLists();
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
        await fetch(`/api/todo/lists/${activeListId}/tasks/${activeTodoTaskId}/steps/${stepId}`, { method: "DELETE" });
        row.remove();
    });

    return textInput;
}

function renderTodoSteps(steps) {
    $("todo-modal-steps-list").innerHTML = steps.map(todoStepHtml).join("");
    document.querySelectorAll("#todo-modal-steps-list .checklist-item").forEach(wireTodoStepRow);
}

async function saveTodoStep(stepId, updates) {
    if (activeTodoTaskId === null) return;
    await fetch(`/api/todo/lists/${activeListId}/tasks/${activeTodoTaskId}/steps/${stepId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
}

$("todo-modal-step-add-btn").addEventListener("click", async () => {
    if (activeTodoTaskId === null) return;
    const resp = await fetch(`/api/todo/lists/${activeListId}/tasks/${activeTodoTaskId}/steps`, { method: "POST" });
    const step = await resp.json();
    $("todo-modal-steps-list").insertAdjacentHTML("beforeend", todoStepHtml(step));
    const row = document.querySelector(`#todo-modal-steps-list .checklist-item[data-id="${step.id}"]`);
    wireTodoStepRow(row).focus();
});

(async function initTodo() {
    const resp = await fetch("/api/todo/lists");
    const data = await resp.json();
    todoLists = data.lists;
    if (todoLists.length > 0) {
        await selectTodoList(todoLists[0].id);
    } else {
        $("todo-tasks-pane").style.display = "none";
        renderTodoLists();
    }
})();
