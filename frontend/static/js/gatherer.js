// Gatherer tool - a small inline-editable table (title/url/type/status/
// date) backed by /api/gatherer. No separate "save" button: each field
// saves itself on blur/change, Notion-style. $() comes from nav.js.

let gathererEntries = [];
const gathererFilters = { type: "", status: "" };

// This list is meant to get long - it is a running log of every studio
// worth contacting - so the page shows a window onto it rather than all
// of it. How many rows that is comes from applyRowFit (nav.js): whatever
// reaches the bottom of the window, not a constant. The cap applies after
// filtering, so narrowing by Type or Status narrows what it counts.
// Enough rows are rendered to overflow any plausible window, then the
// overflow is hidden - one layout pass, no guessing at row height.
const GATHERER_RENDER_BOUND = 40;
let gathererExpanded = false;

function escapeAttr(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function normalizeUrl(url) {
    if (!url) return "#";
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
}

function typePillClass(type) {
    return type === "Company" ? "type-company" : "type-studio";
}

function statusPillClass(status) {
    return status === "Sent" ? "status-sent" : "status-not-sent";
}

function gathererRowHtml(entry) {
    const isSent = entry.status === "Sent";
    const isCompany = entry.type === "Company";
    return `
        <tr data-id="${entry.id}">
            <td><input type="text" class="cell-input" data-field="title" value="${escapeAttr(entry.title)}" placeholder="Studio or company name"></td>
            <td>
                <div class="url-cell">
                    <input type="text" class="cell-input" data-field="url" value="${escapeAttr(entry.url)}" placeholder="https://...">
                    <a class="url-open-link" data-role="open-link" href="${escapeAttr(normalizeUrl(entry.url))}" target="_blank" rel="noopener" title="Open link">&#8599;</a>
                </div>
            </td>
            <td>
                <select class="cell-select color-pill ${typePillClass(entry.type)}" data-field="type">
                    <option value="Studio" ${!isCompany ? "selected" : ""}>&#9679; Studio</option>
                    <option value="Company" ${isCompany ? "selected" : ""}>&#9679; Company</option>
                </select>
            </td>
            <td>
                <select class="cell-select color-pill ${statusPillClass(entry.status)}" data-field="status">
                    <option value="Not sent" ${!isSent ? "selected" : ""}>&#9679; Not sent</option>
                    <option value="Sent" ${isSent ? "selected" : ""}>&#9679; Sent</option>
                </select>
            </td>
            <td><input type="date" class="cell-input date-input" data-field="sent_date" value="${entry.sent_date || ""}"></td>
            <td><button class="row-delete-btn" data-role="delete" title="Delete row">&times;</button></td>
        </tr>
    `;
}

function getFilteredEntries() {
    return gathererEntries.filter((e) => {
        if (gathererFilters.type && e.type !== gathererFilters.type) return false;
        if (gathererFilters.status && e.status !== gathererFilters.status) return false;
        return true;
    });
}

function renderGathererTable() {
    cleanupCustomSelectsIn($("gatherer-body"));
    const rows = getFilteredEntries();
    const rendered = gathererExpanded ? rows : rows.slice(0, GATHERER_RENDER_BOUND);

    $("gatherer-body").innerHTML = rendered.length
        ? rendered.map(gathererRowHtml).join("")
        : `<tr><td colspan="6" class="muted" style="padding: 14px 10px;">No rows match this filter.</td></tr>`;

    // 56 leaves room for the "+ Add row" footer under the table.
    const shown = gathererExpanded
        ? rendered.length
        : applyRowFit($("gatherer-body"), "tr[data-id]", { reserve: 56 });

    const expandBtn = $("gatherer-expand-btn");
    const hidden = rows.length - shown;
    if (gathererExpanded) {
        expandBtn.style.display = "";
        expandBtn.textContent = "Show less";
    } else if (hidden > 0) {
        expandBtn.style.display = "";
        expandBtn.textContent = `Show ${hidden} more`;
    } else {
        expandBtn.style.display = "none";
    }

    wireGathererRowEvents();
}

onRowFitResize(() => {
    const page = $("page-gatherer");
    if (page && page.style.display !== "none") renderGathererTable();
});

function wireGathererRowEvents() {
    document.querySelectorAll("#gatherer-body tr[data-id]").forEach((tr) => {
        const id = parseInt(tr.dataset.id, 10);

        const titleInput = tr.querySelector(".cell-input[data-field='title']");
        const urlInput = tr.querySelector(".cell-input[data-field='url']");
        const openLink = tr.querySelector("[data-role='open-link']");

        [titleInput, urlInput].forEach((input) => {
            input.addEventListener("blur", () => saveGathererFields(id, { [input.dataset.field]: input.value.trim() }));
            input.addEventListener("keydown", (e) => {
                if (e.key === "Enter") input.blur();
            });
        });
        urlInput.addEventListener("input", () => {
            openLink.href = normalizeUrl(urlInput.value.trim());
        });

        const typeSelect = tr.querySelector(".cell-select[data-field='type']");
        typeSelect.addEventListener("change", (e) => {
            typeSelect.classList.remove("type-studio", "type-company");
            typeSelect.classList.add(typePillClass(e.target.value));
            saveGathererFields(id, { type: e.target.value });
        });
        enhanceSelect(typeSelect);

        const statusSelect = tr.querySelector(".cell-select[data-field='status']");
        const dateInput = tr.querySelector(".date-input");
        statusSelect.addEventListener("change", (e) => {
            statusSelect.classList.remove("status-sent", "status-not-sent");
            statusSelect.classList.add(statusPillClass(e.target.value));
            const nowSent = e.target.value === "Sent";
            const updates = { status: e.target.value };
            if (nowSent && !dateInput.value) {
                dateInput.value = new Date().toISOString().slice(0, 10);
                updates.sent_date = dateInput.value;
            }
            saveGathererFields(id, updates);
        });
        enhanceSelect(statusSelect);

        dateInput.addEventListener("change", () => saveGathererFields(id, { sent_date: dateInput.value || null }));
        // Rows are built after DOMContentLoaded, so nav.js's one-time sweep
        // never sees them - every table row has to opt in itself.
        enhanceDateField(dateInput);

        tr.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!(await confirmDialog("This can't be undone.", { title: "Delete this row?" }))) return;
            await fetch(`/api/gatherer/entries/${id}`, { method: "DELETE" });
            gathererEntries = gathererEntries.filter((e) => e.id !== id);
            renderGathererTable();
        });
    });
}

