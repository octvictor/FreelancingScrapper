// Tracker tool - a project table backed by /api/tracker. Rows show
// title/description/status/paid, with Status and Paid directly
// editable inline (same pattern as Gatherer); clicking anywhere else on
// a row opens a modal with the full detail form (status/deadline/day
// rate/Docs/Log). Fields autosave on blur/change. $() comes from nav.js.

let trackerProjects = [];
let activeProjectId = null;
let activeCurrency = "USD";
let activeView = "Active";
let activeDayRate = null;

const CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", BRL: "R$" };

function currencySymbol() {
    return CURRENCY_SYMBOLS[activeCurrency] || "$";
}

function updateCurrencyDisplay() {
    const symbol = currencySymbol();
    $("day-rate-prefix").textContent = symbol;
    document.querySelectorAll(".cost-prefix").forEach((el) => {
        el.textContent = symbol;
    });
    renderLogSum();
}

function renderLogSum() {
    let total = 0;
    document.querySelectorAll("#task-table-body input[data-field='cost']").forEach((input) => {
        const value = parseFloat(input.value);
        if (!isNaN(value)) total += value;
    });
    $("log-sum-value").textContent = currencySymbol() + total.toFixed(2);
}

function trackerStatusPillClass(status) {
    return status === "Completed" || status === "Done" ? "status-completed" : "status-active";
}

function durationPillClass(duration) {
    if (duration === "Half") return "duration-half";
    if (duration === "Custom") return "duration-custom";
    return "duration-full";
}

// Full/Half auto-fill Cost from the project's day rate; Custom leaves it
// alone (null means "don't touch the existing cost").
function computeAutoCost(duration) {
    if (activeDayRate === null || activeDayRate === undefined || isNaN(activeDayRate)) return null;
    if (duration === "Full") return Math.round(activeDayRate * 100) / 100;
    if (duration === "Half") return Math.round((activeDayRate / 2) * 100) / 100;
    return null;
}

function paidPillClass(paid) {
    return paid === "Paid" ? "paid-paid" : "paid-unpaid";
}

function projectRowHtml(project) {
    const isCompleted = project.status === "Completed";
    const isPaid = project.paid === "Paid";
    return `
        <tr data-id="${project.id}">
            <td class="row-drag-handle-cell"><span class="row-drag-handle" title="Drag to reorder">&#8942;</span></td>
            <td class="project-row-title">${escapeAttr(project.title) || "Untitled project"}</td>
            <td class="project-row-desc">${escapeAttr(project.description || "")}</td>
            <td>
                <select class="cell-select color-pill ${trackerStatusPillClass(project.status)}" data-field="status">
                    <option value="Active" ${!isCompleted ? "selected" : ""}>&#9679; Active</option>
                    <option value="Completed" ${isCompleted ? "selected" : ""}>&#9679; Completed</option>
                </select>
            </td>
            <td>
                <select class="cell-select color-pill ${paidPillClass(project.paid)}" data-field="paid">
                    <option value="Unpaid" ${!isPaid ? "selected" : ""}>&#9679; Unpaid</option>
                    <option value="Paid" ${isPaid ? "selected" : ""}>&#9679; Paid</option>
                </select>
            </td>
        </tr>
    `;
}

