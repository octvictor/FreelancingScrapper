// Shared helpers + page navigation. Loaded before any per-tool script
// (gatherer.js, tracker.js), which rely on $() being defined.

function $(id) {
    return document.getElementById(id);
}

// Shared by every .checklist-text field (To Do's Steps, Personal
// Projects' checklist, Notes' list items - same markup/pattern in
// todo.js/tracker.js/notes.js) - a checklist row's text is a <textarea
// rows="1"> rather than a single-line <input>, so a long entry wraps
// and grows the row downward instead of scrolling its text out of
// view. Resetting height to "auto" first is what lets scrollHeight
// shrink back down when text is deleted, not just grow.
function autoGrowChecklistText(el) {
    el.style.height = "auto";
    el.style.height = el.scrollHeight + "px";
}

// ---------- Shared inline icons ----------
// Lucide, inlined rather than fetched: the app ships as a single offline
// bundle, so an icon font or sprite request would be one more thing that
// can fail. Every one of these is drawn at 16px inside a 24px button -
// the geometry Calculator's row controls established - so the whole app
// shares one icon size rather than each surface inventing its own.
//
// TRASH is the delete affordance app-wide. It replaced a "\u00d7" glyph
// everywhere, which read as "close" as often as "delete" and rendered at
// whatever the surrounding font felt like.

const ICON_TRASH_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M3 6h18"></path><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>' +
    '<path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>' +
    '<line x1="10" x2="10" y1="11" y2="17"></line><line x1="14" x2="14" y1="11" y2="17"></line></svg>';

const ICON_ARROW_UP_RIGHT_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M7 7h10v10"></path><path d="M7 17 17 7"></path></svg>';

const ICON_TAG_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"></path>' +
    '<circle cx="7.5" cy="7.5" r=".5" fill="currentColor"></circle></svg>';

// Calculator's row Title field (finance.js) sits in a compact pill that
// hugs its own text rather than filling the row - a plain <input> can't
// size itself to its value, so a hidden sibling <span class="...-sizer">
// mirrors whatever text should determine the width (the typed value, or
// the placeholder when empty) and the input is absolutely positioned to
// exactly cover that span's box (see .finance-card-title-measure in
// app.css). This just keeps the two in sync on every keystroke.
function autoSizeTitleField(input) {
    const sizer = input.previousElementSibling;
    if (sizer) sizer.textContent = input.value || input.placeholder;
}

// Some colors are light enough that white text on top of them (e.g.
// Notes tinting a whole card with one) would be unreadable - this
// decides whether a given color needs dark text instead, via the
// standard luma formula. Only matters for pickers that tint an entire
// surface, not ones that just fill a small icon.
function colorNeedsDarkText(hex) {
    if (!hex) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55;
}

// Shared urgency + relative-label convention for any due date in the app
// (Overview's Due Soon row, a To Do task's due date) - red for
// overdue/today, amber for this week, blue for later - so a date never
// grows its own one-off color language.
function dueDateMeta(dateStr) {
    const target = new Date(dateStr + "T00:00:00");
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const diffDays = Math.round((target - today) / 86400000);
    if (diffDays < 0) return { label: "Overdue", urgency: "overdue" };
    if (diffDays === 0) return { label: "Today", urgency: "today" };
    if (diffDays === 1) return { label: "Tomorrow", urgency: "soon" };
    if (diffDays <= 6) return { label: target.toLocaleDateString(undefined, { weekday: "short" }), urgency: "soon" };
    return { label: target.toLocaleDateString(undefined, { month: "short", day: "numeric" }), urgency: "later" };
}

// ---------- Color preset picker ----------
// The one color picker for the whole app (To Do's list color, Notes'
// card color, Calculator's row color, and anything added later). A
// free-form hue/saturation wheel came before this and got replaced:
// precise but slow for what's meant to be a quick pick. Every tool calls
// openColorPresetPopover with its own save/clear callbacks rather than
// keeping its own popover and color list.
//
// Eight hues plus a dark/bright neutral pair, all mid-tone. That is not a
// style preference, it is the only range that works now that the app has
// two themes: a picked color is stored as one hex and painted on both a
// #fafafa page and a #1c1c1c one. Solving "stay under 5.5:1 against both
// grounds" leaves relative luminance in roughly [0.15, 0.26] - the pale
// tints this list used to hold (#C2E0CE and friends) glare on charcoal,
// and the deep ones (#1E2B33) turn into heavy slabs on paper. Every hue
// here takes light text, so the ink is consistent across the set; Ash is
// the single swatch that flips to dark, which is the point of it.
//
// The two neutrals sit a little outside that band by design - "darker
// and brighter grey" is a request for separation, and clamping both into
// the band would leave them almost the same tone as each other.
//
// A second constraint pins the values down further, and pulls against the
// first: whatever makes a color survive both grounds (mid luminance) also
// makes text on it weak, because neither ink is far from it. Every swatch
// here clears 4.5:1 against the ink colorNeedsDarkText picks for it. Keep
// that check if these are ever retuned - and keep every hue clear of luma
// 0.55, where the ink flips and both inks are equally poor.
//
// Saturation is the one axis that moves freely here. These sit at 1.5x
// the chroma of the first, more muted tuning, raised at FIXED relative
// luminance - which is the trick worth keeping: both rules above are
// functions of luminance alone, so holding it still preserves them for
// free. Vibrancy can be dialled up or down the same way without
// re-deriving anything; only a change that moves luminance needs the
// contrast pass run again. (Rust is the one exception - at 1.5x it
// landed on 4.4969:1, so it took a hair less lightness to clear 4.5.)

