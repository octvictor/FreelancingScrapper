// Documents - a browser over folders of PDFs the user nominates in
// Settings. The app indexes those folders and never writes to them;
// opening a file hands it to the OS rather than rendering it here.
//
// The whole point is beating a file manager, and the way it does that is
// flattening: every invoice from every client in one list, filtered by
// typing rather than by walking a tree. So search filters the already-
// loaded index in memory and never touches the disk - the only thing that
// reads a folder is an explicit Rescan.
//
// Two kinds live on this page, Invoices and NFs. They are the same thing
// pointed at two folders, so they are one template rendered twice rather
// than two near-identical blocks that drift apart on the next change.
// Everything below is keyed by kind; nothing hard-codes "invoice" or "nf"
// except the labels the server sends.

let docFiles = [];
let docTags = [];
let docKinds = [];

// Per-kind view state. Collapsing, searching or expanding one section must
// leave the other exactly as it was, so none of this can be a page-level
// variable.
const docView = {};

// A fixed cap rather than fit-to-window: with two stacked sections there is
// no single "what fits" answer, and a list that changes length when the
// window resizes is worse than one you can predict.
const DOC_PAGE_SIZE = 10;

function docViewFor(kind) {
    if (!docView[kind]) {
        docView[kind] = {
            query: "",
            group: "All",
            year: "All",
            expanded: false,
            // Invoices open, NFs closed. The second kind is the one you go
            // looking for; the first is the one you came for.
            open: kind === "invoice",
            status: "",
        };
    }
    return docView[kind];
}

function docDate(mtime) {
    return new Date(mtime * 1000).toLocaleDateString(undefined, {
        day: "numeric", month: "short", year: "numeric",
    });
}

// Matches the same fields the scanner matched on, so what you can search
// for here is what could have got a file into the list in the first place.
function docMatchesQuery(file, q) {
    if (!q) return true;
    return (file.display_name + " " + (file.group_name || "") + " " + file.folder)
        .toLowerCase()
        .includes(q);
}

function docFilesOfKind(kind) {
    return docFiles.filter((f) => f.kind === kind);
}

// Grouping only earns its keep when there is more than one group. Files
// sitting loose in the folder you nominated - or under folders that all
// carry the search term, which is the same thing - resolve to no group at
// all, and the list then grew a "UNGROUPED" header over every row plus an
// "Ungrouped" chip beside "All" that filtered nothing out. One group means
// no headers and no group filter.
function docGroupsOf(kind) {
    return Array.from(new Set(docFilesOfKind(kind).map((f) => f.group_name || "Ungrouped"))).sort();
}

function docIsGrouped(kind) {
    return docGroupsOf(kind).length > 1;
}

function docVisibleFiles(kind) {
    const view = docViewFor(kind);
    const q = view.query.trim().toLowerCase();
    // The group filter is ignored when there is nothing to group by. A
    // rescan can flatten a tree that used to have folders, and a stale
    // selection would then match nothing and empty the list with no chip
    // left on screen to explain why.
    const grouped = docIsGrouped(kind);
    return docFilesOfKind(kind).filter((f) =>
        docMatchesQuery(f, q) &&
        (!grouped || view.group === "All" || (f.group_name || "Ungrouped") === view.group) &&
        (view.year === "All" || String(f.year) === view.year)
    );
}

function docTagChipsHtml(file) {
    return file.tags
        .map((t) => `<span class="doc-tag" style="${t.color ? `background:${t.color}; color:${colorNeedsDarkText(t.color) ? "#242322" : "#f5f4f1"};` : ""}">${escapeAttr(t.name)}</span>`)
        .join("");
}

function docRowHtml(file) {
    return `
        <div class="doc-row" data-id="${file.id}">
            <span class="doc-row-name">${escapeAttr(file.display_name)}</span>
            <span class="doc-row-tags">${docTagChipsHtml(file)}</span>
            <span class="doc-row-date">${docDate(file.mtime)}</span>
            <button class="doc-row-action" data-role="tag" type="button" title="Tags">${ICON_TAG_SVG}</button>
            <button class="doc-row-action doc-row-open" data-role="reveal" type="button" title="Show in folder">${ICON_ARROW_UP_RIGHT_SVG}</button>
        </div>
    `;
}

