// Calculator (Finances) tool - browser-tab-style tables, each an
// inline-editable ledger of "card" rows (Title, currency Value, an
// optional per-row color that fills the whole card, with the Title
// and icon colors flipping via colorNeedsDarkText so they stay
// readable against it) with a running SUM of the Value column. Both
// the table title and a row's Title are read-only until double-clicked
// (see the `readonly` attribute toggling below) rather than editable
// on a plain click/hover. Each row can also be toggled inactive -
// dimmed, unclickable except for the toggle/delete controls, and
// excluded from the Sum, for entries you want to keep around without
// counting. One currency applies to each whole table (picked as a pill
// next to the title, same USD/EUR/GBP/BRL set as Tracker's Day rate)
// rather than per-row, so the SUM is always a single coherent total.
// Rows beyond FINANCE_ROW_LIMIT collapse behind a "Show more" button,
// same pattern as Project Manager's list. $()/confirmDialog/
// enhanceSelect/refreshCustomSelect/openColorPresetPopover/
// colorNeedsDarkText come from nav.js, escapeAttr from gatherer.js.

let financeTables = [];
let activeTableId = null;
let financeRows = [];
let financeExpanded = false;

const FINANCE_CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", BRL: "R$" };
const FINANCE_ROW_LIMIT = 7;

function financeCurrencySymbol() {
    const table = financeTables.find((t) => t.id === activeTableId);
    return FINANCE_CURRENCY_SYMBOLS[table ? table.currency : "USD"] || "$";
}

// ---------- Tab bar ----------
// Tabs are plain buttons showing a table's title as static text - no
// inline editing or delete control on the tab itself, so hovering one
// only ever shows a pointer, never a text-cursor. Renaming happens
// once, in the title field inside the active table's panel; the tab
// just reflects whatever that field currently holds. Deleting the
// active table is the "Delete" link on the same row as that field
// (see #finance-delete-table-btn) rather than living on the tab.
function financeTabHtml(table) {
    const isActive = table.id === activeTableId;
    return `<button type="button" class="finance-tab ${isActive ? "active" : ""}" data-id="${table.id}">${escapeAttr(table.title || "Untitled")}</button>`;
}

function renderFinanceTabs() {
    $("finance-tab-bar").innerHTML = `
        ${financeTables.map(financeTabHtml).join("")}
        <button class="finance-add-tab-btn" id="finance-add-tab-btn" type="button" title="New tab">+</button>
    `;
    document.querySelectorAll(".finance-tab").forEach((tabEl) => {
        const id = parseInt(tabEl.dataset.id, 10);
        tabEl.addEventListener("click", () => {
            if (id !== activeTableId) switchFinanceTable(id);
        });
    });
    $("finance-add-tab-btn").addEventListener("click", addFinanceTable);
}

// Deleting the active table needs a new active table to fall back to;
// deleting the very last one leaves nothing to fall back to, so a
// fresh blank one is created first - same bootstrap initFinance() uses
// when there are no tables at all.
$("finance-delete-table-btn").addEventListener("click", async () => {
    const id = activeTableId;
    if (!(await confirmDialog("This can't be undone - the table and all its rows will be deleted.", { title: "Delete this table?" }))) return;
    await fetch(`/api/finance/tables/${id}`, { method: "DELETE" });
    financeTables = financeTables.filter((t) => t.id !== id);

    if (financeTables.length === 0) {
        const created = await (await fetch("/api/finance/tables", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Untitled" }),
        })).json();
        financeTables = [created];
    }

    await switchFinanceTable(financeTables[0].id);
});

async function switchFinanceTable(id) {
    activeTableId = id;
    financeExpanded = false;
    renderFinanceTabs();
    await loadFinanceTableData();
}

async function loadFinanceTableData() {
    const resp = await fetch(`/api/finance/tables/${activeTableId}`);
    const data = await resp.json();
    financeRows = data.rows;
    const table = financeTables.find((t) => t.id === activeTableId);
    $("finance-currency-select").value = table ? table.currency : "USD";
    refreshCustomSelect($("finance-currency-select"));
    $("finance-table-title-input").value = table ? table.title : "";
    autoSizeTitleField($("finance-table-title-input"));
    renderFinanceTable();
}