const COLOR_PRESETS = [
    ["#B94E3E", "#9F5E2B", "#836D28", "#417B5E", "#337A7E"],
    ["#4272A7", "#6E67A7", "#9D5989", "#6A6A6A", "#9A9A9A"],
];

let _colorPresetPopover = null;

function closeColorPresetPopover() {
    if (!_colorPresetPopover) return;
    _colorPresetPopover.remove();
    _colorPresetPopover = null;
    document.removeEventListener("click", _onColorPresetOutsideClick);
    document.removeEventListener("keydown", _onColorPresetKeydown);
}

function _onColorPresetOutsideClick(e) {
    if (_colorPresetPopover && !_colorPresetPopover.contains(e.target) && !e.target.closest(".color-dot-btn")) {
        closeColorPresetPopover();
    }
}

function _onColorPresetKeydown(e) {
    if (e.key === "Escape") closeColorPresetPopover();
}

// triggerBtn: the swatch button that opened this. currentColor: hex or
// null, used only to mark the matching swatch as selected. callbacks.
// onChange(hex) fires on a swatch click, callbacks.onClear() on "No color" -
// both close the popover immediately, since a single click is the whole
// interaction.
function openColorPresetPopover(triggerBtn, currentColor, { onChange, onClear }) {
    closeColorPresetPopover();
    const rect = triggerBtn.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel color-preset-popover open";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + 6 + "px";

    const current = currentColor ? currentColor.toUpperCase() : null;
    panel.innerHTML = `
        ${COLOR_PRESETS.map((ramp) => `
            <div class="color-preset-row">
                ${ramp.map((hex) => `
                    <button type="button" class="color-preset-swatch ${hex === current ? "selected" : ""}" style="background:${hex};" data-hex="${hex}" title="${hex}"></button>
                `).join("")}
            </div>
        `).join("")}
        <button type="button" class="btn-danger-text color-preset-clear">No color</button>
    `;
    document.body.appendChild(panel);
    _colorPresetPopover = panel;

    panel.querySelectorAll(".color-preset-swatch").forEach((swatch) => {
        swatch.addEventListener("click", () => {
            onChange(swatch.dataset.hex);
            closeColorPresetPopover();
        });
    });

    panel.querySelector(".color-preset-clear").addEventListener("click", () => {
        onClear();
        closeColorPresetPopover();
    });

    setTimeout(() => {
        document.addEventListener("click", _onColorPresetOutsideClick);
        document.addEventListener("keydown", _onColorPresetKeydown);
    });
}

// ---------- Reordering: FLIP ----------
// Native HTML5 drag moves an item by calling insertBefore, which is
// instant - every other item in the list teleports to its new slot with
// nothing to follow. FLIP bridges that: measure where things are (First),
// let the DOM change (Last), put everything back where it started with a
// transform (Invert), then release the transform and let CSS animate it
// home (Play).
//
// It runs on the reorder, not on the drag. dragover fires on every mouse
// move, but insertBefore only actually changes anything when the pointer
// crosses an item's midpoint, so wrapping the mutation - rather than the
// event - is what keeps this from thrashing.

const FLIP_MS = 200;

function flipReorder(items, mutate, { skip = null } = {}) {
    // Reduced motion: do the move, skip the choreography.
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        mutate();
        return;
    }
    const moving = items.filter((el) => el !== skip);
    const first = new Map();
    moving.forEach((el) => first.set(el, el.getBoundingClientRect()));

    mutate();

    const shifted = [];
    moving.forEach((el) => {
        const a = first.get(el);
        const b = el.getBoundingClientRect();
        const dx = a.left - b.left;
        const dy = a.top - b.top;
        if (!dx && !dy) return;
        // Invert with no transition, so this frame looks identical to the
        // one before it and the DOM change is invisible.
        el.classList.remove("flipping");
        el.style.transform = `translate(${dx}px, ${dy}px)`;
        shifted.push(el);
    });
    if (!shifted.length) return;

    // Two frames, not one: the first commits the inverted position, the
    // second releases it. Collapsing these into a single rAF lets the
    // browser coalesce both style changes and nothing animates at all.
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            shifted.forEach((el) => {
                el.classList.add("flipping");
                el.style.transform = "";
                const done = () => {
                    el.classList.remove("flipping");
                    el.removeEventListener("transitionend", done);
                };
                el.addEventListener("transitionend", done);
                // Same backstop as the modal exit: a transition that never
                // reports finishing must not leave .flipping stuck on, or
                // the next drag animates from the wrong place.
                setTimeout(done, FLIP_MS + 60);
            });
        });
    });
}

// The two halves of a drag-and-drop reorder that every tool shares:
// which siblings can move, and moving one of them with FLIP applied.
function flipInsert(dragged, reference, before) {
    const parent = reference.parentNode;
    const items = Array.from(parent.children);
    flipReorder(items, () => {
        parent.insertBefore(dragged, before ? reference : reference.nextSibling);
    }, { skip: dragged });
}