// ---------- Section shells ----------
// Built once per kind and then left alone. Re-rendering this markup on
// every keystroke would replace the search <input> under the cursor and
// throw away focus and caret position mid-word.

function docSectionHtml(kind, label) {
    return `
        <section class="doc-section" data-kind="${kind}">
            <button class="doc-section-head" type="button" data-role="disclose"
                    aria-expanded="false" aria-controls="doc-body-${kind}">
                <span class="settings-caret" aria-hidden="true">${ICON_CHEVRON_RIGHT_SVG}</span>
                <span class="doc-section-title">${escapeAttr(label)}</span>
                <span class="doc-section-count" id="doc-count-${kind}"></span>
            </button>

            <div class="doc-section-body" id="doc-body-${kind}">
                <div class="doc-section-inner">
                    <div class="panel">
                        <div class="doc-controls">
                            <div class="doc-search">
                                <span class="overview-search-icon">
                                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21 21-4.34-4.34"></path><circle cx="11" cy="11" r="8"></circle></svg>
                                </span>
                                <input type="text" data-role="search" id="doc-search-${kind}" placeholder="Search ${escapeAttr(label)}" autocomplete="off">
                            </div>
                            <div class="doc-filters" id="doc-group-filters-${kind}"></div>
                            <div class="doc-filters doc-filters-right" id="doc-year-filters-${kind}"></div>
                        </div>
                        <p class="doc-status" id="doc-status-${kind}"></p>
                        <div class="doc-list" id="doc-list-${kind}"></div>
                    </div>
                    <div class="notes-foot">
                        <button class="btn-text" type="button" data-role="expand" id="doc-expand-${kind}" style="display:none;">Show more</button>
                    </div>
                </div>
            </div>
        </section>
    `;
}

function renderDocSections() {
    const host = $("doc-sections");
    const wanted = docKinds.map((k) => k.kind).join(",");
    if (host.dataset.built === wanted) return;
    host.innerHTML = docKinds.map((k) => docSectionHtml(k.kind, k.label)).join("");
    host.dataset.built = wanted;
    docKinds.forEach((k) => applyDocDisclosure(k.kind));
}

// ---------- Disclosure ----------
// grid-template-rows 0fr -> 1fr, so a section of any length animates open
// without JavaScript measuring it - and without a max-height guess that is
// either too small (clipping a long list) or too big (a slow start on a
// short one).

function applyDocDisclosure(kind) {
    const view = docViewFor(kind);
    const section = document.querySelector(`.doc-section[data-kind="${kind}"]`);
    if (!section) return;
    section.classList.toggle("open", view.open);
    section.querySelector("[data-role='disclose']").setAttribute("aria-expanded", String(view.open));
}

function toggleDocSection(kind) {
    const view = docViewFor(kind);
    view.open = !view.open;
    applyDocDisclosure(kind);
}

// ---------- List ----------

function renderDocList(kind) {
    const view = docViewFor(kind);
    const list = $(`doc-list-${kind}`);
    const expandBtn = $(`doc-expand-${kind}`);
    if (!list) return;
    const all = docFilesOfKind(kind);
    const files = docVisibleFiles(kind);

    $(`doc-count-${kind}`).textContent = all.length || "";

    if (!all.length) {
        // An empty list is nearly always "never configured" rather than
        // "nothing matched", so the empty state offers the fix.
        list.innerHTML = `<button type="button" class="empty-action" data-role="open-settings">+ Set a folder for this</button>`;
        expandBtn.style.display = "none";
        return;
    }
    if (!files.length) {
        list.innerHTML = `<p class="muted doc-empty">Nothing matches that.</p>`;
        expandBtn.style.display = "none";
        return;
    }

    const shown = view.expanded ? files : files.slice(0, DOC_PAGE_SIZE);
    const hidden = files.length - shown.length;

    // Always one flat list. Grouping lives in the filter chips instead: the
    // headers only ever appeared under "All", which is exactly the view
    // where you are scanning every file at once, and a folder tree that
    // happens to hold one file per folder turned that into a header above
    // every single row. Files still arrive sorted by group, so a client's
    // files stay adjacent - they just are not fenced off from each other.
    list.innerHTML = shown.map(docRowHtml).join("");

    expandBtn.style.display = hidden > 0 || view.expanded ? "" : "none";
    expandBtn.textContent = view.expanded ? "Show less" : `Show ${hidden} more`;
}

