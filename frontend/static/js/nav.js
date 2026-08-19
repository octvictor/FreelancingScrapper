// Shared helpers + page navigation. Loaded before any per-tool script
// (gatherer.js, tracker.js), which rely on $() being defined.

function $(id) {
    return document.getElementById(id);
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
// (Command Center's Due Soon row, a To Do task's due date) - red for
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
// card color, Calculator's row color, and anything added later) - two
// single-hue tonal ramps (green, blue) as one-click swatches. A free-form
// hue/saturation wheel came before this and got replaced: precise but slow
// for what's meant to be a quick pick. Every tool calls
// openColorPresetPopover with its own save/clear callbacks rather than
// keeping its own popover and color list.

const COLOR_PRESET_RAMPS = [
    ["#2E4A3D", "#3E6653", "#5C8C74", "#8CB89E", "#C2E0CE"],
    ["#1E2B33", "#324553", "#597792", "#88A8BF", "#C6D9E6"],
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
    if (_colorPresetPopover && !_colorPresetPopover.contains(e.target) && !e.target.closest(".swatch-btn")) {
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
        ${COLOR_PRESET_RAMPS.map((ramp) => `
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

const PAGE_IDS = ["overview", "tracker", "gatherer", "todo", "notes", "finance"];

// A permanent .sb sits beside .ct-card on every page - it never shrinks
// or hides, so switching pages only ever swaps which section is visible
// inside .ct-card and which .sb-item is marked active.
function showPage(page) {
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
}

// Shared by the sidebar rows and any other control that jumps to a page
// (search results, etc).
function navigateTo(page) {
    showPage(page);
}

document.querySelectorAll(".sb-item").forEach((btn) => {
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
            backdrop.remove();
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
