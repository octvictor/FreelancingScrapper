// Notes tool - Google Keep-style cards in a responsive masonry grid
// (see .notes-grid in app.css: CSS multi-column layout with
// column-width, not a fixed column-count, so it reflows on its own as
// the window resizes). A note is either "text" (title + freeform body)
// or "list" (title + a checkbox checklist, same .checklist-item markup
// as To Do's Steps / Personal Projects' Checklist). Cards are directly
// editable in place - no modal - and can be dragged to reorder, same
// grip-handle pattern as Project Manager's rows, generalized from a
// table row to a card div. $()/confirmDialog come from nav.js,
// escapeAttr from gatherer.js.

let notes = [];
let draggedNote = null;

const NOTE_COLORS = ["#1f2f3d", "#1c3324", "#3a2f14", "#3a1f1f", "#2a1f3a", "#3a1f2f"];

function autoGrowTextarea(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

// ---------- Cards ----------

function noteItemHtml(item) {
    return `
        <div class="checklist-item ${item.checked ? "checked" : ""}" data-id="${item.id}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? "checked" : ""}>
            <input type="text" class="cell-input checklist-text" data-field="text" placeholder="List item" value="${escapeAttr(item.text)}">
            <button class="row-delete-btn" data-role="delete-item" title="Delete item">&times;</button>
        </div>
    `;
}

function noteCardHtml(note) {
    const bg = note.color || "var(--panel-alt)";
    const bodyHtml = note.type === "list"
        ? `
            <div class="note-items">${(note.items || []).map(noteItemHtml).join("")}</div>
            <button class="btn note-add-item-btn" data-role="add-item" type="button">+ Add item</button>
        `
        : `<textarea class="note-body-input" placeholder="Take a note..." rows="1">${escapeAttr(note.body || "")}</textarea>`;
    const colorGlyph = note.color ? "" : "&#9681;";

    return `
        <div class="note-card" data-id="${note.id}" data-type="${note.type}" style="background:${bg};">
            <span class="note-drag-handle" title="Drag to reorder">&#8942;</span>
            <input type="text" class="note-title-input" placeholder="Title" value="${escapeAttr(note.title)}">
            ${bodyHtml}
            <div class="note-card-footer">
                <button class="swatch-btn ${note.color ? "" : "swatch-btn-empty"}" data-role="color" type="button" title="Note color" style="background:${note.color || "transparent"};">${colorGlyph}</button>
                <button class="row-delete-btn" data-role="delete" title="Delete note">&times;</button>
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

function wireNoteCard(card) {
    const noteId = parseInt(card.dataset.id, 10);
    const noteType = card.dataset.type;

    const titleInput = card.querySelector(".note-title-input");
    titleInput.addEventListener("blur", () => saveNoteField(noteId, { title: titleInput.value.trim() }));

    if (noteType === "list") {
        card.querySelectorAll(".note-items .checklist-item").forEach((row) => wireNoteItemRow(row, noteId));

        card.querySelector("[data-role='add-item']").addEventListener("click", async () => {
            const resp = await fetch(`/api/notes/${noteId}/items`, { method: "POST" });
            const item = await resp.json();
            const note = notes.find((n) => n.id === noteId);
            if (note) note.items.push(item);
            const container = card.querySelector(".note-items");
            container.insertAdjacentHTML("beforeend", noteItemHtml(item));
            const row = container.querySelector(`.checklist-item[data-id="${item.id}"]`);
            wireNoteItemRow(row, noteId).focus();
        });
    } else {
        const bodyInput = card.querySelector(".note-body-input");
        autoGrowTextarea(bodyInput);
        bodyInput.addEventListener("input", () => autoGrowTextarea(bodyInput));
        bodyInput.addEventListener("blur", () => saveNoteField(noteId, { body: bodyInput.value.trim() || null }));
    }

    card.querySelector("[data-role='delete']").addEventListener("click", async () => {
        if (!(await confirmDialog("This can't be undone.", { title: "Delete this note?" }))) return;
        await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        notes = notes.filter((n) => n.id !== noteId);
        card.remove();
    });

    card.querySelector("[data-role='color']").addEventListener("click", (e) => {
        e.stopPropagation();
        openNoteColorPopover(card, noteId);
    });

    wireNoteDrag(card);
}

// A blur-triggered full renderNotes() here would rebuild the entire grid
// out from under any other card mid-interaction - e.g. clicking "+ Add
// item" on a freshly-titled list note blurs the title field first,
// which would tear down the very card/container the add-item click
// handler is about to write into. So a save only patches this one
// card's DOM in place (currently just the color swatch/background -
// title/body need no visual update since the input already shows what
// was typed), the same "no full re-render" discipline saveNoteItem
// already follows for item rows.
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

    if ("color" in updates) {
        const card = document.querySelector(`#notes-grid .note-card[data-id="${noteId}"]`);
        if (card) {
            card.style.background = updated.color || "var(--panel-alt)";
            const colorBtn = card.querySelector("[data-role='color']");
            colorBtn.style.background = updated.color || "transparent";
            colorBtn.classList.toggle("swatch-btn-empty", !updated.color);
            colorBtn.innerHTML = updated.color ? "" : "&#9681;";
        }
    }
}

// ---------- List-type note items ----------
// Same checkbox-and-title-row pattern as todo.js's Steps (mirrors
// wireTodoStepRow/saveTodoStep) - a per-row PUT on change/blur, no
// full re-render, so editing one row doesn't disturb focus elsewhere
// on the card or grid.

function wireNoteItemRow(row, noteId) {
    const itemId = parseInt(row.dataset.id, 10);

    const checkbox = row.querySelector(".checklist-checkbox");
    checkbox.addEventListener("change", () => {
        row.classList.toggle("checked", checkbox.checked);
        saveNoteItem(noteId, itemId, { checked: checkbox.checked });
    });

    const textInput = row.querySelector(".checklist-text");
    textInput.addEventListener("blur", () => saveNoteItem(noteId, itemId, { text: textInput.value.trim() }));
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") textInput.blur();
    });

    row.querySelector("[data-role='delete-item']").addEventListener("click", async () => {
        await fetch(`/api/notes/${noteId}/items/${itemId}`, { method: "DELETE" });
        const note = notes.find((n) => n.id === noteId);
        if (note) note.items = note.items.filter((it) => it.id !== itemId);
        row.remove();
    });

    return textInput;
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

function openNoteColorPopover(card, noteId) {
    closeNoteColorPopover();
    const btn = card.querySelector("[data-role='color']");
    const rect = btn.getBoundingClientRect();

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
}

// ---------- Drag-to-reorder ----------
// Same grip-handle-armed native drag pattern as Project Manager's rows
// (tracker.js's wireRowDrag), generalized from <tr> to a card <div> -
// CSS columns still render cards in DOM order, so reordering the DOM
// via insertBefore/insertAfter here works the same way it does for a
// plain vertical list. The add-note tile is excluded (never wired,
// never included in the persisted order) so it always stays first.

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
// anything is created - unlike the rest of the app's "create blank,
// then edit" convention, a note's type can't change after creation
// (a text note has no items, a list note has no body), so the type
// has to be chosen up front.

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
    document.querySelector(`#notes-grid .note-card[data-id="${created.id}"] .note-title-input`)?.focus();
}

(async function initNotes() {
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
    renderNotes();
})();
