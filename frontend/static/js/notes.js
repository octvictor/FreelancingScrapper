// Notes tool - Google Keep-style cards in a responsive masonry grid
// (see .notes-grid in app.css: CSS multi-column layout with
// column-width, not a fixed column-count, so it reflows on its own as
// the window resizes). Notes have no title - a note is either "text"
// (a plain freeform body, like a Notepad window) or "list" (a checkbox
// checklist, same .checklist-item markup as To Do's Steps), and its
// type can be switched either way from inside the detail modal
// (toggleNoteType migrates content across: body -> a single item,
// items -> newline-joined body). Cards in the grid are read-only
// previews - all real editing happens in a detail modal, opened by
// clicking the card (mirroring how Tracker/To Do already open a modal
// for full editing) or immediately after creating one, with two quick
// actions available straight from the card without opening it: checking
// a list item, and changing the color. Cards can be dragged by a grip
// handle to reorder, same pattern as Projects's rows generalized
// from a table row to a card div. $()/confirmDialog come from nav.js,
// escapeAttr from gatherer.js.

let notes = [];
let draggedNote = null;
let activeNoteId = null;

// ---------- Card previews ----------

function noteItemHtml(item) {
    return `
        <div class="checklist-item ${item.checked ? "checked" : ""}" data-id="${item.id}">
            <input type="checkbox" class="checklist-checkbox" ${item.checked ? "checked" : ""}>
            <textarea class="cell-input checklist-text" data-field="text" placeholder="List item" rows="1">${escapeAttr(item.text)}</textarea>
            <button class="row-delete-btn" data-role="delete-item" title="Delete item">&times;</button>
        </div>
    `;
}

const PREVIEW_ITEM_LIMIT = 6;

