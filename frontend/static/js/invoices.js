// Invoice editor - "New Invoice", a window of editable fields, rows you can
// add and remove, and Export.
//
// Every field is free text, deliberately. The invoice this was built from
// writes "1 / 2" days, "$300,00" rates, "April 09/10" dates and a total the
// user decides; a form that insisted on numbers would fight all of that and
// win nothing. Nothing here computes a total - the total is a field.
//
// Export is the browser's own print-to-PDF over #invoice-print, a hidden
// layout revealed by the print stylesheet. No second renderer, no new
// dependency, and what you see in the print preview is what saves.

let invoices = [];
let activeInvoice = null;
let invoiceDefaults = { payment_image: null };

// ---------- Drafts list ----------
// Sits above the two scanned sections on Documents and borrows their
// disclosure shell, so the page reads as one thing. Open by default: unlike
// NFs, this is short and it is where you go to reopen the invoice you were
// halfway through.
let invoiceListOpen = true;

function invoiceLabel(inv) {
    return (inv.title || "").trim()
        || [inv.invoice_number && `Invoice ${inv.invoice_number}`, inv.bill_to && inv.bill_to.split("\n")[0]]
            .filter(Boolean).join(" - ")
        || "Untitled invoice";
}

function invoiceDate(inv) {
    return (inv.invoice_date || "").trim()
        || new Date(inv.created_at).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
}

// ---------- Sorting ----------
// Date descending by default, which is the order the list already came in
// before this existed (the API returns newest first).
let invoiceSort = { key: "date", desc: true };

// Sorts by what the Date column is *showing*: the typed invoice date when
// there is one, the created date otherwise.
//
// Reading the typed one needs care, because Date.parse is far too willing.
// The invoice this app was built from writes "April 09/10", and Date.parse
// turns that into 9 April *2010* rather than refusing it - a year nobody
// typed, dragging that invoice to the bottom of the list with nothing on
// screen to explain why. "09/10" becomes 2001, and "1 / 2" - a days-worked
// value - is a valid date to it too. The danger is silent misreading, not
// failure to read.
//
// So: only trust a typed date that names its year in full and parses to
// that same year. "April 15, 2026" and "2026-04-15" pass. "April 09/10"
// has no four-digit year and is rejected. "15/04/2026" names its year but
// Date.parse cannot read day-first, so it is rejected too rather than
// guessed at. Anything rejected falls back to created_at, which is a real
// date - so the list stays sorted by date throughout, never by 1970.
function invoiceSortDate(inv) {
    const typed = (inv.invoice_date || "").trim();
    const year = typed.match(/\b(\d{4})\b/);
    if (year) {
        const parsed = Date.parse(typed);
        if (!Number.isNaN(parsed) && new Date(parsed).getFullYear() === Number(year[1])) {
            return parsed;
        }
    }
    return Date.parse(inv.created_at) || 0;
}

function sortedInvoices() {
    const sorted = invoices.slice();
    if (invoiceSort.key === "date") {
        sorted.sort((a, b) => invoiceSortDate(a) - invoiceSortDate(b));
    } else {
        // numeric: true so "Invoice 2" comes before "Invoice 10" rather
        // than after it, the same natural order the scanner's sort_key
        // gives the two indexed sections.
        sorted.sort((a, b) => invoiceLabel(a).localeCompare(invoiceLabel(b), undefined, { numeric: true, sensitivity: "base" }));
    }
    // Descending is the ascending order reversed rather than a second
    // comparator, so the two directions cannot disagree about ties.
    if (invoiceSort.desc) sorted.reverse();
    return sorted;
}

function invoiceSortHtml() {
    // Hidden until there is something to reorder, matching the two scanned
    // sections: one row cannot be sorted, and a control that does nothing
    // is worse than no control.
    if (invoices.length < 2) return "";
    const chips = [["name", "Name"], ["date", "Date"]].map(([key, label]) => {
        const active = invoiceSort.key === key;
        const caret = active ? ` ${SORT_CARET[invoiceSort.desc ? "desc" : "asc"]}` : "";
        return `<button type="button" class="view-toggle-btn ${active ? "active" : ""}" data-inv-sort="${key}"
                        title="Sort by ${label.toLowerCase()}">${label}${caret}</button>`;
    }).join("");
    return `<div class="doc-controls doc-controls-sort-only">
                <div class="doc-filters doc-sort">${chips}</div>
            </div>`;
}

