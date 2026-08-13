// Gatherer tool - a small inline-editable table (title/url/type/status/
// date) backed by /api/gatherer. No separate "save" button: each field
// saves itself on blur/change, Notion-style. $() comes from nav.js.

let gathererEntries = [];

function escapeAttr(value) {
    return String(value ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

function normalizeUrl(url) {
    if (!url) return "#";
    return /^https?:\/\//i.test(url) ? url : "https://" + url;
}

function gathererRowHtml(entry) {
    const isSent = entry.status === "Sent";
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
                <select class="cell-select" data-field="type">
                    <option value="Studio" ${entry.type === "Studio" ? "selected" : ""}>Studio</option>
                    <option value="Company" ${entry.type === "Company" ? "selected" : ""}>Company</option>
                </select>
            </td>
            <td>
                <select class="cell-select status-pill ${isSent ? "sent" : "not-sent"}" data-field="status">
                    <option value="Not sent" ${!isSent ? "selected" : ""}>&#9679; Not sent</option>
                    <option value="Sent" ${isSent ? "selected" : ""}>&#9679; Sent</option>
                </select>
            </td>
            <td><input type="date" class="cell-input date-input" data-field="sent_date" value="${entry.sent_date || ""}"></td>
            <td><button class="row-delete-btn" data-role="delete" title="Delete row">&times;</button></td>
        </tr>
    `;
}

function renderGathererTable() {
    $("gatherer-body").innerHTML = gathererEntries.map(gathererRowHtml).join("");
    wireGathererRowEvents();
}

function wireGathererRowEvents() {
    document.querySelectorAll("#gatherer-body tr").forEach((tr) => {
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

        tr.querySelector(".cell-select[data-field='type']").addEventListener("change", (e) => {
            saveGathererFields(id, { type: e.target.value });
        });

        const statusSelect = tr.querySelector(".cell-select[data-field='status']");
        const dateInput = tr.querySelector(".date-input");
        statusSelect.addEventListener("change", (e) => {
            const nowSent = e.target.value === "Sent";
            statusSelect.classList.toggle("sent", nowSent);
            statusSelect.classList.toggle("not-sent", !nowSent);
            const updates = { status: e.target.value };
            if (nowSent && !dateInput.value) {
                dateInput.value = new Date().toISOString().slice(0, 10);
                updates.sent_date = dateInput.value;
            }
            saveGathererFields(id, updates);
        });

        dateInput.addEventListener("change", () => saveGathererFields(id, { sent_date: dateInput.value || null }));

        tr.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!confirm("Delete this row?")) return;
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

$("gatherer-add-btn").addEventListener("click", async () => {
    const resp = await fetch("/api/gatherer/entries", { method: "POST" });
    const entry = await resp.json();
    gathererEntries.push(entry);
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
