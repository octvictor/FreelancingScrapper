// Command Centre - the app's home page, reached through the permanent
// sidebar like any other page. Left blank for now (design still being
// settled); this file is just the one search box shared across every
// page, which lives in the header rather than on any page's own
// content. $()/escapeAttr/navigateTo come from nav.js/gatherer.js;
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