function renderInvoiceDrafts() {
    const host = $("invoice-drafts");
    if (!host) return;
    if (!invoices.length) { host.innerHTML = ""; return; }

    host.innerHTML = `
        <section class="doc-section ${invoiceListOpen ? "open" : ""}" data-kind="invoice-drafts">
            <button class="doc-section-head" type="button" data-role="disclose"
                    aria-expanded="${invoiceListOpen}" aria-controls="invoice-drafts-body">
                <span class="settings-caret" aria-hidden="true">${ICON_CHEVRON_RIGHT_SVG}</span>
                <span class="doc-section-title">Written here</span>
                <span class="doc-section-count">${invoices.length}</span>
            </button>
            <div class="doc-section-body" id="invoice-drafts-body">
                <div class="doc-section-inner">
                    <div class="panel">
                        ${invoiceSortHtml()}
                        <div class="doc-list">
                            ${sortedInvoices().map((inv) => `
                                <div class="doc-row" data-invoice-id="${inv.id}">
                                    <span class="doc-row-main">
                                        <span class="doc-row-name">${escapeAttr(invoiceLabel(inv))}</span>
                                    </span>
                                    <span class="doc-row-tags"></span>
                                    <span class="doc-row-date">${escapeAttr(invoiceDate(inv))}</span>
                                    <button class="doc-row-action" data-role="open-invoice" type="button" title="Edit">${ICON_ARROW_UP_RIGHT_SVG}</button>
                                </div>
                            `).join("")}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    `;
}

async function refreshInvoices() {
    const resp = await fetch("/api/invoices");
    if (!resp.ok) return;
    invoices = (await resp.json()).invoices || [];
    renderInvoiceDrafts();
}

$("invoice-drafts").addEventListener("click", async (e) => {
    if (e.target.closest("[data-role='disclose']")) {
        invoiceListOpen = !invoiceListOpen;
        const section = $("invoice-drafts").querySelector(".doc-section");
        section.classList.toggle("open", invoiceListOpen);
        section.querySelector("[data-role='disclose']").setAttribute("aria-expanded", String(invoiceListOpen));
        return;
    }
    const sortBtn = e.target.closest("[data-inv-sort]");
    if (sortBtn) {
        // Clicking the chip you are already sorted by reverses it - the only
        // place a second direction can live without a third chip.
        if (invoiceSort.key === sortBtn.dataset.invSort) {
            invoiceSort.desc = !invoiceSort.desc;
        } else {
            invoiceSort.key = sortBtn.dataset.invSort;
            // Dates want newest first and names want A to Z, so the default
            // direction follows the key rather than persisting across a
            // switch and putting the oldest invoice at the top.
            invoiceSort.desc = sortBtn.dataset.invSort === "date";
        }
        renderInvoiceDrafts();
        return;
    }

    const row = e.target.closest("[data-invoice-id]");
    if (row) openInvoiceModal(Number(row.dataset.invoiceId));
});

$("invoice-new-btn").addEventListener("click", async () => {
    const resp = await fetch("/api/invoices", { method: "POST" });
    if (!resp.ok) return;
    const created = await resp.json();
    await refreshInvoices();
    openInvoiceModal(created.id, created);
});

// ---------- Editor ----------

const INVOICE_FIELD_IDS = [
    "inv-title", "inv-bill-from", "inv-bill-to", "inv-project-number",
    "inv-invoice-number", "inv-invoice-date", "inv-due-date",
    "inv-project-label", "inv-summary-label", "inv-summary-year",
    "inv-total-text", "inv-notes", "inv-contact", "inv-free-body",
];

// The body of the invoice is either the row table or one plain field. Both
// are stored, always - switching to free typing and back must not throw the
// rows away, and switching back and forth while deciding is exactly what
// anyone does.
function applyBodyMode() {
    const free = (activeInvoice && activeInvoice.body_mode) === "free";
    $("inv-free-wrap").style.display = free ? "" : "none";
    $("inv-rows-block").style.display = free ? "none" : "";
    $("inv-mode-toggle").querySelectorAll("[data-mode]").forEach((btn) => {
        btn.classList.toggle("active", (btn.dataset.mode === "free") === free);
    });
    if (free) autoGrowChecklistText($("inv-free-body"));
}

$("inv-mode-toggle").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-mode]");
    if (!btn || !activeInvoice) return;
    if (activeInvoice.body_mode === btn.dataset.mode) return;
    activeInvoice.body_mode = btn.dataset.mode;
    applyBodyMode();
    saveInvoiceField("body_mode", btn.dataset.mode);
});