// ---------- Pointer drag ----------
// Native HTML5 drag was replaced here for one reason: the ghost that
// follows the cursor is drawn by the browser's compositor, not the page,
// and it is composited translucent. No CSS reaches it - setting opacity
// on the source element does nothing to it, because it is not the source
// element, it is a snapshot. The only way to hold a solid item is to draw
// the item yourself.
//
// So: the source stays put as a slot showing where the thing will land,
// and a real cloned node follows the pointer at full opacity. Everything
// else (reordering, FLIP, persistence) is unchanged from the HTML5
// version - only the transport differs.
//
// opts:
//   zones()        -> containers that accept this item, in DOM order
//   itemsIn(zone)  -> the reorderable children of a zone
//   axis           -> "y" (default) or "x", which edge decides before/after
//   onDrop(source, fromZone, toZone) -> persist; not called if nothing moved

const DRAG_THRESHOLD_PX = 4;

function startPointerDrag(downEvent, source, opts) {
    if (downEvent.button !== 0) return;
    const { zones, itemsIn, axis = "y", onDrop } = opts;
    const startX = downEvent.clientX;
    const startY = downEvent.clientY;
    const fromZone = source.parentNode;
    let ghost = null;
    let grabX = 0;
    let grabY = 0;
    let moved = false;

    const begin = () => {
        const rect = source.getBoundingClientRect();
        grabX = startX - rect.left;
        grabY = startY - rect.top;
        ghost = source.cloneNode(true);
        ghost.classList.add("drag-ghost");
        // Locked to the original's measured box: a clone pulled out of a
        // grid or a table row has no layout of its own to size it.
        ghost.style.width = rect.width + "px";
        ghost.style.height = rect.height + "px";
        document.body.appendChild(ghost);
        source.classList.add("drag-source");
        document.body.classList.add("is-dragging");
        moveGhost(startX, startY);
    };

    const moveGhost = (x, y) => {
        ghost.style.transform = `translate(${x - grabX}px, ${y - grabY}px)`;
    };

    const onMove = (e) => {
        if (!moved) {
            if (Math.abs(e.clientX - startX) < DRAG_THRESHOLD_PX &&
                Math.abs(e.clientY - startY) < DRAG_THRESHOLD_PX) return;
            // Only now is this a drag rather than a click, which is what
            // keeps a card openable and a title field selectable.
            moved = true;
            begin();
        }
        e.preventDefault();
        moveGhost(e.clientX, e.clientY);

        // The ghost is pointer-events:none, so this reads what is under it.
        const under = document.elementFromPoint(e.clientX, e.clientY);
        if (!under) return;
        const zone = zones().find((z) => z === under || z.contains(under));
        if (!zone) return;

        const items = itemsIn(zone).filter((el) => el !== source);
        const target = items.find((el) => el === under || el.contains(under));
        if (target) {
            const r = target.getBoundingClientRect();
            const before = axis === "x"
                ? e.clientX < r.left + r.width / 2
                : e.clientY < r.top + r.height / 2;
            flipInsert(source, target, before);
        } else if (!zone.contains(source)) {
            // Over the zone but not over any item: an empty column, or the
            // gap under the last card. Append, so an empty zone is reachable.
            flipReorder(Array.from(zone.children), () => zone.appendChild(source), { skip: source });
        }
    };

    const finish = (cancelled) => {
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        document.removeEventListener("keydown", onKey, true);
        if (!moved) return;
        if (ghost) ghost.remove();
        source.classList.remove("drag-source");
        document.body.classList.remove("is-dragging");
        if (!cancelled) onDrop(source, fromZone, source.parentNode);
    };

    const onUp = () => finish(false);
    const onKey = (e) => {
        if (e.key !== "Escape" || !moved) return;
        // Escape drops it where it currently sits rather than unwinding the
        // whole drag: the reorder already happened in the DOM on the way
        // here, and inventing an undo would be a second source of truth.
        e.stopImmediatePropagation();
        finish(false);
    };

    document.addEventListener("pointermove", onMove);
    document.addEventListener("pointerup", onUp);
    document.addEventListener("keydown", onKey, true);
}

// ---------- Modal close ----------
// The entrance was CSS-only from the start; the exit needs JS because
// nothing can animate an element that is already display:none. .closing
// runs the out keyframes, then the element is hidden for real once they
// finish. animationend rather than a setTimeout so the two never drift
// apart if the duration in app.css changes.
//
// The guard matters: closing an already-closing modal (Escape twice, or
// Escape plus a backdrop click) would otherwise stack listeners and hide
// it mid-animation.

// Read from the stylesheet rather than repeated here: the fallback timer
// below must always outlast the real animation, and a hardcoded copy would
// silently start cutting the exit short the first time --dur-modal-out
// changed in app.css.
function modalOutMs() {
    const raw = getComputedStyle(document.documentElement)
        .getPropertyValue("--dur-modal-out").trim();
    const ms = raw.endsWith("ms") ? parseFloat(raw)
        : raw.endsWith("s") ? parseFloat(raw) * 1000 : NaN;
    return Number.isFinite(ms) ? ms : 150;
}

