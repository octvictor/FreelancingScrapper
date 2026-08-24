// Documents - a browser over a folder of PDFs the user nominates in
// Settings. The app indexes that folder and never writes to it; opening a
// file hands it to the OS rather than rendering it here.
//
// The whole point is beating a file manager, and the way it does that is
// flattening: every invoice from every client in one list, filtered by
// typing rather than by walking a tree. So search filters the already-
// loaded index in memory and never touches the disk - the only thing that
// reads the folder is an explicit Rescan.

let docFiles = [];
let docTags = [];
let docQuery = "";
let docGroup = "All";
let docYear = "All";
let docExpanded = false;

const DOC_ROW_MIN = 4;

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

function docVisibleFiles() {
    const q = docQuery.trim().toLowerCase();
    return docFiles.filter((f) =>
        docMatchesQuery(f, q) &&
        (docGroup === "All" || (f.group_name || "Ungrouped") === docGroup) &&
        (docYear === "All" || String(f.year) === docYear)
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
            <button class="doc-row-action" data-role="tag" type="button" title="Tags">&#9733;</button>
            <button class="doc-row-action" data-role="reveal" type="button" title="Show in folder">&#8599;</button>
        </div>
    `;
}

function renderDocList() {
    const list = $("doc-list");
    const files = docVisibleFiles();

    if (!docFiles.length) {
        // An empty list is nearly always "never configured" rather than
        // "nothing matched", so the empty state offers the fix.
        list.innerHTML = `<button type="button" class="empty-action" id="doc-empty-settings">+ Set a documents folder</button>`;
        $("doc-empty-settings").addEventListener("click", openSettingsModal);
        // The status line is deliberately left alone: a rescan that failed
        // sets it and then refreshes, and an empty index is exactly when
        // "that folder no longer exists" is the thing you need to still see.
        $("doc-expand-btn").style.display = "none";
        return;
    }
    if (!files.length) {
        list.innerHTML = `<p class="muted doc-empty">Nothing matches that.</p>`;
        $("doc-expand-btn").style.display = "none";
        return;
    }

    // Grouped only when no group filter is active - once you have picked
    // one client, a single header above the whole list says nothing.
    if (docGroup === "All") {
        const groups = new Map();
        files.forEach((f) => {
            const key = f.group_name || "Ungrouped";
            if (!groups.has(key)) groups.set(key, []);
            groups.get(key).push(f);
        });
        list.innerHTML = Array.from(groups.entries())
            .map(([name, rows]) => `
                <div class="doc-group">
                    <div class="doc-group-head">${escapeAttr(name)}<span class="doc-group-count">${rows.length}</span></div>
                    ${rows.map(docRowHtml).join("")}
                </div>
            `).join("");
    } else {
        list.innerHTML = files.map(docRowHtml).join("");
    }

    applyDocFit();
}

// Same fit-to-window cap every long list in the app uses: render what fits
// the window rather than a fixed number, with an expand for the rest.
function applyDocFit() {
    const list = $("doc-list");
    const btn = $("doc-expand-btn");
    if (!list) return;
    // Everything inside display:none measures zero, so a fit run while the
    // page is hidden (closing Settings from another page refreshes this one)
    // would decide that nothing fits and hide every row. showPage refreshes
    // on the way in, so skipping here costs nothing.
    if ($("page-documents").style.display === "none") return;
    const rows = Array.from(list.querySelectorAll(".doc-row"));
    if (docExpanded) {
        rows.forEach((r) => { r.style.display = ""; });
        btn.style.display = rows.length ? "" : "none";
        btn.textContent = "Show less";
        return;
    }
    const shown = applyRowFit(list, ".doc-row", { reserve: 60, min: DOC_ROW_MIN });
    const hidden = rows.length - shown;
    btn.style.display = hidden > 0 ? "" : "none";
    btn.textContent = hidden > 0 ? `Show ${hidden} more` : "Show more";
    // A group whose every row got capped away would leave a stray header.
    list.querySelectorAll(".doc-group").forEach((g) => {
        const anyVisible = Array.from(g.querySelectorAll(".doc-row")).some((r) => r.style.display !== "none");
        g.style.display = anyVisible ? "" : "none";
    });
}

function renderDocFilters() {
    const groups = Array.from(new Set(docFiles.map((f) => f.group_name || "Ungrouped"))).sort();
    const years = Array.from(new Set(docFiles.map((f) => String(f.year)))).sort().reverse();
    $("doc-group-filters").innerHTML = ["All", ...groups]
        .map((g) => `<button type="button" class="view-toggle-btn ${g === docGroup ? "active" : ""}" data-group="${escapeAttr(g)}">${escapeAttr(g)}</button>`)
        .join("");
    $("doc-year-filters").innerHTML = years.length > 1
        ? ["All", ...years].map((y) => `<button type="button" class="view-toggle-btn ${y === docYear ? "active" : ""}" data-year="${y}">${y}</button>`).join("")
        : "";
}

async function refreshDocuments() {
    const resp = await fetch("/api/documents/files");
    if (!resp.ok) return;
    const data = await resp.json();
    docFiles = data.files || [];
    docTags = data.tags || [];
    renderDocFilters();
    renderDocList();
}

$("doc-search-input").addEventListener("input", (e) => {
    docQuery = e.target.value;
    docExpanded = false;
    renderDocList();
});

$("doc-group-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-group]");
    if (!btn) return;
    docGroup = btn.dataset.group;
    docExpanded = false;
    renderDocFilters();
    renderDocList();
});

$("doc-year-filters").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-year]");
    if (!btn) return;
    docYear = btn.dataset.year;
    docExpanded = false;
    renderDocFilters();
    renderDocList();
});

$("doc-expand-btn").addEventListener("click", () => {
    docExpanded = !docExpanded;
    if (!docExpanded) window.scrollTo({ top: documentTopOf($("doc-list")) - 90, behavior: "smooth" });
    applyDocFit();
});

$("doc-list").addEventListener("click", async (e) => {
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
        $("doc-status").textContent = err.detail || "Could not open that file.";
    }
});

$("doc-rescan-btn").addEventListener("click", async () => {
    const btn = $("doc-rescan-btn");
    btn.disabled = true;
    $("doc-status").textContent = "Scanning…";
    const resp = await fetch("/api/documents/rescan", { method: "POST" });
    const data = await resp.json();
    btn.disabled = false;
    // A folder that cannot be read says so. Reporting "0 files" instead
    // would be indistinguishable from a term that matched nothing.
    $("doc-status").textContent = data.ok
        ? `${data.indexed} indexed${data.added ? `, ${data.added} new` : ""}${data.missing ? `, ${data.missing} missing` : ""}`
        : DOC_SCAN_REASONS[data.reason] || "Could not scan that folder.";
    await refreshDocuments();
});

const DOC_SCAN_REASONS = {
    no_path: "No documents folder set yet - open Settings to choose one.",
    not_found: "That folder no longer exists.",
    not_a_folder: "That path is a file, not a folder.",
    unreadable: "VAIO cannot read that folder. Check its permissions.",
    no_terms: "Add at least one search term in Settings.",
};

// ---------- Tags ----------
// Reuses the app's one colour picker rather than growing a second one.

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
                <button type="button" class="doc-tag-delete" data-delete-tag="${t.id}" title="Delete tag">&times;</button>
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
    return (path || "").trim() + "\u0000" + (terms || "").trim();
}

async function openSettingsModal() {
    const data = await (await fetch("/api/documents/settings")).json();
    _settingsAsOpened = settingsSignature(data.documents_path, data.documents_terms);
    _settingsDirty = false;
    $("settings-docs-path").value = data.documents_path || "";
    $("settings-docs-terms").value = data.documents_terms || "";
    paintSettingsPreview(data.preview);
    $("settings-modal-backdrop").style.display = "flex";
    $("settings-docs-path").focus();
}

// Changing the folder or the terms changes what the index *should* hold, so
// closing Settings rescans rather than leaving the old list on screen - a
// path you just corrected showing the same wrong files reads as a bug.
let _settingsDirty = false;
let _settingsAsOpened = "";

function closeSettingsModal() {
    closeModalAnimated($("settings-modal-backdrop"), async () => {
        if (_settingsDirty) {
            _settingsDirty = false;
            $("doc-status").textContent = "Scanning\u2026";
            const data = await (await fetch("/api/documents/rescan", { method: "POST" })).json();
            $("doc-status").textContent = data.ok
                ? `${data.indexed} indexed${data.added ? `, ${data.added} new` : ""}${data.missing ? `, ${data.missing} missing` : ""}`
                : DOC_SCAN_REASONS[data.reason] || "Could not scan that folder.";
        }
        refreshDocuments();
    });
}

// Answering with a count while the field is still on screen is the point of
// this: otherwise a search term can only be judged by the list it produces,
// and a term that quietly missed half the folder looks like a correct one.
function paintSettingsPreview(preview) {
    const el = $("settings-preview");
    if (!preview) { el.textContent = ""; return; }
    if (preview.ok) {
        el.className = "settings-preview is-ok";
        el.textContent = `Matches ${preview.folders} folder${preview.folders === 1 ? "" : "s"}, ${preview.files} PDF${preview.files === 1 ? "" : "s"}.`;
    } else {
        el.className = "settings-preview is-warn";
        el.textContent = DOC_SCAN_REASONS[preview.reason] || "Check the folder and search terms.";
    }
}

async function saveSettings() {
    const data = await (await fetch("/api/documents/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            documents_path: $("settings-docs-path").value,
            documents_terms: $("settings-docs-terms").value,
        }),
    })).json();
    // Compared against what the server stored, not against the field, so a
    // blur with no edit (and the server's own trimming) is not a change.
    if (settingsSignature(data.documents_path, data.documents_terms) !== _settingsAsOpened) {
        _settingsDirty = true;
    }
    paintSettingsPreview(data.preview);
}

$("settings-open-btn").addEventListener("click", openSettingsModal);
$("settings-modal-close").addEventListener("click", closeSettingsModal);
$("settings-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "settings-modal-backdrop") closeSettingsModal();
});
["settings-docs-path", "settings-docs-terms"].forEach((id) => {
    $(id).addEventListener("blur", saveSettings);
    $(id).addEventListener("keydown", (e) => {
        if (e.key === "Enter") e.target.blur();
    });
});
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("settings-modal-backdrop").style.display === "none") return;
    if (document.querySelector(".popover-panel.open")) return;
    closeSettingsModal();
});

onRowFitResize(() => {
    if ($("page-documents").style.display !== "none") applyDocFit();
});
