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