function closeModalAnimated(backdrop, done) {
    if (!backdrop || backdrop.style.display === "none" || backdrop.classList.contains("closing")) return;
    let settled = false;
    const finish = () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        backdrop.removeEventListener("animationend", onEnd);
        backdrop.classList.remove("closing");
        backdrop.style.display = "none";
        if (typeof done === "function") done();
    };
    // animationend bubbles, and the panel inside the backdrop is running its
    // own out keyframes - without this check the child's event would close
    // the modal, which happens to look the same today only because both
    // animations share a duration.
    const onEnd = (e) => {
        if (e.target === backdrop) finish();
    };
    // The modal must end up hidden even if the animation never reports
    // finishing - no animation support, a background tab, the element
    // detached mid-flight. Losing the exit animation is a blemish; a modal
    // that will not close is a broken app.
    const timer = setTimeout(finish, modalOutMs() + 80);
    backdrop.classList.add("closing");
    backdrop.addEventListener("animationend", onEnd);
}

const PAGE_IDS = ["overview", "tracker", "gatherer", "todo", "notes", "finance", "documents"];

// A permanent .sb sits beside .ct-card on every page - it never shrinks
// or hides, so switching pages only ever swaps which section is visible
// inside .ct-card and which .sb-item is marked active.
function showPage(page) {
    // Nothing outside PAGE_IDS may reach the loop below: an unknown page
    // matches no section, so every one of them would be hidden and the
    // app would go blank with no way back except clicking a real tab.
    if (!PAGE_IDS.includes(page)) return;
    PAGE_IDS.forEach((id) => {
        const section = $("page-" + id);
        if (section) section.style.display = id === page ? "" : "none";
    });
    document.querySelectorAll(".sb-item").forEach((btn) => {
        btn.classList.toggle("active", btn.dataset.page === page);
    });
    if (page === "overview" && typeof refreshOverview === "function") refreshOverview();
    if (page === "notes" && typeof refreshNotes === "function") refreshNotes();
    if (page === "todo" && typeof refreshTodoBoard === "function") refreshTodoBoard();
    // Anything that measures its own layout has to re-run once its page is
    // actually visible: a first render while the section is display:none
    // reads every height as zero, so a fit-to-window cap silently decides
    // that everything fits.
    if (page === "tracker" && typeof onProjectPageShown === "function") onProjectPageShown();
    if (page === "gatherer" && typeof renderGathererTable === "function") renderGathererTable();
    if (page === "finance" && typeof renderFinanceTable === "function") renderFinanceTable();
    if (page === "notes" && typeof applyNotesFit === "function") applyNotesFit();
    if (page === "todo" && typeof applyTodoBoardFit === "function") applyTodoBoardFit();
    if (page === "documents" && typeof refreshDocuments === "function") refreshDocuments();
}

// Shared by the sidebar rows and any other control that jumps to a page
// (search results, etc).
function navigateTo(page) {
    showPage(page);
}

// [data-page] matters: the theme toggle is also an .sb-item, because it
// borrows the row geometry, but it is a switch and not a destination. A
// bare .sb-item selector handed its undefined dataset.page to showPage,
// which hid every section and blanked the page on every theme switch.
document.querySelectorAll(".sb-item[data-page]").forEach((btn) => {
    btn.addEventListener("click", () => navigateTo(btn.dataset.page));
});

showPage("overview");

// ---------- Due Soon notification toast ----------
// App-wide (built here, not in todo.js, so it can appear regardless of
// which page is open) and in-app only, as explicitly asked for - no
// email/Slack/background job. Checked on load and every 30 minutes
// while the tab stays open; dismissing it holds for the rest of the
// session (no re-check brings it back).

let dueSoonToastDismissed = false;
const DUE_SOON_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const DUE_SOON_BELL_SVG =
    '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"></path>' +
    '<path d="M10.268 21a2 2 0 0 0 3.464 0"></path></svg>';

function dueSoonToastRowHtml(task) {
    const meta = dueDateMeta(task.due_date);
    return `
        <div class="due-soon-toast-row" data-id="${task.id}" data-list-id="${task.list_id}">
            <span class="due-soon-toast-when ${meta.urgency}">${meta.label}</span>
            <span class="due-soon-toast-task">${escapeAttr(task.title) || "Untitled task"}</span>
        </div>
    `;
}

async function goToTodoTask(listId, taskId) {
    showPage("todo");
    if (typeof refreshTodoBoard === "function") await refreshTodoBoard();
    if (typeof openTodoTaskModal === "function") openTodoTaskModal(listId, taskId);
}

function showDueSoonToast(tasks) {
    document.querySelectorAll(".due-soon-toast").forEach((el) => el.remove());

    const toast = document.createElement("div");
    toast.className = "due-soon-toast";
    toast.innerHTML = `
        <div class="due-soon-toast-head">
            <span class="due-soon-toast-icon">${DUE_SOON_BELL_SVG}</span>
            <span class="due-soon-toast-title">Due soon</span>
            <button class="due-soon-toast-close" type="button" title="Dismiss">&times;</button>
        </div>
        ${tasks.map(dueSoonToastRowHtml).join("")}
        <div class="due-soon-toast-foot">
            <button class="due-soon-toast-link" type="button">View To Do &rarr;</button>
        </div>
    `;
    document.body.appendChild(toast);

    toast.querySelector(".due-soon-toast-close").addEventListener("click", () => {
        toast.remove();
        dueSoonToastDismissed = true;
    });
    toast.querySelector(".due-soon-toast-link").addEventListener("click", () => {
        toast.remove();
        showPage("todo");
    });
    toast.querySelectorAll(".due-soon-toast-row").forEach((row) => {
        row.addEventListener("click", () => {
            toast.remove();
            goToTodoTask(parseInt(row.dataset.listId, 10), parseInt(row.dataset.id, 10));
        });
    });
}

