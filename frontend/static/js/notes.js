// Notes tool - Google Keep-style cards in a responsive masonry grid
// (see .notes-grid in app.css: CSS multi-column layout with
// column-width, not a fixed column-count, so it reflows on its own as
// the window resizes). A note is either "text" (title + freeform body)
// or "list" (title + a checkbox checklist, same .checklist-item markup
// as To Do's Steps). Cards in the grid are read-only previews - all
// real editing happens in a detail modal, opened by clicking the card
// (mirroring how Tracker/To Do already open a modal for full editing),
// with two quick actions available straight from the card without
// opening it: checking a list item, and changing the color. Cards can
// be dragged by a grip handle to reorder, same pattern as Project
// Manager's rows generalized from a table row to a card div.
// $()/confirmDialog come from nav.js, escapeAttr from gatherer.js.

let notes = [];
let draggedNote = null;
let activeNoteId = null;

const NOTE_COLORS = SWATCH_COLORS_MUTED;
const NOTE_COLOR_GLYPH = "&#9681;";

// ---------- Card previews ----------

function noteItemHtml(item) {
    return `
        <div class="checklist-item ${item.checked ? "checked" : ""}" data-id="${item.id}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? "checked" : ""}>
            <input type="text" class="cell-input checklist-text" data-field="text" placeholder="List item" value="${escapeAttr(item.text)}">
            <button class="row-delete-btn" data-role="delete-item" title="Delete item">&times;</button>
        </div>
    `;
}

const PREVIEW_ITEM_LIMIT = 6;

function notePreviewContentHtml(note) {
    if (note.type === "list") {
        const items = note.items || [];
        const shown = items.slice(0, PREVIEW_ITEM_LIMIT);
        const rows = shown.map((item) => `
            <div class="note-preview-item ${item.checked ? "checked" : ""}">
                <input type="checkbox" class="checklist-checkbox" data-item-id="${item.id}" ${item.checked ? "checked" : ""}>
                <span>${escapeAttr(item.text) || " "}</span>
            </div>
        `).join("");
        const more = items.length > shown.length ? `<div class="note-preview-more">+${items.length - shown.length} more</div>` : "";
        return `<div class="note-preview-items">${rows}${more}</div>`;
    }
    return note.body ? `<div class="note-preview-body">${escapeAttr(note.body)}</div>` : "";
}

function noteCardHtml(note) {
    const bg = note.color || "var(--panel-alt)";
    const titleText = escapeAttr(note.title) || "Untitled note";
    const titleClass = note.title ? "" : "empty";
    return `
        <div class="note-card" data-id="${note.id}" data-type="${note.type}" style="background:${bg};">
            <span class="note-drag-handle" title="Drag to reorder">&#8942;</span>
            <div class="note-card-title ${titleClass}">${titleText}</div>
            ${notePreviewContentHtml(note)}
            <div class="note-card-footer">
                <button class="note-color-btn swatch-btn" data-role="color" type="button" title="Note color">${NOTE_COLOR_GLYPH}</button>
                <button class="row-delete-btn note-delete-btn" data-role="delete" type="button" title="Delete note">&times;</button>
            </div>
        </div>
    `;
}

function renderNotes() {
    const addCardHtml = `
        <button class="note-card note-add-card" id="note-add-btn" type="button" title="Add note">
            <span class="note-add-icon">+</span>
        </button>
    `;
    $("notes-grid").innerHTML = addCardHtml + notes.map(noteCardHtml).join("");
    wireNoteAddCard();
    document.querySelectorAll("#notes-grid .note-card:not(.note-add-card)").forEach(wireNoteCard);
}

// Re-renders just one card from current state - used after edits made
// in the modal (on close) or a quick action on the card itself, so the
// grid never gets torn down as a side effect of an unrelated save.
function refreshNoteCard(noteId) {
    const note = notes.find((n) => n.id === noteId);
    const card = document.querySelector(`#notes-grid .note-card[data-id="${noteId}"]`);
    if (!note || !card) return;
    card.outerHTML = noteCardHtml(note);
    wireNoteCard(document.querySelector(`#notes-grid .note-card[data-id="${noteId}"]`));
}

