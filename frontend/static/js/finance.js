// Calculator (Finances) tool - browser-tab-style tables, each an
// inline-editable ledger of flex rows (Title, currency Value, an
// optional per-row color shown as a stripe, plus any number of
// user-added freeform text columns, which render between Title and
// Value rather than after Value) with a running SUM of the Value
// column. One currency applies to each whole table (picked as a pill
// next to the title, same USD/EUR/GBP/BRL set as Tracker's Day rate)
// rather than per-row, so the SUM is always a single coherent total.
// Rows beyond FINANCE_ROW_LIMIT collapse behind a "Show more" button,
// same pattern as Project Manager's list. $()/confirmDialog/
// enhanceSelect/refreshCustomSelect come from nav.js, escapeAttr from
// gatherer.js.

let financeTables = [];
let activeTableId = null;
let financeColumns = [];
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
    financeColumns = data.columns;
    financeRows = data.rows;
    const table = financeTables.find((t) => t.id === activeTableId);
    $("finance-currency-select").value = table ? table.currency : "USD";
    refreshCustomSelect($("finance-currency-select"));
    $("finance-table-title-input").value = table ? table.title : "";
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

$("finance-table-title-input").addEventListener("blur", (e) => {
    saveFinanceTableTitle(activeTableId, e.target.value.trim() || "Untitled");
});
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
    input.focus();
    input.select();
}

// ---------- Table ----------

function renderFinanceHead() {
    const dynamicHeaders = financeColumns.map((col) => `
        <span class="finance-row-head-col">
            <input type="text" class="finance-col-header-input" data-column-id="${col.id}" value="${escapeAttr(col.name)}" placeholder="Column">
            <button class="finance-col-delete-btn" data-role="delete-column" data-column-id="${col.id}" type="button" title="Delete column">&times;</button>
        </span>
    `).join("");
    $("finance-row-head").innerHTML = `
        <span class="finance-row-head-title">Title</span>
        ${dynamicHeaders}
        <button class="finance-add-col-btn" id="finance-add-column-btn" type="button" title="Add column">+</button>
        <span class="finance-row-head-value">Value</span>
        <span class="finance-row-head-spacer"></span>
    `;
    $("finance-row-head").querySelectorAll(".finance-col-header-input").forEach((input) => {
        input.addEventListener("blur", () => saveFinanceColumnName(parseInt(input.dataset.columnId, 10), input.value.trim()));
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") input.blur();
        });
    });
    $("finance-row-head").querySelectorAll("[data-role='delete-column']").forEach((btn) => {
        btn.addEventListener("click", () => deleteFinanceColumn(parseInt(btn.dataset.columnId, 10)));
    });
    $("finance-add-column-btn").addEventListener("click", addFinanceColumn);
}

function financeValueClass(value) {
    const num = parseFloat(value);
    if (isNaN(num) || num === 0) return "value-zero";
    return num > 0 ? "value-positive" : "value-negative";
}

function financeRowHtml(row) {
    const dynamicCells = financeColumns.map((col) => `
        <input type="text" class="cell-input finance-row-col" data-role="cell" data-column-id="${col.id}" value="${escapeAttr(row.cells[col.id] || "")}" placeholder="-">
    `).join("");
    return `
        <div class="finance-row" data-id="${row.id}" style="--stripe:${row.color || "var(--border-soft)"};">
            <div class="finance-title-cell">
                <input type="text" class="cell-input" data-field="title" value="${escapeAttr(row.title)}" placeholder="Title">
            </div>
            ${dynamicCells}
            <span class="finance-row-addcol-spacer"></span>
            <div class="cost-cell finance-value-cell">
                <span class="currency-prefix cost-prefix">${financeCurrencySymbol()}</span>
                <input type="number" class="cell-input ${financeValueClass(row.value)}" data-field="value" step="0.01" placeholder="0.00" value="${row.value ?? ""}">
            </div>
            <button class="row-delete-btn" data-role="delete" title="Delete row">&times;</button>
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
    document.querySelectorAll("#finance-body .finance-row[data-id]").forEach((rowEl) => {
        const id = parseInt(rowEl.dataset.id, 10);

        const titleInput = rowEl.querySelector(".cell-input[data-field='title']");
        titleInput.addEventListener("blur", () => saveFinanceRow(id, { title: titleInput.value.trim() }));
        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") titleInput.blur();
        });

        const valueInput = rowEl.querySelector(".cell-input[data-field='value']");
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

        rowEl.querySelectorAll("[data-role='cell']").forEach((cellInput) => {
            const columnId = parseInt(cellInput.dataset.columnId, 10);
            cellInput.addEventListener("blur", () => saveFinanceCell(id, columnId, cellInput.value.trim() || null));
            cellInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") cellInput.blur();
            });
        });

        rowEl.querySelector("[data-role='delete']").addEventListener("click", async () => {
            if (!(await confirmDialog("This can't be undone.", { title: "Delete this row?" }))) return;
            await fetch(`/api/finance/rows/${id}`, { method: "DELETE" });
            financeRows = financeRows.filter((r) => r.id !== id);
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

async function saveFinanceCell(rowId, columnId, value) {
    await fetch(`/api/finance/rows/${rowId}/cells/${columnId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ value }),
    });
    const row = financeRows.find((r) => r.id === rowId);
    if (row) row.cells[columnId] = value;
}

// ---------- Row color ----------
// The swatch button that opened the color preset popover (nav.js) was
// removed from the row - it wasn't part of the approved design, only
// the stripe was. This save function stays, ready for whatever new
// trigger replaces it; nothing currently calls it.

async function setFinanceRowColor(rowId, color) {
    await saveFinanceRow(rowId, { color });
    renderFinanceTable();
}

// ---------- Columns ----------

async function addFinanceColumn() {
    const resp = await fetch(`/api/finance/tables/${activeTableId}/columns`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: "" }),
    });
    const column = await resp.json();
    financeColumns.push(column);
    renderFinanceTable();
    document.querySelector(`.finance-col-header-input[data-column-id="${column.id}"]`)?.focus();
}

async function saveFinanceColumnName(columnId, name) {
    const resp = await fetch(`/api/finance/columns/${columnId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = financeColumns.findIndex((c) => c.id === updated.id);
    if (idx !== -1) financeColumns[idx] = updated;
}

async function deleteFinanceColumn(columnId) {
    if (!(await confirmDialog("This can't be undone.", { title: "Delete this column?" }))) return;
    await fetch(`/api/finance/columns/${columnId}`, { method: "DELETE" });
    financeColumns = financeColumns.filter((c) => c.id !== columnId);
    financeRows.forEach((row) => {
        delete row.cells[columnId];
    });
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
        const liveInput = document.querySelector(`#finance-body .finance-row[data-id="${row.id}"] .cell-input[data-field='value']`);
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
    document.querySelector(`#finance-body .finance-row[data-id="${row.id}"] .cell-input[data-field="title"]`)?.focus();
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