async function checkDueSoonTasks() {
    if (dueSoonToastDismissed) return;
    const resp = await fetch("/api/todo/due-soon");
    if (!resp.ok) return;
    const data = await resp.json();
    const tasks = data.tasks || [];
    if (tasks.length === 0) {
        document.querySelectorAll(".due-soon-toast").forEach((el) => el.remove());
        return;
    }
    showDueSoonToast(tasks);
}

checkDueSoonTasks();
setInterval(checkDueSoonTasks, DUE_SOON_CHECK_INTERVAL_MS);

// ---------- Custom dropdown ----------
// Replaces a native <select>'s popup, which browsers won't let CSS fully
// theme (they force their own highlight on the hovered/selected option
// no matter what). The real <select> stays in the DOM as the source of
// truth - hidden, but still where its value lives and where existing
// `addEventListener("change", ...)` code keeps working unmodified. This
// only adds a themed button+panel on top and drives the select from it.

const _customSelectClosers = [];

function _closeAllCustomSelects() {
    _customSelectClosers.forEach((close) => close());
}

document.addEventListener("click", _closeAllCustomSelects);
document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") _closeAllCustomSelects();
});
window.addEventListener("scroll", _closeAllCustomSelects, true);
window.addEventListener("resize", _closeAllCustomSelects);

function enhanceSelect(select) {
    if (select.dataset.enhanced) return;
    select.dataset.enhanced = "true";

    const wrap = document.createElement("span");
    wrap.className = "custom-select-wrap";
    select.parentNode.insertBefore(wrap, select);
    wrap.appendChild(select);

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "custom-select-trigger";
    wrap.appendChild(trigger);

    const panel = document.createElement("div");
    panel.className = "custom-select-panel";
    document.body.appendChild(panel);

    function refresh() {
        const selected = select.options[select.selectedIndex];
        trigger.innerHTML = (selected ? selected.innerHTML : "") + ' <span class="custom-select-chevron">&#9662;</span>';
        trigger.className = "custom-select-trigger " + select.className;
        panel.querySelectorAll(".custom-select-option").forEach((el) => {
            el.classList.toggle("active", el.dataset.value === select.value);
        });
    }

    function buildPanel() {
        panel.innerHTML = "";
        Array.from(select.options).forEach((opt) => {
            const item = document.createElement("div");
            item.className = "custom-select-option";
            item.dataset.value = opt.value;
            item.innerHTML = opt.innerHTML;
            item.addEventListener("click", (e) => {
                e.stopPropagation();
                select.value = opt.value;
                select.dispatchEvent(new Event("change", { bubbles: true }));
                refresh();
                closePanel();
            });
            panel.appendChild(item);
        });
    }

    function openPanel() {
        _closeAllCustomSelects();
        const rect = trigger.getBoundingClientRect();
        panel.style.left = rect.left + "px";
        panel.style.top = rect.bottom + 4 + "px";
        panel.style.minWidth = rect.width + "px";
        panel.classList.add("open");
        trigger.classList.add("open");
    }

    function closePanel() {
        panel.classList.remove("open");
        trigger.classList.remove("open");
    }

    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (panel.classList.contains("open")) closePanel();
        else openPanel();
    });
    panel.addEventListener("click", (e) => e.stopPropagation());

    buildPanel();
    refresh();
    select._customSelectRefresh = refresh;
    select._customSelectPanel = panel;
    select._customSelectClose = closePanel;
    _customSelectClosers.push(closePanel);
}

// Re-sync a custom dropdown's button after code sets select.value/class
// directly instead of going through the panel (e.g. populating a modal).
function refreshCustomSelect(select) {
    select._customSelectRefresh?.();
}

function enhanceSelectsIn(container) {
    container.querySelectorAll("select").forEach(enhanceSelect);
}

// The panel lives in document.body (see enhanceSelect above), outside
// the table it's for, so it survives that table's own DOM getting torn
// down on re-render - call this on a container right before replacing
// its innerHTML, or the old panels pile up invisibly forever.
function cleanupCustomSelectsIn(container) {
    container.querySelectorAll("select[data-enhanced]").forEach((select) => {
        select._customSelectPanel?.remove();
        const idx = _customSelectClosers.indexOf(select._customSelectClose);
        if (idx !== -1) _customSelectClosers.splice(idx, 1);
    });
}

// ---------- Confirm dialog ----------
// A themed stand-in for the browser's native confirm() (which renders as
// an ugly, unstyled "127.0.0.1:8501 says" box) for destructive actions
// like deleting a project. Returns a Promise<boolean> so call sites just
// swap `confirm(msg)` for `await confirmDialog(msg)`.