const ROW_FIELDS = ["project_title", "project_desc", "client", "agency", "dates", "day_rate", "days_worked", "total"];

function invoiceRowHtml(row) {
    const cell = (field, placeholder, cls = "") => `
        <textarea class="cell-input inv-cell ${cls}" data-row-field="${field}" rows="1"
                  placeholder="${escapeAttr(placeholder)}">${escapeAttr(row[field] || "")}</textarea>`;
    return `
        <div class="inv-row" data-row-id="${row.id}">
            <div class="inv-row-project">
                ${cell("project_title", "Task", "inv-cell-strong")}
                ${cell("project_desc", "What was done")}
            </div>
            ${cell("client", "Client")}
            ${cell("agency", "—")}
            ${cell("dates", "Date")}
            ${cell("day_rate", "Rate")}
            ${cell("days_worked", "1")}
            ${cell("total", "—")}
            <button class="row-delete-btn" data-role="delete-row" type="button" title="Remove row">${ICON_TRASH_SVG}</button>
        </div>
    `;
}

function renderInvoiceRows() {
    $("inv-rows").innerHTML = (activeInvoice.rows || []).map(invoiceRowHtml).join("");
    // Same auto-grow as every other cell textarea in the app: a description
    // is a sentence or two and must not scroll inside a one-line box.
    $("inv-rows").querySelectorAll(".inv-cell").forEach(autoGrowChecklistText);
}

async function openInvoiceModal(invoiceId, preloaded) {
    const invoice = preloaded || await (await fetch(`/api/invoices/${invoiceId}`)).json();
    if (!invoice || invoice.detail) return;
    activeInvoice = invoice;

    // Shown before the rows are built: auto-grow reads scrollHeight, and an
    // element inside a display:none parent measures zero - the same trap the
    // note modal hit.
    $("invoice-modal-backdrop").style.display = "flex";

    INVOICE_FIELD_IDS.forEach((id) => {
        const el = $(id);
        el.value = invoice[el.dataset.field] || "";
        if (el.tagName === "TEXTAREA") autoGrowChecklistText(el);
    });
    renderInvoiceRows();
    applyBodyMode();
}

function closeInvoiceModal() {
    closeModalAnimated($("invoice-modal-backdrop"), () => {
        activeInvoice = null;
        refreshInvoices();
    });
}

async function saveInvoiceField(field, value) {
    if (!activeInvoice) return;
    activeInvoice[field] = value;
    await fetch(`/api/invoices/${activeInvoice.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
    });
}

async function saveInvoiceRowField(rowId, field, value) {
    if (!activeInvoice) return;
    const row = (activeInvoice.rows || []).find((r) => r.id === rowId);
    if (row) row[field] = value;
    await fetch(`/api/invoices/${activeInvoice.id}/rows/${rowId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
    });
}

// Saved on blur rather than on every keystroke: this is a lot of fields and
// a PUT per character would be a request storm for no benefit.
$("invoice-modal-backdrop").addEventListener("blur", (e) => {
    const field = e.target.dataset && e.target.dataset.field;
    if (field) { saveInvoiceField(field, e.target.value); return; }
    const rowField = e.target.dataset && e.target.dataset.rowField;
    if (rowField) {
        const row = e.target.closest(".inv-row");
        if (row) saveInvoiceRowField(Number(row.dataset.rowId), rowField, e.target.value);
    }
}, true);

$("invoice-modal-backdrop").addEventListener("input", (e) => {
    if (e.target.classList.contains("inv-cell") || e.target.classList.contains("settings-textarea")) {
        autoGrowChecklistText(e.target);
    }
});

$("invoice-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "invoice-modal-backdrop") closeInvoiceModal();
});

$("invoice-modal-close").addEventListener("click", closeInvoiceModal);

$("inv-add-row-btn").addEventListener("click", async () => {
    if (!activeInvoice) return;
    const row = await (await fetch(`/api/invoices/${activeInvoice.id}/rows`, { method: "POST" })).json();
    activeInvoice.rows.push(row);
    renderInvoiceRows();
    const added = $("inv-rows").querySelector(`.inv-row[data-row-id="${row.id}"] .inv-cell`);
    if (added) added.focus();
});

$("inv-rows").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-role='delete-row']");
    if (!btn || !activeInvoice) return;
    const rowEl = btn.closest(".inv-row");
    const rowId = Number(rowEl.dataset.rowId);
    // No confirm: a row is one line of an unsent draft, and re-adding it is
    // one click. Confirming every one of them would be the annoyance.
    await fetch(`/api/invoices/${activeInvoice.id}/rows/${rowId}`, { method: "DELETE" });
    activeInvoice.rows = activeInvoice.rows.filter((r) => r.id !== rowId);
    renderInvoiceRows();
});