function wireNoteCard(card) {
    const noteId = parseInt(card.dataset.id, 10);

    card.addEventListener("click", (e) => {
        if (e.target.closest("[data-role='color'], [data-role='delete'], .note-drag-handle, .checklist-checkbox")) return;
        openNoteModal(noteId);
    });

    // Quick action: check off a list item straight from the card preview.
    card.querySelectorAll(".note-preview-item .checklist-checkbox").forEach((checkbox) => {
        checkbox.addEventListener("change", () => {
            const itemId = parseInt(checkbox.dataset.itemId, 10);
            checkbox.closest(".note-preview-item").classList.toggle("checked", checkbox.checked);
            saveNoteItem(noteId, itemId, { checked: checkbox.checked });
        });
    });

    card.querySelector("[data-role='delete']").addEventListener("click", async () => {
        if (!(await confirmDialog("This can't be undone.", { title: "Delete this note?" }))) return;
        await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        notes = notes.filter((n) => n.id !== noteId);
        card.remove();
    });

    card.querySelector("[data-role='color']").addEventListener("click", (e) => {
        e.stopPropagation();
        openNoteColorPopover(e.currentTarget, noteId);
    });

    wireNoteDrag(card);
}

async function saveNoteField(noteId, updates) {
    const resp = await fetch(`/api/notes/${noteId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const idx = notes.findIndex((n) => n.id === updated.id);
    if (idx !== -1) notes[idx] = updated;
}

async function saveNoteItem(noteId, itemId, updates) {
    const resp = await fetch(`/api/notes/${noteId}/items/${itemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(updates),
    });
    if (!resp.ok) return;
    const updated = await resp.json();
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    const idx = note.items.findIndex((it) => it.id === updated.id);
    if (idx !== -1) note.items[idx] = updated;
}

// ---------- Card color popover ----------
// Shared between the card's own color button and the modal's - both
// just pass their trigger button in, so the popover doesn't care which
// context opened it.

let noteColorPopover = null;

function closeNoteColorPopover() {
    if (!noteColorPopover) return;
    noteColorPopover.remove();
    noteColorPopover = null;
    document.removeEventListener("click", onNoteColorPopoverOutsideClick);
}

function onNoteColorPopoverOutsideClick(e) {
    if (noteColorPopover && !noteColorPopover.contains(e.target) && !e.target.closest("[data-role='color']")) {
        closeNoteColorPopover();
    }
}

function openNoteColorPopover(triggerBtn, noteId) {
    closeNoteColorPopover();
    const rect = triggerBtn.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel color-popover open";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + 6 + "px";

    const noneSwatch = document.createElement("button");
    noneSwatch.type = "button";
    noneSwatch.className = "color-swatch none";
    noneSwatch.title = "No color";
    noneSwatch.addEventListener("click", () => setNoteColor(noteId, null));
    panel.appendChild(noneSwatch);

    NOTE_COLORS.forEach((color) => {
        const swatch = document.createElement("button");
        swatch.type = "button";
        swatch.className = "color-swatch";
        swatch.style.background = color;
        swatch.title = color;
        swatch.addEventListener("click", () => setNoteColor(noteId, color));
        panel.appendChild(swatch);
    });

    document.body.appendChild(panel);
    noteColorPopover = panel;
    setTimeout(() => document.addEventListener("click", onNoteColorPopoverOutsideClick));
}

async function setNoteColor(noteId, color) {
    await saveNoteField(noteId, { color });
    closeNoteColorPopover();
    refreshNoteCard(noteId);
}

// ---------- Drag-to-reorder ----------

