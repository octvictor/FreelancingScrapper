// Notes tool - Google Keep-style cards in a responsive masonry grid
// (see .notes-grid in app.css: CSS multi-column layout with
// column-width, not a fixed column-count, so it reflows on its own as
// the window resizes). Each card is directly editable in place - no
// modal - and can be dragged to reorder, same grip-handle pattern as
// Project Manager's rows, generalized from a table row to a card div.
// $()/confirmDialog come from nav.js, escapeAttr from gatherer.js.

let notes = [];
let draggedNote = null;

const NOTE_COLORS = ["#1f2f3d", "#1c3324", "#3a2f14", "#3a1f1f", "#2a1f3a", "#3a1f2f"];

function autoGrowTextarea(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

// ---------- Cards ----------

function noteCardHtml(note) {
    const bg = note.color || "var(--panel-alt)";
    return `
        <div class="note-card" data-id="${note.id}" style="background:${bg};">
            <span class="note-drag-handle" title="Drag to reorder">&#8942;</span>
            <input type="text" class="note-title-input" placeholder="Title" value="${escapeAttr(note.title)}">
            <textarea class="note-body-input" placeholder="Take a note..." rows="1">${escapeAttr(note.body || "")}</textarea>
            <div class="note-card-footer">
                <button class="swatch-btn" data-role="color" type="button" title="Note color" style="background:${note.color || "transparent"};"></button>
                <button class="row-delete-btn" data-role="delete" title="Delete note">&times;</button>
            </div>
        </div>
    `;
}

function renderNotes() {
    $("notes-grid").innerHTML = notes.map(noteCardHtml).join("");
    document.querySelectorAll("#notes-grid .note-card").forEach(wireNoteCard);
}

function wireNoteCard(card) {
    const noteId = parseInt(card.dataset.id, 10);

    const titleInput = card.querySelector(".note-title-input");
    titleInput.addEventListener("blur", () => saveNoteField(noteId, { title: titleInput.value.trim() }));

    const bodyInput = card.querySelector(".note-body-input");
    autoGrowTextarea(bodyInput);
    bodyInput.addEventListener("input", () => autoGrowTextarea(bodyInput));
    bodyInput.addEventListener("blur", () => saveNoteField(noteId, { body: bodyInput.value.trim() || null }));

    card.querySelector("[data-role='delete']").addEventListener("click", async () => {
        if (!(await confirmDialog("This can't be undone.", { title: "Delete this note?" }))) return;
        await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
        notes = notes.filter((n) => n.id !== noteId);
        renderNotes();
    });

    card.querySelector("[data-role='color']").addEventListener("click", (e) => {
        e.stopPropagation();
        openNoteColorPopover(card, noteId);
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
    renderNotes();
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
    panel.className = "color-popover open";
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
// plain vertical list.

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
    const ids = Array.from(document.querySelectorAll("#notes-grid .note-card")).map((c) => parseInt(c.dataset.id, 10));
    await fetch("/api/notes/reorder", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
    });
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
}

// ---------- Compose card ----------
// A persistent "Take a note..." card, Keep-style: type into it, click
// anywhere outside (title and body share one focus group, so tabbing
// between them doesn't count as "outside"), and it creates the note
// then clears itself for the next one. Typing nothing and clicking
// away creates nothing.

async function commitComposeNote() {
    const title = $("note-compose-title").value.trim();
    const body = $("note-compose-body").value.trim();
    if (!title && !body) return;

    const created = await (await fetch("/api/notes", { method: "POST" })).json();
    const resp = await fetch(`/api/notes/${created.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, body: body || null }),
    });
    const updated = await resp.json();
    notes.unshift(updated);
    renderNotes();

    $("note-compose-title").value = "";
    $("note-compose-body").value = "";
    autoGrowTextarea($("note-compose-body"));
}

$("note-compose").addEventListener("focusout", () => {
    setTimeout(() => {
        if (!$("note-compose").contains(document.activeElement)) {
            commitComposeNote();
        }
    });
});

$("note-compose-body").addEventListener("input", () => autoGrowTextarea($("note-compose-body")));

(async function initNotes() {
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
    renderNotes();
})();