function renderDocFilters(kind) {
    const view = docViewFor(kind);
    const files = docFilesOfKind(kind);
    const years = Array.from(new Set(files.map((f) => String(f.year)))).sort().reverse();
    $(`doc-group-filters-${kind}`).innerHTML = docIsGrouped(kind)
        ? ["All", ...docGroupsOf(kind)]
            .map((g) => `<button type="button" class="view-toggle-btn ${g === view.group ? "active" : ""}" data-group="${escapeAttr(g)}">${escapeAttr(g)}</button>`)
            .join("")
        : "";
    $(`doc-year-filters-${kind}`).innerHTML = years.length > 1
        ? ["All", ...years].map((y) => `<button type="button" class="view-toggle-btn ${y === view.year ? "active" : ""}" data-year="${y}">${y}</button>`).join("")
        : "";
}

function renderDocKind(kind) {
    renderDocFilters(kind);
    renderDocList(kind);
    $(`doc-status-${kind}`).textContent = docViewFor(kind).status;
}

async function refreshDocuments() {
    const resp = await fetch("/api/documents/files");
    if (!resp.ok) return;
    const data = await resp.json();
    docFiles = data.files || [];
    docTags = data.tags || [];
    docKinds = data.kinds || [];
    renderDocSections();
    docKinds.forEach((k) => renderDocKind(k.kind));
}

// ---------- Events ----------
// All delegated from the one host, because the sections themselves are
// rebuilt from a template and their lists are replaced on every filter.

function docKindOf(el) {
    const section = el.closest(".doc-section");
    return section ? section.dataset.kind : null;
}

$("doc-sections").addEventListener("input", (e) => {
    const input = e.target.closest("[data-role='search']");
    if (!input) return;
    const kind = docKindOf(input);
    const view = docViewFor(kind);
    view.query = input.value;
    view.expanded = false;
    renderDocList(kind);
});

$("doc-sections").addEventListener("click", async (e) => {
    const kind = docKindOf(e.target);
    if (!kind) return;
    const view = docViewFor(kind);

    if (e.target.closest("[data-role='disclose']")) {
        toggleDocSection(kind);
        return;
    }
    if (e.target.closest("[data-role='open-settings']")) {
        openSettingsModal();
        return;
    }
    if (e.target.closest("[data-role='expand']")) {
        view.expanded = !view.expanded;
        if (!view.expanded) {
            window.scrollTo({ top: documentTopOf($(`doc-list-${kind}`)) - 90, behavior: "smooth" });
        }
        renderDocList(kind);
        return;
    }

    const groupBtn = e.target.closest("[data-group]");
    if (groupBtn) {
        view.group = groupBtn.dataset.group;
        view.expanded = false;
        renderDocFilters(kind);
        renderDocList(kind);
        return;
    }
    const yearBtn = e.target.closest("[data-year]");
    if (yearBtn) {
        view.year = yearBtn.dataset.year;
        view.expanded = false;
        renderDocFilters(kind);
        renderDocList(kind);
        return;
    }

    const row = e.target.closest(".doc-row");
    if (!row) return;
    const id = Number(row.dataset.id);

    const tagBtn = e.target.closest("[data-role='tag']");
    if (tagBtn) {
        openDocTagPopover(tagBtn, id);
        return;
    }
    const reveal = !!e.target.closest("[data-role='reveal']");
    const resp = await fetch("/api/documents/open", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, reveal }),
    });
    if (!resp.ok) {
        const err = await resp.json().catch(() => ({}));
        view.status = err.detail || "Could not open that file.";
        $(`doc-status-${kind}`).textContent = view.status;
    }
});

// ---------- Rescan ----------

