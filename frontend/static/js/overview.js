// Overview hub - the app's home page: stat cards plus Due soon / Recent
// notes panels. The rail (icon, name, live count per tool) and the "jump
// to..." search bar aren't page-specific anymore - they're persistent
// shell chrome shared by every page (see index.html/nav.js) - so this file
// also owns refreshing the rail's counts and driving the search bar,
// alongside the two panels below. $()/escapeAttr/navigateTo come from
// nav.js/gatherer.js; openProjectModal, selectTodoList + openTodoTaskModal,
// and openNoteModal (defined in tracker.js/todo.js/notes.js) are reused
// as-is to open the right detail view after a search jump - nothing about
// those tools is touched here.

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

// Called on every navigation (see nav.js's showPage), not just while
// Overview itself is visible - the rail's counts are on screen on every
// page now, so they need to stay current no matter where you are.
async function refreshOverview() {
    const resp = await fetch("/api/overview/stats");
    if (!resp.ok) return;
    const data = await resp.json();
    const counts = data.counts || {};

    $("rail-count-tracker").textContent = counts.tracker ?? "0";
    $("rail-count-gatherer").textContent = counts.gatherer ?? "0";
    $("rail-count-todo").textContent = counts.todo ?? "0";
    $("rail-count-notes").textContent = counts.notes ?? "0";
    $("rail-count-finance").textContent = counts.finance ?? "0";

    $("overview-stat-projects").textContent = counts.tracker ?? "0";
    $("overview-stat-tasks").textContent = counts.todo ?? "0";
    $("overview-stat-studios").textContent = counts.gatherer ?? "0";

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
// One search box across projects, studios, tasks, and notes, always
// available in the shell's top bar. Clicking a result jumps to that
// tool's page and, where a detail view exists, opens it directly via that
// tool's own modal function.

let _overviewSearchToken = 0;
let _overviewSearchDebounce = null;

function closeOverviewSearchResults() {
    const panel = $("app-search-results");
    panel.style.display = "none";
    panel.innerHTML = "";
}

function overviewSearchResultHtml(result) {
    const meta = OVERVIEW_TYPE_META[result.type];
    return `
        <button type="button" class="app-search-result" data-type="${result.type}" data-id="${result.id}" data-list-id="${result.list_id ?? ""}">
            <span class="app-search-result-icon">${meta.icon}</span>
            <span class="app-search-result-title">${escapeAttr(result.title)}</span>
            <span class="app-search-result-meta">${meta.label}</span>
        </button>
    `;
}

async function runOverviewSearch(query) {
    const token = ++_overviewSearchToken;
    const resp = await fetch(`/api/overview/search?q=${encodeURIComponent(query)}`);
    if (token !== _overviewSearchToken) return; // a newer keystroke superseded this request
    const data = await resp.json();
    const results = data.results || [];
    const panel = $("app-search-results");
    panel.innerHTML = results.length
        ? results.map(overviewSearchResultHtml).join("")
        : `<p class="overview-empty app-search-empty">No matches.</p>`;
    panel.style.display = "block";
}

$("app-search-input").addEventListener("input", (e) => {
    const query = e.target.value.trim();
    clearTimeout(_overviewSearchDebounce);
    if (!query) {
        closeOverviewSearchResults();
        return;
    }
    _overviewSearchDebounce = setTimeout(() => runOverviewSearch(query), 200);
});

$("app-search-results").addEventListener("click", async (e) => {
    const item = e.target.closest(".app-search-result");
    if (!item) return;
    const { type, id, listId } = item.dataset;
    const numId = Number(id);

    closeOverviewSearchResults();
    $("app-search-input").value = "";

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
    if (!e.target.closest(".app-search-wrap")) closeOverviewSearchResults();
});
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") closeOverviewSearchResults();
});

refreshOverview();