$("inv-delete-btn").addEventListener("click", async () => {
    if (!activeInvoice) return;
    if (!(await confirmDialog("This can't be undone.", { title: "Delete this invoice?" }))) return;
    const id = activeInvoice.id;
    activeInvoice = null;
    await fetch(`/api/invoices/${id}`, { method: "DELETE" });
    closeModalAnimated($("invoice-modal-backdrop"), refreshInvoices);
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("invoice-modal-backdrop").style.display === "none") return;
    if (document.querySelector(".popover-panel.open")) return;
    closeInvoiceModal();
});

// ---------- Export ----------
// Renders the invoice into #invoice-print and hands it to the browser. The
// print stylesheet hides the app and shows only that, so the PDF the user
// saves is this markup and nothing else.

function printLines(text) {
    return escapeAttr(text || "").split("\n")
        .map((line) => `<div class="pr-line">${line || "&nbsp;"}</div>`).join("");
}

function invoiceHeaderHtml(inv) {
    return `
        <header class="pr-head">
            <h1 class="pr-title">${escapeAttr(inv.title || "")}</h1>
            <div class="pr-parties">
                <div class="pr-party">
                    <div class="pr-label">INVOICE FROM</div>
                    ${printLines(inv.bill_from)}
                </div>
                <div class="pr-party">
                    <div class="pr-label">INVOICE TO</div>
                    ${printLines(inv.bill_to)}
                </div>
                <div class="pr-party pr-meta">
                    <div>Project number: ${escapeAttr(inv.project_number || "")}</div>
                    <div>Invoice number: ${escapeAttr(inv.invoice_number || "")}</div>
                    <div>Invoice date: ${escapeAttr(inv.invoice_date || "")}</div>
                    <div>Due date: ${escapeAttr(inv.due_date || "")}</div>
                </div>
            </div>
        </header>
    `;
}

function renderInvoicePrint(inv) {
    const rows = (inv.rows || []).map((r) => `
        <tr>
            <td class="pr-project">
                <div class="pr-project-title">${escapeAttr(r.project_title || "")}</div>
                <div class="pr-project-desc">${escapeAttr(r.project_desc || "")}</div>
            </td>
            <td>${escapeAttr(r.client || "")}</td>
            <td>${escapeAttr(r.agency || "")}</td>
            <td>${escapeAttr(r.dates || "")}</td>
            <td class="pr-num">${escapeAttr(r.day_rate || "")}</td>
            <td class="pr-num">${escapeAttr(r.days_worked || "")}</td>
            <td class="pr-num">${escapeAttr(r.total || "")}</td>
        </tr>
    `).join("");

    const wise = [invoiceDefaults.invoice_wise_link, invoiceDefaults.invoice_wise_handle]
        .filter((v) => (v || "").trim())
        .map((v) => `<div class="pr-wise-line">${escapeAttr(v)}</div>`).join("");
    const image = invoiceDefaults.payment_image
        ? `<img class="pr-payment-image" src="/api/invoices/payment-image" alt="">`
        : "";
    const payment = (wise || image)
        ? `<section class="pr-payment">${image}<div class="pr-wise">${wise}</div></section>`
        : "";

    $("invoice-print").innerHTML = `
        <article class="pr-page">
            ${invoiceHeaderHtml(inv)}
            <div class="pr-project-banner">
                <div class="pr-label">Project</div>
                <div class="pr-banner-value">${escapeAttr(inv.project_label || "")}</div>
            </div>
            ${inv.body_mode === "free"
                ? `<div class="pr-free-body">${printLines(inv.free_body)}</div>`
                : `<table class="pr-table">
                <thead>
                    <tr>
                        <th class="pr-project"></th><th>client</th><th>agency</th><th>dates</th>
                        <th class="pr-num">day rate</th><th class="pr-num">Days worked</th><th class="pr-num">total</th>
                    </tr>
                </thead>
                <tbody>${rows}</tbody>
            </table>`}
            <footer class="pr-foot">
                <div class="pr-summary">
                    <div>${escapeAttr(inv.summary_label || "")}</div>
                    <div class="pr-summary-year">${escapeAttr(inv.summary_year || "")}</div>
                </div>
                <div class="pr-total">
                    <div class="pr-total-value">${escapeAttr(inv.total_text || "")}</div>
                    <div class="pr-label">TOTAL</div>
                </div>
            </footer>
        </article>

        <article class="pr-page">
            ${invoiceHeaderHtml(inv)}
            <section class="pr-notes">
                <div class="pr-notes-label">Notes:</div>
                ${printLines(inv.notes)}
            </section>
            <section class="pr-contact">
                <div class="pr-notes-label">Contact</div>
                ${printLines(inv.contact)}
            </section>
            ${payment}
        </article>
    `;
}