const DOC_SCAN_REASONS = {
    no_path: "No folder set yet - open Settings to choose one.",
    not_found: "That folder no longer exists.",
    not_a_folder: "That path is a file, not a folder.",
    unreadable: "VAIO cannot read that folder. Check its permissions.",
    no_terms: "Add at least one search term in Settings.",
};

function docScanMessage(result) {
    // A folder that cannot be read says so. Reporting "0 files" instead
    // would be indistinguishable from a term that matched nothing.
    if (!result.ok) return DOC_SCAN_REASONS[result.reason] || "Could not scan that folder.";
    return `${result.indexed} indexed`
        + (result.added ? `, ${result.added} new` : "")
        + (result.missing ? `, ${result.missing} missing` : "");
}

// Each kind reports into its own status line: one shared line would have to
// pick a winner between "37 indexed" and "that folder no longer exists".
async function rescanDocuments(kind) {
    const targets = kind ? [kind] : docKinds.map((k) => k.kind);
    targets.forEach((k) => {
        docViewFor(k).status = "Scanning…";
        const el = $(`doc-status-${k}`);
        if (el) el.textContent = "Scanning…";
    });
    const resp = await fetch("/api/documents/rescan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: kind || null }),
    });
    const data = await resp.json();
    (data.results || []).forEach((result) => {
        docViewFor(result.kind).status = docScanMessage(result);
    });
    await refreshDocuments();
}

$("doc-rescan-btn").addEventListener("click", async () => {
    const btn = $("doc-rescan-btn");
    btn.disabled = true;
    await rescanDocuments(null);
    btn.disabled = false;
});

// ---------- Tags ----------
// Reuses the app's one colour picker rather than growing a second one.
// Tags are shared across both kinds on purpose: "Paid" means the same thing
// whether it is on an invoice or an NF, and a per-kind vocabulary would
// mean maintaining the same list twice.

let _docTagPopover = null;

function closeDocTagPopover() {
    if (!_docTagPopover) return;
    _docTagPopover.remove();
    _docTagPopover = null;
    document.removeEventListener("click", _onDocTagOutside);
}

function _onDocTagOutside(e) {
    if (!_docTagPopover) return;
    // The color picker opens as a second .popover-panel on top of this one.
    // Without this guard, picking a swatch closes the tag popover out from
    // under the click that was meant to recolor a tag inside it.
    if (e.target.closest(".color-preset-popover")) return;
    if (_docTagPopover.contains(e.target) || e.target.closest("[data-role='tag']")) return;
    closeDocTagPopover();
}

