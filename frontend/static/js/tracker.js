// Tracker tool - project cards backed by /api/tracker. Cards show
// title + status; clicking one opens a modal with the full detail form
// (status/deadline/day rate/Docs). Fields autosave on blur/change, same
// Notion-style pattern as Gatherer. $() comes from nav.js.

let trackerProjects = [];
let activeProjectId = null;

function statusPillClass(status) {
    return status === "Completed" ? "status-completed" : "status-active";
}

function formatDeadline(deadline) {
    if (!deadline) return "";
    const [y, m, d] = deadline.split("-").map(Number);
    if (!y || !m || !d) return "";
    return new Date(y, m - 1, d).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function projectCardHtml(project) {
    const deadlineHtml = formatDeadline(project.deadline);
    return `
        <button class="project-card" data-id="${project.id}" type="button">
            <div class="project-card-title">${escapeAttr(project.title) || "Untitled project"}</div>
            <span class="color-pill ${statusPillClass(project.status)}">&#9679; ${escapeAttr(project.status)}</span>
            ${deadlineHtml ? `<div class="project-card-date">${deadlineHtml}</div>` : ""}
        </button>
    `;
}

function renderProjectGrid() {
    const cards = trackerProjects.map(projectCardHtml).join("");
    $("project-grid").innerHTML = `
        ${cards}
        <button class="project-card project-card-new" id="new-project-btn" type="button">
            <span class="project-card-new-plus">+</span>
            <span>New project</span>
        </button>
    `;

    document.querySelectorAll(".project-card[data-id]").forEach((card) => {
        card.addEventListener("click", () => openProjectModal(parseInt(card.dataset.id, 10)));
    });
    $("new-project-btn").addEventListener("click", createProject);
}

async function createProject() {
    const resp = await fetch("/api/tracker/projects", { method: "POST" });
    const project = await resp.json();
    trackerProjects.unshift(project);
    renderProjectGrid();
    openProjectModal(project.id);
}

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
    $("docs-list").innerHTML = docs.length
        ? docs.map((d) => docRowHtml(d, projectId)).join("")
        : `<div class="muted docs-empty">No docs attached yet.</div>`;

    document.querySelectorAll(".doc-delete-btn").forEach((btn) => {
        btn.addEventListener("click", async () => {
            if (!confirm("Delete this doc?")) return;
            await fetch(`/api/tracker/projects/${projectId}/docs/${btn.dataset.docId}`, { method: "DELETE" });
            const project = await (await fetch(`/api/tracker/projects/${projectId}`)).json();
            renderDocsList(project.docs, projectId);
        });
    });
}

async function openProjectModal(id) {
    const project = await (await fetch(`/api/tracker/projects/${id}`)).json();
    activeProjectId = id;

    $("modal-title").value = project.title || "";
    $("modal-status").value = project.status;
    $("modal-status").classList.remove("status-active", "status-completed");
    $("modal-status").classList.add(statusPillClass(project.status));
    $("modal-deadline").value = project.deadline || "";
    $("modal-day-rate").value = project.day_rate ?? "";
    renderDocsList(project.docs, id);

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
    renderProjectGrid();
}

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

$("modal-status").addEventListener("change", (e) => {
    e.target.classList.remove("status-active", "status-completed");
    e.target.classList.add(statusPillClass(e.target.value));
    saveActiveProject({ status: e.target.value });
});
$("modal-deadline").addEventListener("change", (e) => saveActiveProject({ deadline: e.target.value || null }));
$("modal-day-rate").addEventListener("blur", (e) => {
    const value = e.target.value === "" ? null : parseFloat(e.target.value);
    saveActiveProject({ day_rate: value });
});

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
    if (activeProjectId === null || !confirm("Delete this project? This also deletes its attached docs.")) return;
    await fetch(`/api/tracker/projects/${activeProjectId}`, { method: "DELETE" });
    trackerProjects = trackerProjects.filter((p) => p.id !== activeProjectId);
    closeProjectModal();
    renderProjectGrid();
});

(async function initTracker() {
    const resp = await fetch("/api/tracker/projects");
    const data = await resp.json();
    trackerProjects = data.projects;
    renderProjectGrid();
})();
