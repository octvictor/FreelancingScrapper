// Command Centre - the app's home page, reached through the permanent
// sidebar like any other page: a greeting, a plain stat strip (Active
// projects, Tasks, Studios logged), then Due Soon / Recent Notes side
// by side. $()/escapeAttr/navigateTo come from nav.js/gatherer.js;
// openProjectModal, selectTodoList + openTodoTaskModal, and openNoteModal
// (defined in tracker.js/todo.js/notes.js) are reused as-is to open the
// right detail view after a search jump - nothing about those tools is
// touched here.

const OVERVIEW_TYPE_META = {
    project: { icon: "&#9636;", label: "Project", page: "tracker" },
    studio: { icon: "&#9638;", label: "Studio Logs", page: "gatherer" },
    task: { icon: "&#9745;", label: "To Do", page: "todo" },
    note: { icon: "&#9998;", label: "Note", page: "notes" },
};

// ---------- Command Centre content ----------

function ccGreeting() {
    const hour = new Date().getHours();
    if (hour < 12) return "Good morning";
    if (hour < 18) return "Good afternoon";
    return "Good evening";
}

function ccDueMeta(dateStr) {
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

function ccRowHtml(titleText, subLabel, dotClass) {
    const dot = dotClass ? `<span class="cc-dot ${dotClass}"></span>` : "";
    return `
        <div class="cc-row">
            ${dot}
            <span class="cc-row-title">${titleText}</span>
            <span class="cc-row-sub">${subLabel}</span>
        </div>
    `;
}

async function refreshOverview() {
    $("cc-greeting").textContent = ccGreeting();
    $("cc-date").textContent = new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

    const resp = await fetch("/api/overview/stats");
    if (!resp.ok) return;
    const data = await resp.json();
    const counts = data.counts || {};

    $("cc-stat-projects").textContent = counts.tracker ?? "0";
    $("cc-stat-tasks").textContent = counts.todo ?? "0";
    $("cc-stat-studios").textContent = counts.gatherer ?? "0";

    const dueSoon = data.due_soon || [];
    $("cc-due-soon").innerHTML = dueSoon.length
        ? dueSoon.map((p) => {
            const meta = ccDueMeta(p.deadline);
            return ccRowHtml(escapeAttr(p.title) || "Untitled project", meta.label, `cc-dot-${meta.urgency}`);
        }).join("")
        : `<p class="cc-empty">No upcoming deadlines.</p>`;

    const recentNotes = data.recent_notes || [];
    $("cc-recent-notes").innerHTML = recentNotes.length
        ? recentNotes.map((n) => ccRowHtml(escapeAttr(n.title) || "Untitled note", ccRelativeTime(n.updated_at))).join("")
        : `<p class="cc-empty">No notes yet.</p>`;
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
        await selectTodoList(Number(listId));
        openTodoTaskModal(numId);
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