function wireNoteDrag(card) {
    const handle = card.querySelector(".note-drag-handle");
    handle.addEventListener("mousedown", () => {
        card.draggable = true;
    });

    card.addEventListener("dragstart", (e) => {
        draggedNote = card;
        card.classList.add("dragging");
        e.dataTransfer.effectAllowed = "move";
    });

    card.addEventListener("dragover", (e) => {
        e.preventDefault();
        if (!draggedNote || draggedNote === card) return;
        const rect = card.getBoundingClientRect();
        const midpoint = rect.top + rect.height / 2;
        if (e.clientY < midpoint) {
            card.parentNode.insertBefore(draggedNote, card);
        } else {
            card.parentNode.insertBefore(draggedNote, card.nextSibling);
        }
    });

    card.addEventListener("dragend", () => {
        card.draggable = false;
        card.classList.remove("dragging");
        if (draggedNote === card) {
            draggedNote = null;
            persistNoteOrder();
        }
    });
}

async function persistNoteOrder() {
    const ids = Array.from(document.querySelectorAll("#notes-grid .note-card:not(.note-add-card)")).map((c) => parseInt(c.dataset.id, 10));
    await fetch("/api/notes/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
}

// ---------- Add-note popover ----------
// The "+" tile opens a small popover to pick Text note or List before
// anything is created - a note's type can't change after creation (a
// text note has no items, a list note has no body). Once a type is
// chosen, a blank note is created and its detail modal opens right
// away so title/content get entered in the bigger modal space instead
// of tiny inline fields.

let noteTypePopover = null;

function closeNoteTypePopover() {
    if (!noteTypePopover) return;
    noteTypePopover.remove();
    noteTypePopover = null;
    document.removeEventListener("click", onNoteTypePopoverOutsideClick);
}

function onNoteTypePopoverOutsideClick(e) {
    if (noteTypePopover && !noteTypePopover.contains(e.target) && !e.target.closest("#note-add-btn")) {
        closeNoteTypePopover();
    }
}

function openNoteTypePopover(btn) {
    closeNoteTypePopover();
    const rect = btn.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel note-type-popover open";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + 6 + "px";
    panel.innerHTML = `
        <button type="button" class="note-type-option" data-type="text">
            <span class="note-type-option-icon">&#9998;</span> Text note
        </button>
        <button type="button" class="note-type-option" data-type="list">
            <span class="note-type-option-icon">&#9745;</span> List
        </button>
    `;
    panel.querySelectorAll(".note-type-option").forEach((opt) => {
        opt.addEventListener("click", () => createNote(opt.dataset.type));
    });

    document.body.appendChild(panel);
    noteTypePopover = panel;
    setTimeout(() => document.addEventListener("click", onNoteTypePopoverOutsideClick));
}

function wireNoteAddCard() {
    $("note-add-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        if (noteTypePopover) closeNoteTypePopover();
        else openNoteTypePopover(e.currentTarget);
    });
}

async function createNote(type) {
    closeNoteTypePopover();
    const resp = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type }),
    });
    const created = await resp.json();
    notes.unshift(created);
    renderNotes();
    openNoteModal(created.id);
}

// ---------- Detail modal ----------
// The real editing surface for a note - opened by clicking a card (or
// right after creating one). Autosaves on blur like everywhere else in
// the app; the grid card behind it is only resynced once on close
// (refreshNoteCard), not on every keystroke, since it's hidden the
// whole time the modal is open anyway.

function openNoteModal(noteId) {
    const note = notes.find((n) => n.id === noteId);
    if (!note) return;
    activeNoteId = noteId;

    $("note-modal-title").value = note.title || "";

    if (note.type === "list") {
        $("note-modal-body").style.display = "none";
        $("note-modal-items-section").style.display = "";
        renderNoteModalItems(note.items || []);
    } else {
        $("note-modal-body").style.display = "";
        $("note-modal-body").value = note.body || "";
        $("note-modal-items-section").style.display = "none";
    }

    $("note-modal-backdrop").style.display = "flex";
}