function openDocTagPopover(trigger, fileId) {
    closeDocTagPopover();
    const file = docFiles.find((f) => f.id === fileId);
    if (!file) return;
    const active = new Set(file.tags.map((t) => t.id));
    const rect = trigger.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel doc-tag-popover open";
    panel.style.left = Math.min(rect.left, window.innerWidth - 230) + "px";
    panel.style.top = rect.bottom + 6 + "px";
    panel.innerHTML = `
        ${docTags.map((t) => `
            <label class="doc-tag-option">
                <input type="checkbox" data-tag-id="${t.id}" ${active.has(t.id) ? "checked" : ""}>
                <button type="button" class="doc-tag-dot" data-color-tag="${t.id}" title="Tag color" style="background:${t.color || "var(--border)"};"></button>
                <span class="doc-tag-name">${escapeAttr(t.name)}</span>
                <button type="button" class="doc-tag-delete" data-delete-tag="${t.id}" title="Delete tag">${ICON_TRASH_SVG}</button>
            </label>
        `).join("")}
        <div class="doc-tag-new">
            <input type="text" id="doc-tag-new-input" placeholder="New tag" autocomplete="off">
        </div>
    `;
    document.body.appendChild(panel);
    _docTagPopover = panel;

    panel.querySelectorAll("input[data-tag-id]").forEach((box) => {
        box.addEventListener("change", async () => {
            const ids = Array.from(panel.querySelectorAll("input[data-tag-id]:checked"))
                .map((b) => Number(b.dataset.tagId));
            await fetch(`/api/documents/files/${fileId}/tags`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ tag_ids: ids }),
            });
            await refreshDocuments();
        });
    });

    // The app's one color picker, opened from the dot - a second picker
    // just for tags is exactly the kind of duplicate this codebase keeps
    // out. The label doubles as the checkbox, so the click has to be
    // stopped before it toggles the tag off on the way past.
    panel.querySelectorAll("[data-color-tag]").forEach((dot) => {
        dot.addEventListener("click", (e) => {
            e.preventDefault();
            e.stopPropagation();
            const tagId = Number(dot.dataset.colorTag);
            const tag = docTags.find((t) => t.id === tagId);
            const save = async (color) => {
                await fetch(`/api/documents/tags/${tagId}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ color }),
                });
                dot.style.background = color || "var(--border)";
                if (tag) tag.color = color;
                await refreshDocuments();
            };
            openColorPresetPopover(dot, tag ? tag.color : null, {
                onChange: (hex) => save(hex),
                onClear: () => save(null),
            });
        });
    });

    panel.querySelectorAll("[data-delete-tag]").forEach((btn) => {
        btn.addEventListener("click", async (e) => {
            e.preventDefault();
            e.stopPropagation();
            const ok = await confirmDialog("It is removed from every document that has it.", { title: "Delete this tag?" });
            if (!ok) return;
            await fetch(`/api/documents/tags/${btn.dataset.deleteTag}`, { method: "DELETE" });
            closeDocTagPopover();
            await refreshDocuments();
        });
    });

    const newInput = panel.querySelector("#doc-tag-new-input");
    newInput.addEventListener("keydown", async (e) => {
        if (e.key !== "Enter") return;
        const name = newInput.value.trim();
        if (!name) return;
        const tag = await (await fetch("/api/documents/tags", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ name }),
        })).json();
        const ids = Array.from(panel.querySelectorAll("input[data-tag-id]:checked"))
            .map((b) => Number(b.dataset.tagId));
        ids.push(tag.id);
        await fetch(`/api/documents/files/${fileId}/tags`, {
            method: "PUT",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ tag_ids: ids }),
        });
        closeDocTagPopover();
        await refreshDocuments();
    });

    setTimeout(() => document.addEventListener("click", _onDocTagOutside));
}

// ---------- Settings ----------

function settingsSignature(path, terms) {
    // \u0000 as the separator, written as an escape rather than typed:
    // it cannot occur in a path or a search term, so no pair of real
    // values can collide into the same signature.
    return (path || "").trim() + "\u0000" + (terms || "").trim();
}

// Changing a folder or its terms changes what that kind's index *should*
// hold, so closing Settings rescans the kinds that changed rather than
// leaving the old list on screen - a path you just corrected showing the
// same wrong files reads as a bug. Tracked per kind so fixing the NF path
// does not re-walk the invoice tree for nothing.
const _settingsAsOpened = {};
const _settingsDirty = new Set();

function settingsKindFieldsHtml(entry) {
    return `
        <div class="settings-kind" data-kind="${entry.kind}">
            <p class="settings-kind-title">${escapeAttr(entry.label)}</p>
            <div class="settings-field">
                <label class="settings-label" for="settings-path-${entry.kind}">Folder</label>
                <input type="text" id="settings-path-${entry.kind}" class="settings-input" data-role="path"
                       placeholder="/Users/you/Work/Clients" spellcheck="false" value="${escapeAttr(entry.documents_path || "")}">
            </div>
            <div class="settings-field">
                <label class="settings-label" for="settings-terms-${entry.kind}">Search for</label>
                <input type="text" id="settings-terms-${entry.kind}" class="settings-input" data-role="terms"
                       placeholder="${entry.kind === "nf" ? "NF, Nota Fiscal" : "Invoice, Fatura"}" spellcheck="false" value="${escapeAttr(entry.documents_terms || "")}">
            </div>
            <p class="settings-preview" id="settings-preview-${entry.kind}"></p>
        </div>
    `;
}

async function openSettingsModal() {
    const data = await (await fetch("/api/documents/settings")).json();
    const entries = data.kinds || [];
    // One reassurance for the whole group rather than one per field: it is
    // the same promise about every folder named here, and repeating it four
    // times is the clutter this group exists to avoid.
    $("settings-docs-fields").innerHTML =
        `<p class="settings-hint">VAIO only ever reads these folders &mdash; nothing inside them is moved, renamed or deleted. A PDF matches if any search term appears in its filename or in any folder above it; separate terms with commas.</p>`
        + entries.map(settingsKindFieldsHtml).join("");
    entries.forEach((entry) => {
        _settingsAsOpened[entry.kind] = settingsSignature(entry.documents_path, entry.documents_terms);
        paintSettingsPreview(entry.kind, entry.preview);
    });
    _settingsDirty.clear();
    $("settings-modal-backdrop").style.display = "flex";
}

function closeSettingsModal() {
    closeModalAnimated($("settings-modal-backdrop"), async () => {
        if (_settingsDirty.size) {
            const kinds = Array.from(_settingsDirty);
            _settingsDirty.clear();
            for (const kind of kinds) await rescanDocuments(kind);
        } else {
            refreshDocuments();
        }
    });
}

// The Documents group is a disclosure, same as the page's own sections -
// closed on open, so Settings is a short list of what can be configured
// rather than a wall of every field at once.
function toggleSettingsGroup() {
    const head = $("settings-docs-toggle");
    const open = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", String(open));
    head.closest(".settings-group").classList.toggle("open", open);
    if (open) {
        const first = $("settings-docs-fields").querySelector("input");
        if (first) first.focus();
    }
}

// Answering with a count while the field is still on screen is the point of
// this: otherwise a search term can only be judged by the list it produces,
// and a term that quietly missed half the folder looks like a correct one.
function paintSettingsPreview(kind, preview) {
    const el = $(`settings-preview-${kind}`);
    if (!el) return;
    if (!preview) { el.textContent = ""; return; }
    if (preview.ok) {
        // A readable folder that matched nothing is still a problem to fix,
        // and reporting "0 PDFs" in the same green as a working search
        // makes a wrong term look like a correct one.
        el.className = "settings-preview " + (preview.files ? "is-ok" : "is-warn");
        el.textContent = preview.files
            ? `Matches ${preview.folders} folder${preview.folders === 1 ? "" : "s"}, ${preview.files} PDF${preview.files === 1 ? "" : "s"}.`
            : "That folder is readable, but nothing in it matches those terms.";
    } else {
        el.className = "settings-preview is-warn";
        el.textContent = DOC_SCAN_REASONS[preview.reason] || "Check the folder and search terms.";
    }
}

async function saveSettingsKind(kind) {
    const block = $("settings-docs-fields").querySelector(`.settings-kind[data-kind="${kind}"]`);
    if (!block) return;
    const data = await (await fetch("/api/documents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            kind,
            documents_path: block.querySelector("[data-role='path']").value,
            documents_terms: block.querySelector("[data-role='terms']").value,
        }),
    })).json();
    // Compared against what the server stored, not against the field, so a
    // blur with no edit (and the server's own trimming) is not a change.
    if (settingsSignature(data.documents_path, data.documents_terms) !== _settingsAsOpened[kind]) {
        _settingsDirty.add(kind);
    }
    paintSettingsPreview(kind, data.preview);
}

$("settings-open-btn").addEventListener("click", openSettingsModal);
$("settings-modal-close").addEventListener("click", closeSettingsModal);
$("settings-docs-toggle").addEventListener("click", toggleSettingsGroup);
$("settings-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "settings-modal-backdrop") closeSettingsModal();
});

// Delegated: the fields are rebuilt from the server's kind list every time
// Settings opens, so nothing can be bound to them directly.
$("settings-docs-fields").addEventListener("blur", (e) => {
    const block = e.target.closest(".settings-kind");
    if (block && e.target.matches("input")) saveSettingsKind(block.dataset.kind);
}, true);

$("settings-docs-fields").addEventListener("keydown", (e) => {
    if (e.key === "Enter" && e.target.matches("input")) e.target.blur();
});

document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("settings-modal-backdrop").style.display === "none") return;
    if (document.querySelector(".popover-panel.open")) return;
    closeSettingsModal();
});