async function saveFinanceTableTitle(id, title) {
    const resp = await fetch(`/api/finance/tables/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = financeTables.findIndex((t) => t.id === id);
    if (idx !== -1) financeTables[idx] = updated;
    renderFinanceTabs();
}

// Read-only at rest (see the `readonly` attribute in index.html) - a
// double-click is what unlocks it for typing, same convention a row's
// own title now uses (wireFinanceRowEvents below). Blur re-locks it.
$("finance-table-title-input").addEventListener("dblclick", (e) => {
    e.target.readOnly = false;
    e.target.focus();
    e.target.select();
});
$("finance-table-title-input").addEventListener("blur", (e) => {
    saveFinanceTableTitle(activeTableId, e.target.value.trim() || "Untitled");
    e.target.readOnly = true;
});
$("finance-table-title-input").addEventListener("input", (e) => autoSizeTitleField(e.target));
$("finance-table-title-input").addEventListener("keydown", (e) => {
    if (e.key === "Enter") e.target.blur();
});

async function addFinanceTable() {
    const resp = await fetch("/api/finance/tables", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "Untitled" }),
    });
    const table = await resp.json();
    financeTables.push(table);
    await switchFinanceTable(table.id);
    const input = $("finance-table-title-input");
    input.readOnly = false;
    input.focus();
    input.select();
}

// ---------- Table ----------

function renderFinanceHead() {
    $("finance-row-head").innerHTML = `
        <span class="finance-row-head-title">Title</span>
        <span class="finance-row-head-value">Value</span>
    `;
}

function financeValueClass(value) {
    const num = parseFloat(value);
    if (isNaN(num) || num === 0) return "value-zero";
    return num > 0 ? "value-positive" : "value-negative";
}

const FINANCE_TOGGLE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M12 7v4"></path><path d="M7.998 9.003a5 5 0 1 0 8-.005"></path><circle cx="12" cy="12" r="10"></circle></svg>';

const FINANCE_DELETE_ICON_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '<line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>';

function financeRowHtml(row) {
    const isOff = !row.active;
    // Per the user's wireframe: the row's color only tints the card
    // background now - Title and Value/currency each sit in their own
    // fixed #fafafa field, so neither needs a light/dark contrast flip
    // (colorNeedsDarkText) the way the card-background approach did.
    // The Title field's width is driven by financeRowTitleSizerHtml's
    // hidden mirror span (autoSizeTitleField, nav.js) rather than
    // filling the row, so it reads as a compact pill, not a lane.
    const bg = row.color || "var(--panel)";
    return `
        <div class="finance-card${isOff ? " is-off" : ""}" data-id="${row.id}" style="background:${bg}; --stripe:${row.color || "var(--border)"};">
            <div class="finance-card-title-field">
                <button class="finance-card-dot-btn" data-role="color" type="button" title="Row color">
                    <span class="finance-card-dot"></span>
                </button>
                <div class="finance-card-title-measure">
                    <span class="finance-card-title-sizer" aria-hidden="true"></span>
                    <input type="text" class="finance-card-title" data-field="title" value="${escapeAttr(row.title)}" placeholder="Title" readonly>
                </div>
            </div>
            <div class="finance-card-right">
                <button class="finance-card-toggle" data-role="toggle" type="button" title="${isOff ? "Turn row back on" : "Turn row off"}">${FINANCE_TOGGLE_ICON_SVG}</button>
                <button class="finance-card-delete" data-role="delete" title="Delete row">${FINANCE_DELETE_ICON_SVG}</button>
                <div class="finance-card-value-field">
                    <span class="currency-prefix cost-prefix">${financeCurrencySymbol()}</span>
                    <input type="number" class="finance-card-value ${financeValueClass(row.value)}" data-field="value" step="0.01" placeholder="0.00" value="${row.value ?? ""}">
                </div>
            </div>
        </div>
    `;
}

function renderFinanceTable() {
    renderFinanceHead();
    const visible = financeExpanded ? financeRows : financeRows.slice(0, FINANCE_ROW_LIMIT);
    $("finance-body").innerHTML = visible.length
        ? visible.map(financeRowHtml).join("")
        : `<p class="muted" style="padding: 14px 10px;">No rows yet.</p>`;

    const expandBtn = $("finance-expand-btn");
    const hiddenCount = financeRows.length - visible.length;
    if (financeRows.length > FINANCE_ROW_LIMIT) {
        expandBtn.style.display = "";
        expandBtn.textContent = financeExpanded ? "Show less" : `Show ${hiddenCount} more`;
    } else {
        expandBtn.style.display = "none";
    }

    wireFinanceRowEvents();
    renderFinanceSum();
}

function wireFinanceRowEvents() {
    document.querySelectorAll("#finance-body .finance-card[data-id]").forEach((rowEl) => {
        const id = parseInt(rowEl.dataset.id, 10);

        const titleInput = rowEl.querySelector("[data-field='title']");
        autoSizeTitleField(titleInput);
        titleInput.addEventListener("input", () => autoSizeTitleField(titleInput));
        titleInput.addEventListener("dblclick", () => {
            titleInput.readOnly = false;
            titleInput.focus();
            titleInput.select();
        });
        titleInput.addEventListener("blur", () => {
            saveFinanceRow(id, { title: titleInput.value.trim() });
            titleInput.readOnly = true;
        });
        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") titleInput.blur();
        });

        const valueInput = rowEl.querySelector("[data-field='value']");
        valueInput.addEventListener("input", () => {
            valueInput.classList.remove("value-positive", "value-negative", "value-zero");
            valueInput.classList.add(financeValueClass(valueInput.value));
            renderFinanceSum();
        });
        valueInput.addEventListener("blur", () => {
            const raw = valueInput.value.trim();
            saveFinanceRow(id, { value: raw === "" ? null : parseFloat(raw) });
        });
        valueInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") valueInput.blur();
        });

        rowEl.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!(await confirmDialog("This can't be undone.", { title: "Delete this row?" }))) return;
            await fetch(`/api/finance/rows/${id}`, { method: "DELETE" });
            financeRows = financeRows.filter((r) => r.id !== id);
            renderFinanceTable();
        });

        rowEl.querySelector("[data-role='color']").addEventListener("click", (e) => {
            const row = financeRows.find((r) => r.id === id);
            openColorPresetPopover(e.currentTarget, row ? row.color : null, {
                onChange: (hex) => setFinanceRowColor(id, hex),
                onClear: () => setFinanceRowColor(id, null),
            });
        });

        rowEl.querySelector("[data-role='toggle']").addEventListener("click", async () => {
            const row = financeRows.find((r) => r.id === id);
            await saveFinanceRow(id, { active: !(row && row.active) });
            renderFinanceTable();
        });
    });
}

// A field save only patches local state - the input already shows what
// was typed, so there's nothing to re-render except the SUM (for Value).
async function saveFinanceRow(id, updates) {
    const resp = await fetch(`/api/finance/rows/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = financeRows.findIndex((r) => r.id === id);
    if (idx !== -1) financeRows[idx] = updated;
    renderFinanceSum();
}

// ---------- Row color ----------
// Wired to the dot button in financeRowHtml - click opens the shared
// color preset popover (nav.js), same one To Do's list color and
// Notes' card color use.

async function setFinanceRowColor(rowId, color) {
    await saveFinanceRow(rowId, { color });
    renderFinanceTable();
}

// ---------- Sum ----------
// financeRows (not the DOM) is the source of truth so a row hidden
// behind "Show more" still counts - but a row that's currently visible
// and mid-edit reads its live (not-yet-saved) input value instead, so
// typing updates the Sum instantly rather than waiting for blur.

function renderFinanceSum() {
    let total = 0;
    financeRows.forEach((row) => {
        if (!row.active) return;
        const liveInput = document.querySelector(`#finance-body .finance-card[data-id="${row.id}"] [data-field='value']`);
        const value = parseFloat(liveInput ? liveInput.value : row.value);
        if (!isNaN(value)) total += value;
    });
    $("finance-sum-value").textContent = financeCurrencySymbol() + total.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// ---------- Currency ----------

$("finance-currency-select").addEventListener("change", async (e) => {
    const resp = await fetch(`/api/finance/tables/${activeTableId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: e.target.value }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = financeTables.findIndex((t) => t.id === updated.id);
    if (idx !== -1) financeTables[idx] = updated;
    document.querySelectorAll("#finance-body .cost-prefix").forEach((el) => {
        el.textContent = financeCurrencySymbol();
    });
    renderFinanceSum();
});
enhanceSelect($("finance-currency-select"));

// ---------- Add row / expand ----------

$("finance-add-row-btn").addEventListener("click", async () => {
    const resp = await fetch(`/api/finance/tables/${activeTableId}/rows`, { method: "POST" });
    const row = await resp.json();
    financeRows.push(row);
    // A new row that would land behind "Show more" should still be
    // visible right away - it's the thing you just asked to add.
    if (financeRows.length > FINANCE_ROW_LIMIT) financeExpanded = true;
    renderFinanceTable();
    const newTitleInput = document.querySelector(`#finance-body .finance-card[data-id="${row.id}"] [data-field="title"]`);
    if (newTitleInput) {
        newTitleInput.readOnly = false;
        newTitleInput.focus();
    }
});

$("finance-expand-btn").addEventListener("click", () => {
    financeExpanded = !financeExpanded;
    renderFinanceTable();
});

(async function initFinance() {
    const resp = await fetch("/api/finance/tables");
    const data = await resp.json();
    financeTables = data.tables;

    if (financeTables.length === 0) {
        const created = await (await fetch("/api/finance/tables", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ title: "Untitled" }),
        })).json();
        financeTables = [created];
    }

    activeTableId = financeTables[0].id;
    renderFinanceTabs();
    await loadFinanceTableData();

    if (financeRows.length === 0) {
        const created = await (await fetch(`/api/finance/tables/${activeTableId}/rows`, { method: "POST" })).json();
        financeRows = [created];
        renderFinanceTable();
    }
})();