function confirmDialog(message, { title = "Are you sure?", confirmText = "Delete", cancelText = "Cancel" } = {}) {
    return new Promise((resolve) => {
        const backdrop = document.createElement("div");
        backdrop.className = "modal-backdrop confirm-backdrop";

        const box = document.createElement("div");
        box.className = "confirm-dialog";
        box.innerHTML = `
            <p class="confirm-dialog-title"></p>
            <p class="confirm-dialog-message"></p>
            <div class="confirm-dialog-actions">
                <button type="button" class="btn confirm-dialog-cancel"></button>
                <button type="button" class="btn btn-danger confirm-dialog-confirm"></button>
            </div>
        `;
        box.querySelector(".confirm-dialog-title").textContent = title;
        box.querySelector(".confirm-dialog-message").textContent = message;
        box.querySelector(".confirm-dialog-cancel").textContent = cancelText;
        box.querySelector(".confirm-dialog-confirm").textContent = confirmText;
        backdrop.appendChild(box);
        document.body.appendChild(backdrop);

        function finish(result) {
            document.removeEventListener("keydown", onKeydown);
            // Same exit as every other modal, then drop the node entirely -
            // this one is created per call rather than living in index.html.
            closeModalAnimated(backdrop, () => backdrop.remove());
            resolve(result);
        }

        function onKeydown(e) {
            if (e.key === "Escape") finish(false);
            if (e.key === "Enter") finish(true);
        }

        backdrop.addEventListener("click", (e) => {
            if (e.target === backdrop) finish(false);
        });
        box.querySelector(".confirm-dialog-cancel").addEventListener("click", () => finish(false));
        box.querySelector(".confirm-dialog-confirm").addEventListener("click", () => finish(true));
        document.addEventListener("keydown", onKeydown);
        box.querySelector(".confirm-dialog-confirm").focus();
    });
}

/* ---------------- Date field ----------------
   The one control in the app that still rendered as a browser default:
   a native date input picks its own format from the operating system, so
   what it shows is neither the app's typography nor a format you chose -
   it reads mm/dd/yyyy on one machine and dd/mm/yyyy on another.

   The native input stays in the DOM as the source of truth, hidden. Code
   elsewhere keeps setting `.value` and listening for `change` exactly as
   before; this only replaces what the user sees and clicks. */

const DATE_MONTHS = ["January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"];
const DATE_MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun",
    "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DATE_DOW = ["M", "T", "W", "T", "F", "S", "S"];

let dateFieldPopover = null;

// "2026-08-24" -> "24 Aug 2026". One format everywhere, never the OS's.
function formatDateValue(value) {
    if (!value) return "";
    const parts = value.split("-");
    if (parts.length !== 3) return value;
    const month = DATE_MONTHS_SHORT[Number(parts[1]) - 1];
    if (!month) return value;
    return `${Number(parts[2])} ${month} ${parts[0]}`;
}