function notePreviewContentHtml(note) {
    if (note.type === "list") {
        const items = note.items || [];
        if (!items.length) return `<div class="note-preview-empty">Empty list</div>`;
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
    return note.body
        ? `<div class="note-preview-body">${escapeAttr(note.body)}</div>`
        : `<div class="note-preview-empty">Empty note</div>`;
}

function noteCardHtml(note) {
    const bg = note.color || "var(--panel)";
    // Several of the shared preset colors are light enough that the
    // app's default (dark) text would be unreadable on them, and the
    // rest are dark enough that it needs to flip the other way instead -
    // note-card-light/-dark pick whichever contrast the chosen color
    // actually needs, rather than assuming one direction.
    const lightClass = note.color ? (colorNeedsDarkText(note.color) ? "note-card-light" : "note-card-dark") : "";
    return `
        <div class="note-card ${lightClass}" data-id="${note.id}" data-type="${note.type}" style="background:${bg};">
            <span class="note-drag-handle" title="Drag to reorder">&#8942;</span>
            ${notePreviewContentHtml(note)}
            <div class="note-card-footer">
                <button class="note-color-btn color-dot-btn" data-role="color" type="button" title="Note color">
                    <span class="color-dot"></span>
                </button>
                <button class="row-delete-btn note-delete-btn" data-role="delete" type="button" title="Delete note">&times;</button>
            </div>
        </div>
    `;
}

// Notes grows without bound like the other tools, so the page shows what
// reaches the bottom of the window and puts the rest behind "Show more".
// The + add card is never hidden - it is the first thing in the grid and
// the only way to create a note from this page.
let notesExpanded = false;

function renderNotes() {
    const addCardHtml = `
        <button class="note-card note-add-card" id="note-add-btn" type="button" title="Add note">
            <span class="note-add-icon">+</span>
        </button>
    `;
    $("notes-grid").innerHTML = addCardHtml + notes.map(noteCardHtml).join("");
    wireNoteAddCard();
    document.querySelectorAll("#notes-grid .note-card:not(.note-add-card)").forEach(wireNoteCard);
    applyNotesFit();
}

function applyNotesFit() {
    const grid = $("notes-grid");
    const cards = Array.from(grid.querySelectorAll(".note-card:not(.note-add-card)"));

    let shown = cards.length;
    if (notesExpanded) {
        cards.forEach((card) => { card.style.display = ""; });
    } else {
        // 44 leaves room for the expand button under the grid.
        shown = applyColumnFit(grid, ".note-card:not(.note-add-card)", { reserve: 44 });
    }

    const btn = $("notes-expand-btn");
    const hidden = cards.length - shown;
    if (notesExpanded) {
        btn.style.display = "";
        btn.textContent = "Show less";
    } else if (hidden > 0) {
        btn.style.display = "";
        btn.textContent = `Show ${hidden} more`;
    } else {
        btn.style.display = "none";
    }
}

$("notes-expand-btn").addEventListener("click", () => {
    notesExpanded = !notesExpanded;
    applyNotesFit();
    // Collapsing from halfway down the expanded list would otherwise leave
    // you staring at the space the list used to occupy.
    if (!notesExpanded) window.scrollTo({ top: 0 });
});

onRowFitResize(() => {
    const page = $("page-notes");
    if (page && page.style.display !== "none") applyNotesFit();
});

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
        const note = notes.find((n) => n.id === noteId);
        openColorPresetPopover(e.currentTarget, note?.color || null, {
            onChange: (hex) => setNoteColor(noteId, hex),
            onClear: () => setNoteColor(noteId, null),
        });
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

// ---------- Card color ----------
// Opens the shared color preset popover (nav.js) - setNoteColor is just
// the save callback it's handed.

async function setNoteColor(noteId, color) {
    await saveNoteField(noteId, { color });
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
        // flipInsert (nav.js) does the same insertBefore, wrapped so every
        // other card slides to its new place instead of jumping there.
        flipInsert(draggedNote, card, e.clientY < midpoint);
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

// ---------- Add a note ----------
// The "+" tile creates a blank text note straight away, no type-picker
// popup first - opens its detail modal directly, like a fresh Notepad
// window. List mode is a toggle inside that modal instead of a choice
// made up front (see toggleNoteType below), so there's nothing to pick
// before you've even started writing.

function wireNoteAddCard() {
    $("note-add-btn").addEventListener("click", (e) => {
        e.stopPropagation();
        createNote();
    });
}

async function createNote() {
    const resp = await fetch("/api/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "text" }),
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

    $("note-modal-type-toggle").classList.toggle("active", note.type === "list");
    $("note-modal-type-toggle").title = note.type === "list" ? "Switch to text" : "Switch to list";

    if (note.type === "list") {
        $("note-modal-body").style.display = "none";
        $("note-modal-items-wrap").style.display = "";
        renderNoteModalItems(note.items || []);
    } else {
        $("note-modal-body").style.display = "";
        $("note-modal-body").value = note.body || "";
        $("note-modal-items-wrap").style.display = "none";
    }

    $("note-modal-backdrop").style.display = "flex";
}

async function closeNoteModal() {
    const noteId = activeNoteId;
    activeNoteId = null;
    closeModalAnimated($("note-modal-backdrop"));
    if (noteId === null) return;

    const note = notes.find((n) => n.id === noteId);
    if (!note) return;

    // Save directly from the modal's current input value rather than
    // trusting `notes` as-is: a blur's save may still be in flight
    // (async, fire-and-forget) when the close click lands right after
    // it, and checking stale state below could wrongly judge a note
    // the user just wrote as empty and delete it.
    if (note.type !== "list") {
        await saveNoteField(noteId, { body: $("note-modal-body").value.trim() || null });
    }

    // A note created and closed without ever being given content is
    // just clutter - discard it instead of leaving a blank card, same
    // as the old compose-card flow did.
    const saved = notes.find((n) => n.id === noteId);
    const isEmpty = saved.type === "list"
        ? !saved.items || saved.items.length === 0
        : !saved.body;

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

// Escape closes it, the same as the Project, Personal Project and To Do
// modals - this one was the odd one out and had no keyboard exit at all.
// The popover guard is why it is not a straight copy of theirs: Notes is
// the only modal containing a color picker, and that picker registers its
// own Escape handler on document. Without this, one press would close the
// picker and the note behind it.
document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if ($("note-modal-backdrop").style.display === "none") return;
    if (document.querySelector(".popover-panel.open")) return;
    closeNoteModal();
});

// Switches the open note between text and list mode, carrying content
// across rather than discarding it: text -> list turns the body into a
// single item, list -> text joins every item's text into body lines.
async function toggleNoteType() {
    if (activeNoteId === null) return;
    const note = notes.find((n) => n.id === activeNoteId);
    if (!note) return;

    if (note.type === "list") {
        const joined = (note.items || []).map((it) => it.text).filter(Boolean).join("\n");
        for (const item of note.items || []) {
            await fetch(`/api/notes/${activeNoteId}/items/${item.id}`, { method: "DELETE" });
        }
        // saveNoteField replaces this note's entry in `notes` with the
        // server's response, so nothing about the object should be
        // mutated locally after it - any local edit here would just be
        // discarded along with the stale reference.
        await saveNoteField(activeNoteId, { type: "text", body: joined || null });
    } else {
        const bodyText = $("note-modal-body").value.trim();
        await saveNoteField(activeNoteId, { type: "list", body: null });
        if (bodyText) {
            const resp = await fetch(`/api/notes/${activeNoteId}/items`, { method: "POST" });
            const item = await resp.json();
            await fetch(`/api/notes/${activeNoteId}/items/${item.id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ text: bodyText }),
            });
            item.text = bodyText;
            // Re-fetch the reference - saveNoteField just swapped it out
            // for the server's version above.
            const freshNote = notes.find((n) => n.id === activeNoteId);
            if (freshNote) freshNote.items.push(item);
        }
    }

    openNoteModal(activeNoteId);
    refreshNoteCard(activeNoteId);
}

$("note-modal-type-toggle").addEventListener("click", toggleNoteType);

$("note-modal-body").addEventListener("blur", () => {
    if (activeNoteId === null) return;
    saveNoteField(activeNoteId, { body: $("note-modal-body").value.trim() || null });
});

$("note-modal-delete-btn").addEventListener("click", async () => {
    if (activeNoteId === null) return;
    if (!(await confirmDialog("This can't be undone.", { title: "Delete this note?" }))) return;
    const noteId = activeNoteId;
    await fetch(`/api/notes/${noteId}`, { method: "DELETE" });
    notes = notes.filter((n) => n.id !== noteId);
    activeNoteId = null;
    closeModalAnimated($("note-modal-backdrop"));
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
    autoGrowChecklistText(textInput);
    textInput.addEventListener("input", () => autoGrowChecklistText(textInput));
    textInput.addEventListener("blur", () => {
        if (activeNoteId !== null) saveNoteItem(activeNoteId, itemId, { text: textInput.value.trim() });
    });
    textInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            textInput.blur();
        }
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

// Re-fetches and re-renders the whole grid - called once at load and
// again every time nav.js switches to the Notes page (see showPage),
// so a note created elsewhere (Overview's quick capture, which
// doesn't go through this file at all) shows up instead of the grid
// staying frozen at whatever it looked like on first load.
async function refreshNotes() {
    const resp = await fetch("/api/notes");
    const data = await resp.json();
    notes = data.notes;
    renderNotes();
}

refreshNotes();