$("inv-export-btn").addEventListener("click", () => {
    if (!activeInvoice) return;
    // The focused field's blur handler is what saves it, so an Export
    // clicked straight after typing would otherwise print the value from
    // before the last edit.
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(() => {
        renderInvoicePrint(activeInvoice);
        document.body.classList.add("printing-invoice");
        // Deliberately no filename of our own. Chrome's "Save as PDF" takes
        // its default from the page title, and an earlier version built one
        // out of the invoice number and the client - but the name is the
        // user's call at save time, so the dialog's own default is left
        // alone rather than pre-filled with a guess they have to clear.
        window.print();
    }, 60);
});

// Cleared however the print dialog ended - printed, or cancelled.
window.addEventListener("afterprint", () => {
    document.body.classList.remove("printing-invoice");
});

// ---------- Settings ----------

async function loadInvoiceDefaults() {
    const resp = await fetch("/api/invoices/defaults");
    if (!resp.ok) return;
    invoiceDefaults = await resp.json();
    $("settings-invoice-from").value = invoiceDefaults.invoice_from || "";
    $("settings-invoice-notes").value = invoiceDefaults.invoice_notes || "";
    $("settings-invoice-contact").value = invoiceDefaults.invoice_contact || "";
    $("settings-invoice-wise-link").value = invoiceDefaults.invoice_wise_link || "";
    $("settings-invoice-wise-handle").value = invoiceDefaults.invoice_wise_handle || "";
    paintPaymentImage();
}

function paintPaymentImage() {
    const img = $("settings-invoice-image");
    const clear = $("settings-invoice-image-clear");
    if (invoiceDefaults.payment_image) {
        // Cache-busted: the file name changes on every upload, but the
        // browser is caching the *route*, not the file.
        img.src = `/api/invoices/payment-image?v=${encodeURIComponent(invoiceDefaults.payment_image)}`;
        img.style.display = "";
        clear.style.display = "";
    } else {
        img.removeAttribute("src");
        img.style.display = "none";
        clear.style.display = "none";
    }
}

["settings-invoice-from", "settings-invoice-notes", "settings-invoice-contact",
 "settings-invoice-wise-link", "settings-invoice-wise-handle"].forEach((id) => {
    $(id).addEventListener("blur", async () => {
        const body = {
            invoice_from: $("settings-invoice-from").value,
            invoice_notes: $("settings-invoice-notes").value,
            invoice_contact: $("settings-invoice-contact").value,
            invoice_wise_link: $("settings-invoice-wise-link").value,
            invoice_wise_handle: $("settings-invoice-wise-handle").value,
        };
        const resp = await fetch("/api/invoices/defaults", {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(body),
        });
        if (resp.ok) invoiceDefaults = { ...invoiceDefaults, ...(await resp.json()) };
    });
});

$("settings-invoice-image-btn").addEventListener("click", () => $("settings-invoice-image-input").click());

$("settings-invoice-image-input").addEventListener("change", async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    const form = new FormData();
    form.append("file", file);
    const resp = await fetch("/api/invoices/defaults/payment-image", { method: "POST", body: form });
    e.target.value = "";
    if (!resp.ok) return;
    invoiceDefaults.payment_image = (await resp.json()).payment_image;
    paintPaymentImage();
});

$("settings-invoice-image-clear").addEventListener("click", async () => {
    await fetch("/api/invoices/defaults/payment-image", { method: "DELETE" });
    invoiceDefaults.payment_image = null;
    paintPaymentImage();
});

// Fetched once at startup, not only when Settings opens: the print view
// reads invoiceDefaults.payment_image, so an Export before anyone had
// visited Settings printed page two without the payment card on it.
loadInvoiceDefaults();

$("settings-invoice-toggle").addEventListener("click", () => {
    const head = $("settings-invoice-toggle");
    const open = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", String(open));
    head.closest(".settings-group").classList.toggle("open", open);
    if (open) {
        $("settings-invoice-fields").querySelectorAll("textarea").forEach(autoGrowChecklistText);
    }
});
