// Command Center - the app's home page, reached through the permanent
// sidebar like any other page: greeting, a quick-capture line straight
// into Notes, Today's Focus + Due Soon, Active Projects + Recent Notes,
// and a small visual strip of the newest notes ("Full Board" - approved
// over two leaner alternatives mocked up alongside it). $()/escapeAttr/
// navigateTo come from nav.js/gatherer.js; openProjectModal,
// openTodoTaskModal, and openNoteModal (defined in tracker.js/todo.js/
// notes.js) are reused as-is to open the right detail view after a click,
// same as a search jump - nothing about those tools is touched here.
// colorNeedsDarkText (nav.js) picks readable text for a note's own color,
// same logic Notes' own cards already use.

const OVERVIEW_TYPE_META = {
    project: { icon: "&#9636;", label: "Project", page: "tracker" },
    studio: { icon: "&#9638;", label: "Studio Logs", page: "gatherer" },
    task: { icon: "&#9745;", label: "To Do", page: "todo" },
    note: { icon: "&#9998;", label: "Note", page: "notes" },
};

// ---------- Command Center content ----------

function ccGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function ccRelativeTime(isoStr) {
    const then = new Date(isoStr);
    const diffMin = Math.round((Date.now() - then.getTime()) / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHr = Math.round(diffMin / 60);
    if (diffHr < 24) return `${diffHr}h ago`;
    const diffDay = Math.round(diffHr / 24);
    if (diffDay === 1) return "Yesterday";
    if (diffDay < 7) return `${diffDay}d ago`;
    return then.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// Notes have no title - a short snippet of the actual content stands
// in for one wherever a note needs a one-line label (Recent Notes here;
// ccNoteChipHtml below does its own version for the bigger strip).
function ccNoteLabel(n) {
    const firstLine = (n.body || "").trim().split("\n")[0].trim();
    if (firstLine) return escapeAttr(firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine);
    if (n.first_item_text) return escapeAttr(n.first_item_text);
    return "Empty note";
}

function ccRowHtml(role, id, titleText, subLabel, dotClass) {
    const dot = dotClass ? `<span class="cc-dot ${dotClass}"></span>` : "";
    return `
        <div class="cc-row" data-role="${role}" data-id="${id}">
            ${dot}
            <span class="cc-row-title">${titleText}</span>
            <span class="cc-row-sub">${subLabel}</span>
        </div>
    `;
}

function ccFocusRowHtml(task) {
    const listColor = task.list_color || "var(--border)";
    return `
        <div class="focus-row" data-role="cc-focus" data-task-id="${task.id}" data-list-id="${task.list_id}">
            <span class="focus-check" data-role="cc-focus-check"></span>
            <span class="focus-title">${escapeAttr(task.title) || "Untitled task"}</span>
            <span class="focus-list-dot" style="background:${listColor};"></span>
            <span class="focus-list-name">${escapeAttr(task.list_title) || "Untitled list"}</span>
        </div>
    `;
}

function ccProjectMiniHtml(p) {
    const client = p.client ? `<span class="proj-mini-client">${escapeAttr(p.client)}</span>` : "";
    return `
        <div class="proj-mini" data-role="cc-project" data-id="${p.id}">
            <span class="proj-mini-title">${escapeAttr(p.title) || "Untitled project"}</span>
            ${client}
            <span class="proj-mini-pill">Active</span>
        </div>
    `;
}

// Notes have no title - the chip's headline is a snippet of the note's
// own content instead: a text note's first line, or a list note's
// item count (with its first item as a small preview underneath).
function ccNoteChipHtml(n) {
    // A colorless note takes the light tone, not --panel-alt: the strip now
    // sits on a --panel-alt panel, and a chip in the panel's own color is
    // an invisible chip.
    const bg = n.color || "var(--panel)";
    const lightTextClass = n.color && !colorNeedsDarkText(n.color) ? "chip-light-text" : "";
    let headline;
    let preview = "";
    if (n.type === "list") {
        headline = n.item_count ? `${n.item_count} item${n.item_count === 1 ? "" : "s"}` : "Empty list";
        if (n.first_item_text) preview = escapeAttr(n.first_item_text);
    } else {
        const firstLine = (n.body || "").trim().split("\n")[0].trim();
        headline = firstLine
            ? escapeAttr(firstLine.length > 60 ? firstLine.slice(0, 60) + "…" : firstLine)
            : "Empty note";
    }
    return `
        <div class="note-chip ${lightTextClass}" style="background:${bg};" data-role="cc-note" data-id="${n.id}">
            <p class="note-chip-title">${headline}</p>
            <p class="note-chip-body">${preview}</p>
        </div>
    `;
}

async function refreshOverview() {
    $("cc-greeting").textContent = ccGreeting();
    $("cc-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const resp = await fetch("/api/overview/stats");
    if (!resp.ok) return;
    const data = await resp.json();

    const todayFocus = data.today_focus || [];
    $("cc-today-focus").innerHTML = todayFocus.length
        ? todayFocus.map(ccFocusRowHtml).join("")
        : `<p class="cc-empty">Nothing open right now.</p>`;

    const dueSoon = data.due_soon || [];
    $("cc-due-soon").innerHTML = dueSoon.length
        ? dueSoon.map((p) => {
            const meta = dueDateMeta(p.deadline);
            return ccRowHtml("cc-project", p.id, escapeAttr(p.title) || "Untitled project", meta.label, `cc-dot-${meta.urgency}`);
        }).join("")
        : `<p class="cc-empty">No upcoming deadlines.</p>`;

    const activeProjects = data.active_projects || [];
    $("cc-active-projects").innerHTML = activeProjects.length
        ? activeProjects.map(ccProjectMiniHtml).join("")
        : `<p class="cc-empty">No active projects.</p>`;

    const recentNotes = data.recent_notes || [];
    $("cc-recent-notes").innerHTML = recentNotes.length
        ? recentNotes.map((n) => ccRowHtml("cc-note", n.id, ccNoteLabel(n), ccRelativeTime(n.updated_at))).join("")
        : `<p class="cc-empty">No notes yet.</p>`;

    const notesPreview = data.notes_preview || [];
    $("cc-notes-strip").innerHTML = notesPreview.length
        ? notesPreview.map(ccNoteChipHtml).join("")
        : `<p class="cc-empty">No notes yet.</p>`;
}

// ---------- Today's Focus: check off without leaving the page ----------

$("cc-today-focus").addEventListener("click", async (e) => {
    const check = e.target.closest("[data-role='cc-focus-check']");
    const row = e.target.closest("[data-role='cc-focus']");
    if (!row) return;
    const taskId = row.dataset.taskId;
    const listId = row.dataset.listId;

    if (check) {
        check.classList.add("checked");
        check.innerHTML = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"></path></svg>`;
        row.querySelector(".focus-title").classList.add("done");
        await fetch(`/api/todo/lists/${listId}/tasks/${taskId}`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ completed: true }),
        });
        return;
    }

    navigateTo("todo");
    openTodoTaskModal(Number(listId), Number(taskId));
});