function renderProjectTable() {
    cleanupCustomSelectsIn($("project-table-body"));
    const visible = trackerProjects.filter((p) => p.status === activeView);
    $("project-table-body").innerHTML = visible.length
        ? visible.map(projectRowHtml).join("")
        : `<tr><td colspan="5" class="muted" style="padding: 14px 10px;">No projects yet.</td></tr>`;

    document.querySelectorAll("#project-table-body tr[data-id]").forEach((tr) => {
        const projectId = parseInt(tr.dataset.id, 10);

        tr.addEventListener("click", (e) => {
            if (e.target.closest(".custom-select-wrap, .row-drag-handle")) return;
            openProjectModal(projectId);
        });

        const statusSelect = tr.querySelector(".cell-select[data-field='status']");
        statusSelect.addEventListener("change", (e) => {
            statusSelect.classList.remove("status-active", "status-completed");
            statusSelect.classList.add(trackerStatusPillClass(e.target.value));
            saveProjectField(projectId, { status: e.target.value });
        });
        enhanceSelect(statusSelect);

        const paidSelect = tr.querySelector(".cell-select[data-field='paid']");
        paidSelect.addEventListener("change", (e) => {
            paidSelect.classList.remove("paid-paid", "paid-unpaid");
            paidSelect.classList.add(paidPillClass(e.target.value));
            saveProjectField(projectId, { paid: e.target.value });
        });
        enhanceSelect(paidSelect);

        wireRowDrag(tr);
    });
}

