// Overview hub - the app's home page, reached through the permanent
// zone-nav like any other page: headline stats plus Due soon / Recent
// notes, nothing else. It no longer carries its own shortcut tiles - the
// zone-nav beside it is already that navigation, and refreshOverview()
// (called on every page switch, not just Overview's) also keeps the
// zone-nav's per-tool counts up to date. $()/escapeAttr/navigateTo come
// from nav.js/gatherer.js;
// openProjectModal, selectTodoList + openTodoTaskModal, and openNoteModal
// (defined in tracker.js/todo.js/notes.js) are reused as-is to open the
// right detail view after a search jump - nothing about those tools is
// touched here.

const OVERVIEW_TYPE_META = {
    project: { icon: "&#9636;", label: "Project", page: "tracker" },
    studio: { icon: "&#9638;", label: "Studio Database", page: "gatherer" },
    task: { icon: "&#9745;", label: "To Do", page: "todo" },
    note: { icon: "&#9998;", label: "Note", page: "notes" },
};

function overviewDueMeta(dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / 86400000);
    if (diffDays < 0) return { label: "Overdue", urgency: "overdue" };
    if (diffDays === 0) return { label: "Today", urgency: "today" };
    if (diffDays === 1) return { label: "Tomorrow", urgency: "soon" };
    if (diffDays <= 6) return { label: target.toLocaleDateString(undefined, { weekday: "short" }), urgency: "soon" };
    return { label: target.toLocaleDateString(undefined, { month: "short", day: "numeric" }), urgency: "later" };
}

function overviewRelativeTime(isoStr) {
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

function overviewRowHtml(dotClass, titleText, subLabel) {
    return `
        <div class="overview-row">
            <span class="overview-dot ${dotClass}"></span>
            <span class="overview-row-title">${titleText}</span>
            <span class="overview-row-sub">${subLabel}</span>
        </div>
    `;
}

async function refreshOverview() {
    const resp = await fetch("/api/overview/stats");
    if (!resp.ok) return;
    const data = await resp.json();
    const counts = data.counts || {};

    $("overview-stat-projects").textContent = counts.tracker ?? "0";
    $("overview-stat-tasks").textContent = counts.todo ?? "0";
    $("overview-stat-studios").textContent = counts.gatherer ?? "0";

    $("zone-count-tracker").textContent = counts.tracker ?? "0";
    $("zone-count-gatherer").textContent = counts.gatherer ?? "0";
    $("zone-count-todo").textContent = counts.todo ?? "0";
    $("zone-count-notes").textContent = counts.notes ?? "0";
    $("zone-count-finance").textContent = counts.finance ?? "0";

    const dueSoon = data.due_soon || [];
    $("overview-due-soon").innerHTML = dueSoon.length
        ? dueSoon.map((p) => {
            const meta = overviewDueMeta(p.deadline);
            return overviewRowHtml(`overview-dot-${meta.urgency}`, escapeAttr(p.title) || "Untitled project", meta.label);
        }).join("")
        : `<p class="overview-empty">No upcoming deadlines.</p>`;

    const recentNotes = data.recent_notes || [];
    $("overview-recent-notes").innerHTML = recentNotes.length
        ? recentNotes.map((n) => overviewRowHtml("overview-dot-later", escapeAttr(n.title) || "Untitled note", overviewRelativeTime(n.updated_at))).join("")
        : `<p class="overview-empty">No notes yet.</p>`;
}

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
        : `<p class="overview-empty overview-search-empty">No matches.</p>`;
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
        await selectTodoList(Number(listId));
        openTodoTaskModal(numId);
    } else if (type === "note") {
        navigateTo("notes");
        openNoteModal(numId);
    }
});

document.addEventListener("click", (e) => {
    if (!e.target.closest(".command-bar")) closeOverviewSearchResults();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverviewSearchResults();
});

refreshOverview();