function dateToValue(year, month, day) {
    return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function closeDateFieldPopover() {
    if (!dateFieldPopover) return;
    dateFieldPopover.remove();
    dateFieldPopover = null;
    document.removeEventListener("keydown", onDateFieldKeydown, true);
}

// Capture phase plus stopImmediatePropagation, because the modal's own
// Escape handler is bound to document too - plain stopPropagation does
// not stop a sibling listener on the same element, so one Escape was
// closing the calendar and the whole modal behind it. Now the first
// Escape dismisses the calendar and a second one closes the modal.
function onDateFieldKeydown(e) {
    if (e.key === "Escape") {
        e.stopImmediatePropagation();
        e.preventDefault();
        closeDateFieldPopover();
    }
}

function renderDateGrid(panel, input, trigger, viewYear, viewMonth) {
    const selected = input.value || "";
    const today = new Date();
    const todayValue = dateToValue(today.getFullYear(), today.getMonth(), today.getDate());

    // Monday-first, matching how a week is read in most of the world.
    const first = new Date(viewYear, viewMonth, 1);
    const lead = (first.getDay() + 6) % 7;
    const days = new Date(viewYear, viewMonth + 1, 0).getDate();

    let cells = "";
    for (let i = 0; i < lead; i++) cells += `<span class="date-cell is-blank"></span>`;
    for (let d = 1; d <= days; d++) {
        const value = dateToValue(viewYear, viewMonth, d);
        const classes = ["date-cell"];
        if (value === selected) classes.push("is-selected");
        if (value === todayValue) classes.push("is-today");
        cells += `<button type="button" class="${classes.join(" ")}" data-value="${value}">${d}</button>`;
    }

    panel.innerHTML = `
        <div class="date-pop-head">
            <button type="button" class="date-nav" data-step="-1" aria-label="Previous month">&#8249;</button>
            <span class="date-pop-month">${DATE_MONTHS[viewMonth]} ${viewYear}</span>
            <button type="button" class="date-nav" data-step="1" aria-label="Next month">&#8250;</button>
        </div>
        <div class="date-dow">${DATE_DOW.map((d) => `<span>${d}</span>`).join("")}</div>
        <div class="date-grid">${cells}</div>
        <div class="date-pop-foot">
            <button type="button" class="date-pop-action" data-jump="today">Today</button>
            <button type="button" class="date-pop-action" data-jump="clear">Clear</button>
        </div>
    `;

    const commit = (value) => {
        input.value = value;
        // Everything already wired to this field listens for `change`.
        input.dispatchEvent(new Event("change", { bubbles: true }));
        trigger.querySelector(".date-trigger-text").textContent = formatDateValue(value) || "Set a date";
        trigger.classList.toggle("is-empty", !value);
        closeDateFieldPopover();
    };

    panel.querySelectorAll(".date-nav").forEach((btn) => {
        btn.addEventListener("click", () => {
            const step = Number(btn.dataset.step);
            let m = viewMonth + step;
            let y = viewYear;
            if (m < 0) { m = 11; y--; }
            if (m > 11) { m = 0; y++; }
            renderDateGrid(panel, input, trigger, y, m);
        });
    });
    panel.querySelectorAll(".date-cell[data-value]").forEach((btn) => {
        btn.addEventListener("click", () => commit(btn.dataset.value));
    });
    panel.querySelector('[data-jump="today"]').addEventListener("click", () => commit(todayValue));
    panel.querySelector('[data-jump="clear"]').addEventListener("click", () => commit(""));
}

function openDateFieldPopover(input, trigger) {
    closeDateFieldPopover();
    const rect = trigger.getBoundingClientRect();
    const panel = document.createElement("div");
    panel.className = "popover-panel date-popover open";

    const base = input.value ? input.value.split("-") : null;
    const now = new Date();
    const viewYear = base ? Number(base[0]) : now.getFullYear();
    const viewMonth = base ? Number(base[1]) - 1 : now.getMonth();

    document.body.appendChild(panel);
    dateFieldPopover = panel;
    renderDateGrid(panel, input, trigger, viewYear, viewMonth);

    // Placed after render so the measured height is the real one, then
    // flipped above the trigger when there isn't room below.
    const height = panel.offsetHeight;
    const below = rect.bottom + 6;
    panel.style.left = Math.min(rect.left, window.innerWidth - panel.offsetWidth - 12) + "px";
    panel.style.top = (below + height > window.innerHeight - 12 ? rect.top - height - 6 : below) + "px";

    document.addEventListener("keydown", onDateFieldKeydown, true);
}

// Swaps a native date input for a trigger button plus a calendar popover.
// Idempotent - calling it twice on the same input does nothing.
function enhanceDateField(input) {
    if (!input || input.dataset.dateEnhanced) return;
    input.dataset.dateEnhanced = "1";

    const wrap = document.createElement("span");
    wrap.className = "date-field";
    input.parentNode.insertBefore(wrap, input);
    wrap.appendChild(input);
    input.classList.add("date-field-native");

    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.className = "date-trigger";
    trigger.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="18" rx="2"></rect><path d="M16 2v4M8 2v4M3 10h18"></path></svg>
        <span class="date-trigger-text"></span>
    `;
    wrap.appendChild(trigger);

    const sync = () => {
        const text = formatDateValue(input.value);
        trigger.querySelector(".date-trigger-text").textContent = text || "Set a date";
        trigger.classList.toggle("is-empty", !text);
    };
    sync();

    // Code elsewhere assigns `.value` directly, which fires no event, so
    // the label is re-synced when the popover opens and whenever a real
    // change lands.
    input.addEventListener("change", sync);
    trigger.addEventListener("click", (e) => {
        e.stopPropagation();
        if (dateFieldPopover) { closeDateFieldPopover(); return; }
        sync();
        openDateFieldPopover(input, trigger);
    });
}

document.addEventListener("click", (e) => {
    if (dateFieldPopover && !e.target.closest(".date-popover") && !e.target.closest(".date-trigger")) {
        closeDateFieldPopover();
    }
});

document.addEventListener("DOMContentLoaded", () => {
    document.querySelectorAll('input[type="date"]').forEach(enhanceDateField);
});

/* ---------------- Fit-to-window row caps ----------------
   Long lists show a window onto themselves rather than all of it, but how
   big that window should be is not a number anyone can pick in advance -
   it is however much room the page actually has. A constant (8 rows, 2
   rows) is right at exactly one window size and wrong everywhere else:
   too much on a short window, and leaving half the page empty on a tall
   one. These derive the cap from the space in front of the user, and are
   re-run on resize, so the list always ends near the bottom of the
   window.

   Measured rather than calculated from CSS: row heights change with
   font-size, padding and whether a cell wrapped, and the only reliable
   source for the real number is a row that has actually been laid out. */

// Distance from the top of the document to this element. getBoundingClientRect
// is viewport-relative, so once the page is scrolled its `top` goes negative
// and "space left below" computes as far more than exists - expanding a list
// then scrolling down to the collapse button made the next fit conclude that
// everything fits, and collapse did nothing. Every fit below asks how much
// room there is with the page at rest, which is what these lists are sized
// for, so the answer must not depend on where it happens to be scrolled.
function documentTopOf(el) {
    return el.getBoundingClientRect().top + window.scrollY;
}

const ROW_FIT_MIN = 3;      // never collapse to something useless
const ROW_FIT_BOTTOM_GAP = 24;

// Rows already rendered inside `container` are shown or hidden so the list
// ends just short of the window's bottom edge. `reserve` is whatever sits
// below the list and must stay visible (an "+ Add row" footer, a sum).
// Returns how many are left showing.
function applyRowFit(container, rowSelector, { reserve = 0, min = ROW_FIT_MIN } = {}) {
    if (!container) return 0;
    const rows = Array.from(container.querySelectorAll(rowSelector));
    if (!rows.length) return 0;

    rows.forEach((row) => { row.style.display = ""; });

    const top = documentTopOf(container);
    const rowHeight = rows[0].getBoundingClientRect().height;
    if (rowHeight <= 0) return rows.length;

    const available = window.innerHeight - top - reserve - ROW_FIT_BOTTOM_GAP;
    const fits = Math.max(min, Math.floor(available / rowHeight));
    if (fits >= rows.length) return rows.length;

    rows.slice(fits).forEach((row) => { row.style.display = "none"; });
    return fits;
}

// Same idea for a wrapping grid of cards, where the unit is a row of
// cards rather than one card: how many whole rows clear the bottom edge.
function rowsOfCardsThatFit(cards, containerTop, { reserve = 0, min = 1 } = {}) {
    const rowTops = [];
    cards.forEach((card) => {
        const top = card.offsetTop;
        if (!rowTops.includes(top)) rowTops.push(top);
    });
    if (rowTops.length < 2) return Math.max(min, rowTops.length);

    const rowHeight = rowTops[1] - rowTops[0];
    if (rowHeight <= 0) return Math.max(min, rowTops.length);

    const available = window.innerHeight - containerTop - reserve - ROW_FIT_BOTTOM_GAP;
    return Math.max(min, Math.floor(available / rowHeight));
}

// Re-fits whichever page is showing. Debounced: resize fires continuously
// while a window is dragged, and each run does layout reads. The timer is
// per registration, not shared - a shared one would let each caller cancel
// the others, so only the last tool registered would ever re-fit.
function onRowFitResize(handler) {
    let timer = null;
    window.addEventListener("resize", () => {
        clearTimeout(timer);
        timer = setTimeout(handler, 150);
    });
}

// A CSS multi-column grid (Notes) has no rows to divide by: cards flow
// down each column, and hiding one reflows every card after it, so the
// answer cannot be computed in one pass. This estimates from the ratio of
// full content height to available height - close, because the cards are
// similar sizes - then corrects a step at a time until the grid just
// clears the bottom edge. Two or three reflows in practice, not thirty.
function applyColumnFit(container, cardSelector, { reserve = 0, min = ROW_FIT_MIN } = {}) {
    if (!container) return 0;
    const cards = Array.from(container.querySelectorAll(cardSelector));
    if (!cards.length) return 0;
    cards.forEach((card) => { card.style.display = ""; });

    const top = documentTopOf(container);
    const limit = window.innerHeight - top - reserve - ROW_FIT_BOTTOM_GAP;
    const fullHeight = container.getBoundingClientRect().height;
    if (fullHeight <= limit || limit <= 0) return cards.length;

    const setShown = (n) => {
        cards.forEach((card, i) => { card.style.display = i < n ? "" : "none"; });
        return container.getBoundingClientRect().height;
    };

    let keep = Math.max(min, Math.min(cards.length,
        Math.floor(cards.length * limit / fullHeight)));

    let guard = 0;
    while (keep > min && setShown(keep) > limit && guard++ < 60) keep--;
    while (keep < cards.length && guard++ < 60) {
        if (setShown(keep + 1) > limit) { setShown(keep); break; }
        keep++;
    }
    return keep;
}


// A kanban board is the one shape that should scroll rather than collapse:
// its columns are already independent lists, and capping each one would
// mean a "Show more" button per column. Instead the board itself is given
// a height that ends at the fold and scrolls inside, which is how every
// other board works. Horizontal scrolling stays as it was.
function fitBoardHeight(board, { reserve = 0 } = {}) {
    if (!board) return;
    board.style.maxHeight = "";
    const top = documentTopOf(board);
    const available = window.innerHeight - top - reserve - ROW_FIT_BOTTOM_GAP;
    if (available <= 0) return;
    board.style.maxHeight = available + "px";
    board.style.overflowY = "auto";
}

// ---------- Theme ----------
// The stamp on <html> is written by the inline script in index.html
// before the stylesheet paints; this only reads it back and switches it.
// Every color in app.css goes through a token that has a value in both
// :root and :root[data-theme="dark"], so flipping the attribute is the
// whole switch - nothing here touches an individual element.

const THEME_KEY = "vaio-theme";

function currentTheme() {
    return document.documentElement.dataset.theme === "dark" ? "dark" : "light";
}

// The icon and label both name the theme you would GET by clicking, not
// the one you are in - a control should say what it does.
function paintThemeToggle() {
    const dark = currentTheme() === "dark";
    const moon = document.querySelector(".sb-theme-moon");
    const sun = document.querySelector(".sb-theme-sun");
    if (!moon || !sun) return;
    // setAttribute, not .className - on an SVG element className is a
    // read-only SVGAnimatedString, so assigning to it fails silently and
    // both icons stay visible on top of each other.
    moon.setAttribute("class", `sb-theme-moon sb-theme-icon-${dark ? "hidden" : "shown"}`);
    sun.setAttribute("class", `sb-theme-sun sb-theme-icon-${dark ? "shown" : "hidden"}`);
    $("theme-toggle-label").textContent = dark ? "Light" : "Dark";
    $("theme-toggle").setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
}

function setTheme(theme, remember = true) {
    document.documentElement.dataset.theme = theme;
    if (remember) {
        try {
            localStorage.setItem(THEME_KEY, theme);
        } catch (e) {
            // Private mode - the theme still applies, it just won't persist.
        }
    }
    paintThemeToggle();
}

$("theme-toggle").addEventListener("click", () => {
    setTheme(currentTheme() === "dark" ? "light" : "dark");
});

// Follow the OS only while the user hasn't pinned a choice. Once they
// click the toggle, that choice outranks the system in both directions.
window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
    let saved = null;
    try {
        saved = localStorage.getItem(THEME_KEY);
    } catch (err) {
        /* private mode - nothing was ever pinned */
    }
    if (!saved) setTheme(e.matches ? "dark" : "light", false);
});

paintThemeToggle();
