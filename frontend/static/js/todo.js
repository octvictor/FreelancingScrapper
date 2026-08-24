// To Do tool - a Kanban board, one column per list, laid out side by
// side so every list is visible at once instead of clicked through one
// at a time (approved over the previous rail-plus-single-list-pane
// layout). Each task is a compact card carrying its list's color as a
// stripe, a Steps sub-checklist progress badge, and - if set - a due
// date shown via the shared dueDateMeta() urgency convention (nav.js).
// A task can carry freeform Notes and a Steps checklist (reusing the
// same .checklist-item markup/pattern as Personal Projects' checklist,
// namespaced separately so its buttons don't collide with that one).
// $()/confirmDialog/dueDateMeta come from nav.js, escapeAttr from
// gatherer.js, openColorPresetPopover from nav.js.

let todoLists = [];
let todoTasksByList = {};
let activeTodoTaskId = null;
let activeTodoTaskListId = null;

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

    return `
        <div class="kanban-col" data-id="${list.id}">
            <div class="kanban-col-head">
                <button class="color-dot-btn" data-role="color" type="button" title="List color" style="--dot-color:${list.color || "var(--border)"};">
                    <span class="color-dot"></span>
                </button>
                <input type="text" class="kanban-col-title-input" data-role="title" value="${escapeAttr(list.title)}" placeholder="List name">
                <span class="kanban-col-count">${tasks.length}</span>
                <span class="row-drag-handle kanban-col-grip" title="Drag to reorder">&#8942;</span>
            </div>
            <div class="kanban-col-tasks" data-role="tasks">
                ${tasks.length ? tasks.map((t) => todoCardHtml(t, list.color)).join("") : `<p class="todo-empty-state">No tasks yet.</p>`}
            </div>
            <button class="kanban-add-task" data-role="add-task" type="button">+ Add task</button>
            <div class="kanban-col-foot">
                <button class="btn-danger-text kanban-col-delete" data-role="delete" type="button">Delete</button>
            </div>
        </div>
    `;
}

function renderTodoBoard() {
    const container = $("todo-board");

    if (todoLists.length === 0) {
        container.innerHTML = `<button class="kanban-col-new" id="todo-list-add-btn" type="button">+ New list</button>`;
        wireTodoAddListBtn();
        return;
    }

    container.innerHTML = todoLists.map(todoColumnHtml).join("") +
        `<button class="kanban-col-new" id="todo-list-add-btn" type="button">+ New list</button>`;

    container.querySelectorAll(".kanban-col").forEach((col) => {
        wireTodoColumn(col);
        wireTodoColumnDrag(col);
        col.querySelectorAll(".kcard").forEach(wireTodoCardDrag);
    });
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

    wireTodoCards(col.querySelector("[data-role='tasks']"), listId);
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
    closeModalAnimated($("todo-modal-backdrop"));
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
            <textarea class="cell-input checklist-text" data-field="text" placeholder="Step" rows="1">${escapeAttr(step.text)}</textarea>
            <button class="row-delete-btn" data-role="delete" title="Delete step">${ICON_TRASH_SVG}</button>
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
    autoGrowChecklistText(textInput);
    textInput.addEventListener("input", () => autoGrowChecklistText(textInput));
    textInput.addEventListener("blur", () => saveTodoStep(stepId, { text: textInput.value.trim() }));
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            textInput.blur();
        }
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
// pattern used for Projects's Logs/SUM stat.
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


function applyTodoBoardFit() {
    fitBoardHeight($("todo-board"));
}

onRowFitResize(() => {
    const page = $("page-todo");
    if (page && page.style.display !== "none") applyTodoBoardFit();
});

// ---------- Reordering the board ----------
// Two drags on one surface: cards inside and between columns, and the
// columns themselves. Both go through flipInsert (nav.js), so everything
// that is not the thing in your hand slides to its new slot.
//
// Cards drag by their whole body, which is the Kanban convention - a grip
// handle like the Projects table uses would be wrong here, because a card
// IS the handle. The checkbox is the one exception: starting a drag from
// it would mean you could never tick anything near the edge of the card.
//
// Columns drag by their header only, since the header is the sole part
// with no editable field or button spanning it - and dragging a column by
// its task area would fight the cards inside it for the same gesture.

function todoColumnOf(el) {
    return el.closest(".kanban-col");
}

const todoColumns = () => Array.from(document.querySelectorAll("#todo-board .kanban-col"));
const todoTaskZones = () => Array.from(document.querySelectorAll("#todo-board [data-role='tasks']"));

// Cards drag by their whole body, which is the Kanban convention - a card
// IS its own handle. Anything interactive inside it is excluded, or you
// could never tick a checkbox near the card's edge.
function wireTodoCardDrag(card) {
    card.addEventListener("pointerdown", (e) => {
        if (e.target.closest("button, input, textarea, a")) return;
        const from = todoColumnOf(card);
        startPointerDrag(e, card, {
            zones: todoTaskZones,
            itemsIn: (zone) => Array.from(zone.querySelectorAll(".kcard")),
            onDrop: (source) => persistTodoCardMove(from, todoColumnOf(source)),
        });
    });
}

// Columns drag by a grip in their header, the same affordance Notes cards
// and Projects rows use. The header itself was tried first and does not
// work: the title input is flex:1 and fills nearly all of it, so "header
// minus its controls" left a few pixels of target. Horizontal axis,
// because columns sit side by side.
function wireTodoColumnDrag(col) {
    col.querySelector(".kanban-col-grip").addEventListener("pointerdown", (e) => {
        startPointerDrag(e, col, {
            zones: () => [col.parentNode],
            itemsIn: (zone) => Array.from(zone.querySelectorAll(".kanban-col")),
            axis: "x",
            onDrop: () => persistTodoColumnOrder(),
        });
    });
}

function todoCardIdsIn(col) {
    return Array.from(col.querySelectorAll(".kcard")).map((c) => parseInt(c.dataset.id, 10));
}

// A cross-column move rewrites both columns: the destination call carries
// the list_id change (see db.reorder_todo_tasks), and the source needs its
// remaining cards renumbered so a later insert does not collide with a
// position the moved card left behind.
async function persistTodoCardMove(fromCol, toCol) {
    if (!toCol) return;
    const targets = fromCol && fromCol !== toCol ? [toCol, fromCol] : [toCol];
    await Promise.all(targets.map((col) =>
        fetch(`/api/todo/lists/${col.dataset.id}/tasks/reorder`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ ids: todoCardIdsIn(col) }),
        })
    ));
    // Re-render rather than patch: a card that changed column also changes
    // its stripe color, and both columns' counts and empty states move.
    await refreshTodoBoard();
}

async function persistTodoColumnOrder() {
    const ids = Array.from(document.querySelectorAll("#todo-board .kanban-col"))
        .map((c) => parseInt(c.dataset.id, 10));
    await fetch("/api/todo/lists/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    todoLists = ids.map((id) => todoLists.find((l) => l.id === id)).filter(Boolean);
}
