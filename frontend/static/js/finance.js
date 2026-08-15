// Finances tool - a Studio-Database-style inline-editable table (Title,
// currency Value, plus any number of user-added freeform text columns)
// with a running SUM of the Value column at the bottom. One currency
// applies to the whole table (picked at the top, same USD/EUR/GBP/BRL
// set as Tracker's Day rate) rather than per-row, so the SUM is always
// a single coherent total. $()/confirmDialog/enhanceSelect/
// refreshCustomSelect come from nav.js, escapeAttr from gatherer.js.

let financeSettings = { currency: "USD" };
let financeColumns = [];
let financeRows = [];

const FINANCE_CURRENCY_SYMBOLS = { USD: "$", EUR: "€", GBP: "£", BRL: "R$" };

function financeCurrencySymbol() {
    return FINANCE_CURRENCY_SYMBOLS[financeSettings.currency] || "$";
}

// ---------- Table ----------

function renderFinanceHead() {
    const dynamicHeaders = financeColumns.map((col) => `
        <th><input type="text" class="cell-input finance-col-header-input" data-column-id="${col.id}" value="${escapeAttr(col.name)}" placeholder="Column"></th>
    `).join("");
    $("finance-table-head").innerHTML = `
        <th>Title</th>
        <th>Value</th>
        ${dynamicHeaders}
        <th class="finance-add-col-th"><button class="finance-add-col-btn" id="finance-add-column-btn" type="button" title="Add column">+</button></th>
        <th></th>
    `;
    $("finance-table-head").querySelectorAll(".finance-col-header-input").forEach((input) => {
        input.addEventListener("blur", () => saveFinanceColumnName(parseInt(input.dataset.columnId, 10), input.value.trim()));
        input.addEventListener("keydown", (e) => {
            if (e.key === "Enter") input.blur();
        });
    });
    $("finance-add-column-btn").addEventListener("click", addFinanceColumn);
}

function financeRowHtml(row) {
    const dynamicCells = financeColumns.map((col) => `
        <td><input type="text" class="cell-input" data-role="cell" data-column-id="${col.id}" value="${escapeAttr(row.cells[col.id] || "")}" placeholder="-"></td>
    `).join("");
    return `
        <tr data-id="${row.id}">
            <td><input type="text" class="cell-input" data-field="title" value="${escapeAttr(row.title)}" placeholder="Title"></td>
            <td>
                <div class="cost-cell">
                    <span class="currency-prefix cost-prefix">${financeCurrencySymbol()}</span>
                    <input type="number" class="cell-input" data-field="value" step="0.01" placeholder="0.00" value="${row.value ?? ""}">
                </div>
            </td>
            ${dynamicCells}
            <td></td>
            <td><button class="row-delete-btn" data-role="delete" title="Delete row">&times;</button></td>
        </tr>
    `;
}

function renderFinanceTable() {
    renderFinanceHead();
    $("finance-body").innerHTML = financeRows.length
        ? financeRows.map(financeRowHtml).join("")
        : `<tr><td colspan="${4 + financeColumns.length}" class="muted" style="padding: 14px 10px;">No rows yet.</td></tr>`;
    wireFinanceRowEvents();
    renderFinanceSum();
}

function wireFinanceRowEvents() {
    document.querySelectorAll("#finance-body tr[data-id]").forEach((tr) => {
        const id = parseInt(tr.dataset.id, 10);

        const titleInput = tr.querySelector(".cell-input[data-field='title']");
        titleInput.addEventListener("blur", () => saveFinanceRow(id, { title: titleInput.value.trim() }));
        titleInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") titleInput.blur();
        });

        const valueInput = tr.querySelector(".cell-input[data-field='value']");
        valueInput.addEventListener("input", renderFinanceSum);
        valueInput.addEventListener("blur", () => {
            const raw = valueInput.value.trim();
            saveFinanceRow(id, { value: raw === "" ? null : parseFloat(raw) });
        });
        valueInput.addEventListener("keydown", (e) => {
            if (e.key === "Enter") valueInput.blur();
        });

        tr.querySelectorAll("[data-role='cell']").forEach((cellInput) => {
            const columnId = parseInt(cellInput.dataset.columnId, 10);
            cellInput.addEventListener("blur", () => saveFinanceCell(id, columnId, cellInput.value.trim() || null));
            cellInput.addEventListener("keydown", (e) => {
                if (e.key === "Enter") cellInput.blur();
            });
        });

        tr.querySelector("[data-role='delete']").addEventListener("click", async () => {
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

// ---------- Columns ----------

async function addFinanceColumn() {
    const resp = await fetch("/api/finance/columns", {
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

// ---------- Sum ----------
// Reads current input values straight from the DOM, same pattern as
// Tracker's Log Sum - a plain running total naturally subtracts a
// negative Value entry, no special-casing needed.

function renderFinanceSum() {
    let total = 0;
    document.querySelectorAll("#finance-body .cell-input[data-field='value']").forEach((input) => {
        const value = parseFloat(input.value);
        if (!isNaN(value)) total += value;
    });
    $("finance-sum-value").textContent = financeCurrencySymbol() + total.toFixed(2);
}

// ---------- Currency ----------

$("finance-currency-select").addEventListener("change", async (e) => {
    const resp = await fetch("/api/finance/currency", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currency: e.target.value }),
    });
    if (!resp.ok) return;
    financeSettings = await resp.json();
    document.querySelectorAll("#finance-body .cost-prefix").forEach((el) => {
        el.textContent = financeCurrencySymbol();
    });
    renderFinanceSum();
});
enhanceSelect($("finance-currency-select"));

// ---------- Add row ----------

$("finance-add-row-btn").addEventListener("click", async () => {
    const resp = await fetch("/api/finance/rows", { method: "POST" });
    const row = await resp.json();
    financeRows.push(row);
    renderFinanceTable();
    document.querySelector(`#finance-body tr[data-id="${row.id}"] .cell-input[data-field="title"]`)?.focus();
});

(async function initFinance() {
    const resp = await fetch("/api/finance");
    const data = await resp.json();
    financeSettings = data.settings;
    financeColumns = data.columns;
    financeRows = data.rows;

    if (financeRows.length === 0) {
        const created = await (await fetch("/api/finance/rows", { method: "POST" })).json();
        financeRows = [created];
    }

    $("finance-currency-select").value = financeSettings.currency;
    refreshCustomSelect($("finance-currency-select"));
    renderFinanceTable();
})();