// ---------- Due Soon / Active Projects / Recent Notes / Notes strip: click to open ----------

function ccBindOpenOnClick(containerId) {
    $(containerId).addEventListener("click", (e) => {
        const projectRow = e.target.closest("[data-role='cc-project']");
        if (projectRow) {
            navigateTo("tracker");
            openProjectModal(Number(projectRow.dataset.id));
            return;
        }
        const noteRow = e.target.closest("[data-role='cc-note']");
        if (noteRow) {
            navigateTo("notes");
            openNoteModal(Number(noteRow.dataset.id));
        }
    });
}

["cc-due-soon", "cc-active-projects", "cc-recent-notes", "cc-notes-strip"].forEach(ccBindOpenOnClick);

// ---------- Quick capture: Enter drops a line straight into Notes ----------

$("qc-input").addEventListener("keydown", async (e) => {
    if (e.key !== "Enter") return;
    const text = e.target.value.trim();
    if (!text) return;
    e.target.disabled = true;
    const note = await (await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text" }),
    })).json();
    await fetch(`/api/notes/${note.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: text }),
    });
    e.target.value = "";
    e.target.disabled = false;
    e.target.focus();
    refreshOverview();
});

// ---------- Search ----------
// One search box across projects, studios, tasks, and notes. Clicking a
// result jumps to that tool's page and, where a detail view exists,
// opens it directly via that tool's own modal function.

let _overviewSearchToken = 0;
let _overviewSearchDebounce = null;

function closeOverviewSearchResults() {
    const panel = $("overview-search-results");
    panel.style.display = "none";
    panel.innerHTML = "";
}

function overviewSearchResultHtml(result) {
    const meta = OVERVIEW_TYPE_META[result.type];
    return `
        <button type="button" class="overview-search-result" data-type="${result.type}" data-id="${result.id}" data-list-id="${result.list_id ?? ""}">
            <span class="overview-search-result-icon">${meta.icon}</span>
            <span class="overview-search-result-title">${escapeAttr(result.title)}</span>
            <span class="overview-search-result-meta">${meta.label}</span>
        </button>
    `;
}

async function runOverviewSearch(query) {
    const token = ++_overviewSearchToken;
    const resp = await fetch(`/api/overview/search?q=${encodeURIComponent(query)}`);
    if (token !== _overviewSearchToken) return; // a newer keystroke superseded this request
    const data = await resp.json();
    const results = data.results || [];
    const panel = $("overview-search-results");
    panel.innerHTML = results.length
        ? results.map(overviewSearchResultHtml).join("")
        : `<p class="overview-search-empty">No matches.</p>`;
    panel.style.display = "block";
}

$("overview-search-input").addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(_overviewSearchDebounce);
    if (!query) {
        closeOverviewSearchResults();
        return;
    }
    _overviewSearchDebounce = setTimeout(() => runOverviewSearch(query), 200);
});

$("overview-search-results").addEventListener("click", async (e) => {
    const item = e.target.closest(".overview-search-result");
    if (!item) return;
    const { type, id, listId } = item.dataset;
    const numId = Number(id);

    closeOverviewSearchResults();
    $("overview-search-input").value = "";

    if (type === "project") {
        navigateTo("tracker");
        openProjectModal(numId);
    } else if (type === "studio") {
        navigateTo("gatherer");
    } else if (type === "task") {
        navigateTo("todo");
        openTodoTaskModal(Number(listId), numId);
    } else if (type === "note") {
        navigateTo("notes");
        openNoteModal(numId);
    }
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".top-strip-search")) closeOverviewSearchResults();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverviewSearchResults();
});

// nav.js's own showPage("overview") on initial load runs before this
// file has finished loading (script order), so refreshOverview isn't
// defined yet at that point - this call covers the first paint.
refreshOverview();