async function closeNoteModal() {
    const noteId = activeNoteId;
    activeNoteId = null;
    $("note-modal-backdrop").style.display = "none";
    if (noteId === null) return;

    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // Save directly from the modal's current input values rather than
    // trusting `notes` as-is: a blur's save may still be in flight
    // (async, fire-and-forget) when the close click lands right after
    // it, and checking stale state below could wrongly judge a note
    // the user just titled as empty and delete it.
    const updates = { title: $("note-modal-title").value.trim() };
    if (note.type !== "list") {
        updates.body = $("note-modal-body").value.trim() || null;
    }
    await saveNoteField(noteId, updates);

    // A note created and closed without ever being given content is
    // just clutter - discard it instead of leaving a blank card, same
    // as the old compose-card flow did.
    const saved = notes.find((n) => n.id === noteId);
    const isEmpty = saved.type === "list"
        ? !saved.title && (!saved.items || saved.items.length === 0)
        : !saved.title && !saved.body;

    if (isEmpty) {
        await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        notes = notes.filter((n) => n.id !== noteId);
        renderNotes();
    } else {
        refreshNoteCard(noteId);
    }
}

$("note-modal-close").addEventListener("click", closeNoteModal);
$("note-modal-backdrop").addEventListener("click", (e) => {
    if (e.target.id === "note-modal-backdrop") closeNoteModal();
});

$("note-modal-title").addEventListener("blur", () => {
    if (activeNoteId === null) return;
    saveNoteField(activeNoteId, { title: $("note-modal-title").value.trim() });
});

$("note-modal-body").addEventListener("blur", () => {
    if (activeNoteId === null) return;
    saveNoteField(activeNoteId, { body: $("note-modal-body").value.trim() || null });
});

$("note-modal-color-btn").addEventListener("click", (e) => {
    e.stopPropagation();
    if (activeNoteId === null) return;
    openNoteColorPopover(e.currentTarget, activeNoteId);
});

$("note-modal-delete-btn").addEventListener("click", async () => {
    if (activeNoteId === null) return;
    if (!(await confirmDialog("This can't be undone.", { title: "Delete this note?" }))) return;
    const noteId = activeNoteId;
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    notes = notes.filter((n) => n.id !== noteId);
    activeNoteId = null;
    $("note-modal-backdrop").style.display = "none";
    document.querySelector(`#notes-grid .note-card[data-id="${noteId}"]`)?.remove();
});

// ---------- Modal list items (mirrors todo.js's Steps pattern) ----------

function renderNoteModalItems(items) {
    $("note-modal-items-list").innerHTML = items.map(noteItemHtml).join("");
    document.querySelectorAll("#note-modal-items-list .checklist-item").forEach(wireNoteModalItemRow);
}

function wireNoteModalItemRow(row) {
    const itemId = parseInt(row.dataset.id, 10);

    const checkbox = row.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", () => {
        row.classList.toggle("checked", checkbox.checked);
        if (activeNoteId !== null) saveNoteItem(activeNoteId, itemId, { checked: checkbox.checked });
    });

    const textInput = row.querySelector(".checklist-text");
    textInput.addEventListener("blur", () => {
        if (activeNoteId !== null) saveNoteItem(activeNoteId, itemId, { text: textInput.value.trim() });
    });
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") textInput.blur();
    });

    row.querySelector("[data-role='delete-item']").addEventListener("click", async () => {
        if (activeNoteId === null) return;
        await fetch(`/api/notes/${activeNoteId}/items/${itemId}`, { method: "DELETE" });
        const note = notes.find((n) => n.id === activeNoteId);
        if (note) note.items = note.items.filter((it) => it.id !== itemId);
        row.remove();
    });

    return textInput;
}

$("note-modal-add-item-btn").addEventListener("click", async () => {
    if (activeNoteId === null) return;
    const resp = await fetch(`/api/notes/${activeNoteId}/items`, { method: "POST" });
    const item = await resp.json();
    const note = notes.find((n) => n.id === activeNoteId);
    if (note) note.items.push(item);
    $("note-modal-items-list").insertAdjacentHTML("beforeend", noteItemHtml(item));
    const row = document.querySelector(`#note-modal-items-list .checklist-item[data-id="${item.id}"]`);
    wireNoteModalItemRow(row).focus();
});

(async function initNotes() {
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
    renderNotes();
})();