async function saveGathererFields(id, updates) {
    const resp = await fetch(`/api/gatherer/entries/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (resp.ok) {
        const updated = await resp.json();
        const idx = gathererEntries.findIndex((e) => e.id === id);
        if (idx !== -1) gathererEntries[idx] = updated;
    }
}

// ---------- Column filters ----------

$("filter-type").addEventListener("change", (e) => {
    gathererFilters.type = e.target.value;
    e.target.classList.toggle("filter-active", !!e.target.value);
    renderGathererTable();
});
enhanceSelect($("filter-type"));

$("filter-status").addEventListener("change", (e) => {
    gathererFilters.status = e.target.value;
    e.target.classList.toggle("filter-active", !!e.target.value);
    renderGathererTable();
});
enhanceSelect($("filter-status"));

// ---------- Show more / less ----------

$("gatherer-expand-btn").addEventListener("click", () => {
    gathererExpanded = !gathererExpanded;
    renderGathererTable();
    if (!gathererExpanded) window.scrollTo({ top: 0 });
});

// ---------- Add row ----------

$("gatherer-add-btn").addEventListener("click", async () => {
    const resp = await fetch("/api/gatherer/entries", { method: "POST" });
    const entry = await resp.json();
    gathererEntries.push(entry);

    // A new row defaults to Studio/Not sent - if an active filter would
    // hide it, clear filters so the row you just added is actually
    // visible instead of silently vanishing.
    if ((gathererFilters.type && gathererFilters.type !== entry.type) ||
        (gathererFilters.status && gathererFilters.status !== entry.status)) {
        gathererFilters.type = "";
        gathererFilters.status = "";
        $("filter-type").value = "";
        $("filter-status").value = "";
        $("filter-type").classList.remove("filter-active");
        $("filter-status").classList.remove("filter-active");
        refreshCustomSelect($("filter-type"));
        refreshCustomSelect($("filter-status"));
    }

    // The new row goes on the end, so past the cap it would be created
    // below the fold and the focus call below would find nothing. Same
    // reasoning as the filter reset above: never add something the user
    // cannot see.
    gathererExpanded = true;

    renderGathererTable();
    const newTitleInput = document.querySelector(`#gatherer-body tr[data-id="${entry.id}"] .cell-input[data-field="title"]`);
    if (newTitleInput) newTitleInput.focus();
});

(async function initGatherer() {
    const resp = await fetch("/api/gatherer/entries");
    const data = await resp.json();
    gathererEntries = data.entries;
    if (gathererEntries.length === 0) {
        const created = await (await fetch("/api/gatherer/entries", { method: "POST" })).json();
        gathererEntries = [created];
    }
    renderGathererTable();
})();