async function saveProjectField(projectId, updates) {
    const resp = await fetch(`/api/tracker/projects/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = trackerProjects.findIndex((p) => p.id === updated.id);
    if (idx !== -1) trackerProjects[idx] = updated;
    // A status change can move the row out of the currently visible
    // tab - re-render so it disappears/appears immediately rather than
    // waiting for the next unrelated refresh.
    if (updates.status !== undefined) renderProjectTable();
}

// ---------- Drag-to-reorder ----------
// Native HTML5 drag-and-drop, but only armed from the grip handle (not
// the whole row) - mousedown on the handle flips the row's `draggable`
// on, dragend flips it back off.

let draggedRow = null;

function wireRowDrag(tr) {
    const handle = tr.querySelector(".row-drag-handle");
    handle.addEventListener("mousedown", () => {
        tr.draggable = true;
    });

    tr.addEventListener("dragstart", (e) => {
        draggedRow = tr;
        tr.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
    });

    tr.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!draggedRow || draggedRow === tr) return;
        const rect = tr.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
            tr.parentNode.insertBefore(draggedRow, tr);
        } else {
            tr.parentNode.insertBefore(draggedRow, tr.nextSibling);
        }
    });

    tr.addEventListener("dragend", () => {
        tr.draggable = false;
        tr.classList.remove("dragging");
        if (draggedRow === tr) {
            draggedRow = null;
            persistRowOrder();
        }
    });
}

async function persistRowOrder() {
    const ids = Array.from(document.querySelectorAll("#project-table-body tr[data-id]")).map((tr) => parseInt(tr.dataset.id, 10));
    await fetch("/api/tracker/projects/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    const resp = await fetch("/api/tracker/projects");
    const data = await resp.json();
    trackerProjects = data.projects;
}

document.querySelectorAll(".view-toggle-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        activeView = btn.dataset.view;
        document.querySelectorAll(".view-toggle-btn").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        renderProjectTable();
    });
});

async function createProject() {
    const resp = await fetch("/api/tracker/projects", { method: "POST" });
    const project = await resp.json();
    trackerProjects.unshift(project);

    // A new project defaults to Active - if the Completed tab is showing,
    // switch to Active so the project you just created is actually
    // visible instead of silently landing on a hidden tab.
    if (activeView !== "Active") {
        activeView = "Active";
        document.querySelectorAll(".view-toggle-btn").forEach((b) => b.classList.toggle("active", b.dataset.view === "Active"));
    }

    renderProjectTable();
    openProjectModal(project.id);
}

$("new-project-btn").addEventListener("click", createProject);

// ---------- Modal ----------

function docRowHtml(doc, projectId) {
    return `
        <div class="doc-item" data-doc-id="${doc.id}">
            <a href="/api/tracker/projects/${projectId}/docs/${doc.id}" target="_blank" rel="noopener" class="doc-name">${escapeAttr(doc.filename)}</a>
            <button class="doc-delete-btn" data-doc-id="${doc.id}" type="button" title="Delete doc">&times;</button>
        </div>
    `;
}

function renderDocsList(docs, projectId) {
    $("docs-list").innerHTML = docs.map((d) => docRowHtml(d, projectId)).join("");

    document.querySelectorAll(".doc-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("Delete this doc?")) return;
            await fetch(`/api/tracker/projects/${projectId}/docs/${btn.dataset.docId}`, { method: "DELETE" });
            const project = await (await fetch(`/api/tracker/projects/${projectId}`)).json();
            renderDocsList(project.docs, projectId);
        });
    });
}

// ---------- Task track table ----------

function taskRowHtml(task) {
    const isDone = task.status === "Done";
    return `
        <tr data-id="${task.id}">
            <td><input type="text" class="cell-input" data-field="task" value="${escapeAttr(task.task)}" placeholder="Task"></td>
            <td>
                <select class="cell-select color-pill ${trackerStatusPillClass(task.status)}" data-field="status">
                    <option value="Active" ${!isDone ? "selected" : ""}>&#9679; Active</option>
                    <option value="Done" ${isDone ? "selected" : ""}>&#9679; Done</option>
                </select>
            </td>
            <td>
                <select class="cell-select color-pill ${durationPillClass(task.duration)}" data-field="duration">
                    <option value="Full" ${task.duration === "Full" ? "selected" : ""}>&#9679; Full</option>
                    <option value="Half" ${task.duration === "Half" ? "selected" : ""}>&#9679; Half</option>
                    <option value="Custom" ${task.duration === "Custom" ? "selected" : ""}>&#9679; Custom</option>
                </select>
            </td>
            <td><input type="text" class="cell-input" data-field="observation" placeholder="Note" value="${escapeAttr(task.observation || "")}" ${task.duration !== "Custom" ? "disabled" : ""}></td>
            <td>
                <div class="cost-cell">
                    <span class="currency-prefix cost-prefix">${currencySymbol()}</span>
                    <input type="number" class="cell-input" data-field="cost" min="0" step="0.01" placeholder="0.00" value="${task.cost ?? ""}">
                </div>
            </td>
            <td><input type="date" class="cell-input date-input" data-field="task_date" value="${task.task_date || ""}"></td>
            <td><button class="row-delete-btn" data-role="delete" title="Delete task">&times;</button></td>
        </tr>
    `;
}

function renderTaskTable(tasks, projectId) {
    cleanupCustomSelectsIn($("task-table-body"));
    $("task-table-body").innerHTML = tasks.length
        ? tasks.map(taskRowHtml).join("")
        : `<tr><td colspan="7" class="muted" style="padding: 14px 10px;">No tasks logged yet.</td></tr>`;

    document.querySelectorAll("#task-table-body tr[data-id]").forEach((tr) => {
        const taskId = parseInt(tr.dataset.id, 10);

        const taskInput = tr.querySelector(".cell-input[data-field='task']");
        taskInput.addEventListener("blur", () => saveTaskField(projectId, taskId, { task: taskInput.value.trim() }));
        taskInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") taskInput.blur();
        });

        const statusSelect = tr.querySelector(".cell-select[data-field='status']");
        statusSelect.addEventListener("change", (e) => {
            statusSelect.classList.remove("status-active", "status-completed");
            statusSelect.classList.add(trackerStatusPillClass(e.target.value));
            saveTaskField(projectId, taskId, { status: e.target.value });
        });
        enhanceSelect(statusSelect);

        const observationInput = tr.querySelector(".cell-input[data-field='observation']");
        observationInput.addEventListener("blur", () => saveTaskField(projectId, taskId, { observation: observationInput.value.trim() || null }));
        observationInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") observationInput.blur();
        });

        const costInput = tr.querySelector(".cell-input[data-field='cost']");
        costInput.addEventListener("input", renderLogSum);
        costInput.addEventListener("blur", () => {
            const value = costInput.value === "" ? null : parseFloat(costInput.value);
            saveTaskField(projectId, taskId, { cost: value });
        });

        const durationSelect = tr.querySelector(".cell-select[data-field='duration']");
        durationSelect.addEventListener("change", (e) => {
            durationSelect.classList.remove("duration-full", "duration-half", "duration-custom");
            durationSelect.classList.add(durationPillClass(e.target.value));

            const isCustom = e.target.value === "Custom";
            observationInput.disabled = !isCustom;

            const updates = { duration: e.target.value };
            if (isCustom) {
                costInput.value = 0;
                updates.cost = 0;
                renderLogSum();
            } else {
                const autoCost = computeAutoCost(e.target.value);
                if (autoCost !== null) {
                    costInput.value = autoCost;
                    updates.cost = autoCost;
                    renderLogSum();
                }
            }
            saveTaskField(projectId, taskId, updates);
        });
        enhanceSelect(durationSelect);

        const dateInput = tr.querySelector(".date-input");
        dateInput.addEventListener("change", () => saveTaskField(projectId, taskId, { task_date: dateInput.value || null }));

        tr.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!confirm("Delete this task?")) return;
            await fetch(`/api/tracker/projects/${projectId}/tasks/${taskId}`, { method: "DELETE" });
            const project = await (await fetch(`/api/tracker/projects/${projectId}`)).json();
            renderTaskTable(project.tasks, projectId);
        });
    });

    renderLogSum();
}

async function saveTaskField(projectId, taskId, updates) {
    await fetch(`/api/tracker/projects/${projectId}/tasks/${taskId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
}

$("task-add-btn").addEventListener("click", async () => {
    if (activeProjectId === null) return;
    const resp = await fetch(`/api/tracker/projects/${activeProjectId}/tasks`, { method: "POST" });
    const task = await resp.json();

    // New rows default to Duration "Full" without an explicit change
    // event ever firing - apply the same auto-cost rule up front so it
    // doesn't take a manual duration toggle to see it.
    const autoCost = computeAutoCost(task.duration);
    if (autoCost !== null) {
        await saveTaskField(activeProjectId, task.id, { cost: autoCost });
    }

    const project = await (await fetch(`/api/tracker/projects/${activeProjectId}`)).json();
    renderTaskTable(project.tasks, activeProjectId);
    const newTaskInput = document.querySelector(`#task-table-body tr[data-id="${task.id}"] .cell-input[data-field="task"]`);
    if (newTaskInput) newTaskInput.focus();
});

async function openProjectModal(id) {
    const project = await (await fetch(`/api/tracker/projects/${id}`)).json();
    activeProjectId = id;

    $("modal-title").value = project.title || "";
    $("modal-description").value = project.description || "";
    $("modal-status").value = project.status;
    $("modal-status").classList.remove("status-active", "status-completed");
    $("modal-status").classList.add(trackerStatusPillClass(project.status));
    refreshCustomSelect($("modal-status"));
    $("modal-client").value = project.client || "";
    $("modal-deadline").value = project.deadline || "";
    $("modal-day-rate").value = project.day_rate ?? "";
    activeDayRate = project.day_rate ?? null;
    activeCurrency = project.currency || "USD";
    $("modal-currency").value = activeCurrency;
    refreshCustomSelect($("modal-currency"));
    $("day-rate-prefix").textContent = currencySymbol();
    renderDocsList(project.docs, id);
    renderTaskTable(project.tasks, id);
    resetSidePanel(project);

    $("project-modal-backdrop").style.display = "flex";
    $("modal-title").focus();
}

function closeProjectModal() {
    $("project-modal-backdrop").style.display = "none";
    activeProjectId = null;
}

async function saveActiveProject(updates) {
    if (activeProjectId === null) return;
    const resp = await fetch(`/api/tracker/projects/${activeProjectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = trackerProjects.findIndex((p) => p.id === updated.id);
    if (idx !== -1) trackerProjects[idx] = updated;
    renderProjectTable();
}

// ---------- Side panel: Assets/Notes/Briefing ----------
// Three freeform text fields on the project, one per tab. A single
// textarea is reused across tabs (only one is ever visible at once) -
// its value is swapped out from a local cache on tab switch, and saved
// back to that tab's field on blur.

const SIDE_TAB_FIELD = { assets: "assets_text", notes: "notes_text", briefing: "briefing_text" };
let activeSideTab = "assets";
let sideTabValues = { assets_text: "", notes_text: "", briefing_text: "" };

function loadSideTab(tab) {
    activeSideTab = tab;
    document.querySelectorAll(".modal-side-tab").forEach((b) => b.classList.toggle("active", b.dataset.sideTab === tab));
    $("modal-side-content").value = sideTabValues[SIDE_TAB_FIELD[tab]] || "";
}

function resetSidePanel(project) {
    sideTabValues = {
        assets_text: project.assets_text || "",
        notes_text: project.notes_text || "",
        briefing_text: project.briefing_text || "",
    };
    loadSideTab("assets");
}

document.querySelectorAll(".modal-side-tab").forEach((btn) => {
    btn.addEventListener("click", () => loadSideTab(btn.dataset.sideTab));
});

$("modal-side-content").addEventListener("blur", (e) => {
    const field = SIDE_TAB_FIELD[activeSideTab];
    sideTabValues[field] = e.target.value;
    saveActiveProject({ [field]: e.target.value.trim() || null });
});

$("project-modal-close").addEventListener("click", closeProjectModal);
$("project-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "project-modal-backdrop") closeProjectModal();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && $("project-modal-backdrop").style.display !== "none") closeProjectModal();
});

$("modal-title").addEventListener("blur", (e) => saveActiveProject({ title: e.target.value.trim() }));
$("modal-title").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
});

$("modal-description").addEventListener("blur", (e) => saveActiveProject({ description: e.target.value.trim() || null }));

$("modal-status").addEventListener("change", (e) => {
    e.target.classList.remove("status-active", "status-completed");
    e.target.classList.add(trackerStatusPillClass(e.target.value));
    saveActiveProject({ status: e.target.value });
});
enhanceSelect($("modal-status"));
$("modal-client").addEventListener("blur", (e) => saveActiveProject({ client: e.target.value.trim() || null }));
$("modal-client").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
});
$("modal-deadline").addEventListener("change", (e) => saveActiveProject({ deadline: e.target.value || null }));
$("modal-day-rate").addEventListener("blur", (e) => {
    const value = e.target.value === "" ? null : parseFloat(e.target.value);
    activeDayRate = value;
    saveActiveProject({ day_rate: value });
});

$("modal-currency").addEventListener("change", (e) => {
    activeCurrency = e.target.value;
    updateCurrencyDisplay();
    saveActiveProject({ currency: activeCurrency });
});
enhanceSelect($("modal-currency"));

$("doc-upload-btn").addEventListener("click", () => $("doc-file-input").click());
$("doc-file-input").addEventListener("change", async (e) => {
    const file = e.target.files[0];
    if (!file || activeProjectId === null) return;
    const formData = new FormData();
    formData.append("file", file);
    await fetch(`/api/tracker/projects/${activeProjectId}/docs`, { method: "POST", body: formData });
    const project = await (await fetch(`/api/tracker/projects/${activeProjectId}`)).json();
    renderDocsList(project.docs, activeProjectId);
    e.target.value = "";
});

$("delete-project-btn").addEventListener("click", async () => {
    if (activeProjectId === null || !confirm("Delete this project? This also deletes its attached docs and tasks.")) return;
    await fetch(`/api/tracker/projects/${activeProjectId}`, { method: "DELETE" });
    trackerProjects = trackerProjects.filter((p) => p.id !== activeProjectId);
    closeProjectModal();
    renderProjectTable();
});

(async function initTracker() {
    const resp = await fetch("/api/tracker/projects");
    const data = await resp.json();
    trackerProjects = data.projects;
    renderProjectTable();
})();
