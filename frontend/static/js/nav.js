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

// ---------- Color wheel picker ----------
// The one color picker for the whole app (To Do's list color, Notes'
// card color, Calculator's row color, and anything added later) - a
// free-form hue/saturation wheel plus a lightness slider and a hex
// field for precision, instead of a fixed preset palette. Every tool
// calls openColorWheelPopover with its own save/clear callbacks
// rather than keeping its own popover and color list.

function _hexToHsl(hex) {
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
        const d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
        switch (max) {
            case r: h = (g - b) / d + (g < b ? 6 : 0); break;
            case g: h = (b - r) / d + 2; break;
            case b: h = (r - g) / d + 4; break;
        }
        h *= 60;
    }
    return { h, s: s * 100, l: l * 100 };
}

function _hslToHex(h, s, l) {
    s /= 100; l /= 100;
    const c = (1 - Math.abs(2 * l - 1)) * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = l - c / 2;
    let r = 0, g = 0, b = 0;
    if (h < 60) { r = c; g = x; }
    else if (h < 120) { r = x; g = c; }
    else if (h < 180) { g = c; b = x; }
    else if (h < 240) { g = x; b = c; }
    else if (h < 300) { r = x; b = c; }
    else { r = c; b = x; }
    const toHex = (v) => Math.round((v + m) * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`.toUpperCase();
}

let _colorWheelPopover = null;

function closeColorWheelPopover() {
    if (!_colorWheelPopover) return;
    _colorWheelPopover.remove();
    _colorWheelPopover = null;
    document.removeEventListener("click", _onColorWheelOutsideClick);
    document.removeEventListener("keydown", _onColorWheelKeydown);
}

function _onColorWheelOutsideClick(e) {
    if (_colorWheelPopover && !_colorWheelPopover.contains(e.target) && !e.target.closest(".swatch-btn")) {
        closeColorWheelPopover();
    }
}

function _onColorWheelKeydown(e) {
    if (e.key === "Escape") closeColorWheelPopover();
}

// triggerBtn: the swatch button that opened this. currentColor: hex or
// null. callbacks.onChange(hex) fires once per committed pick (drag
// release, lightness-slider release, or hex field blur/Enter) - never
// on every drag frame. callbacks.onClear() fires from "No color".
function openColorWheelPopover(triggerBtn, currentColor, { onChange, onClear }) {
    closeColorWheelPopover();
    const rect = triggerBtn.getBoundingClientRect();

    const panel = document.createElement("div");
    panel.className = "popover-panel color-wheel-popover open";
    panel.style.left = rect.left + "px";
    panel.style.top = rect.bottom + 6 + "px";

    const size = 160;
    panel.innerHTML = `
        <div class="color-wheel-canvas-wrap">
            <canvas class="color-wheel-canvas" width="${size}" height="${size}"></canvas>
            <div class="color-wheel-cursor"></div>
        </div>
        <input type="range" class="color-wheel-lightness" min="0" max="100" step="1" title="Lightness">
        <div class="color-wheel-row">
            <span class="color-wheel-preview"></span>
            <input type="text" class="cell-input color-wheel-hex" maxlength="7" spellcheck="false">
        </div>
        <button type="button" class="btn-danger-text color-wheel-clear">No color</button>
    `;
    document.body.appendChild(panel);
    _colorWheelPopover = panel;

    const canvas = panel.querySelector(".color-wheel-canvas");
    const ctx = canvas.getContext("2d");
    const cursor = panel.querySelector(".color-wheel-cursor");
    const lightnessInput = panel.querySelector(".color-wheel-lightness");
    const hexInput = panel.querySelector(".color-wheel-hex");
    const preview = panel.querySelector(".color-wheel-preview");
    const clearBtn = panel.querySelector(".color-wheel-clear");

    const cx = size / 2, cy = size / 2, radius = size / 2 - 4;
    let state = currentColor ? _hexToHsl(currentColor) : { h: 0, s: 0, l: 55 };

    function drawWheel(lightness) {
        const img = ctx.createImageData(size, size);
        for (let py = 0; py < size; py++) {
            for (let px = 0; px < size; px++) {
                const dx = px - cx, dy = py - cy;
                const r = Math.sqrt(dx * dx + dy * dy);
                const idx = (py * size + px) * 4;
                if (r > radius) { img.data[idx + 3] = 0; continue; }
                const hue = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
                const sat = Math.min(100, (r / radius) * 100);
                const hex = _hslToHex(hue, sat, lightness);
                img.data[idx] = parseInt(hex.slice(1, 3), 16);
                img.data[idx + 1] = parseInt(hex.slice(3, 5), 16);
                img.data[idx + 2] = parseInt(hex.slice(5, 7), 16);
                img.data[idx + 3] = 255;
            }
        }
        ctx.putImageData(img, 0, 0);
    }

    function positionCursor() {
        const angle = state.h * Math.PI / 180;
        const r = Math.min(1, state.s / 100) * radius;
        cursor.style.left = (cx + Math.cos(angle) * r) + "px";
        cursor.style.top = (cy + Math.sin(angle) * r) + "px";
    }

    function syncUi() {
        const hex = _hslToHex(state.h, state.s, state.l);
        preview.style.background = hex;
        hexInput.value = hex;
        lightnessInput.value = Math.round(state.l);
        drawWheel(state.l);
        positionCursor();
    }

    function setFromPointer(clientX, clientY) {
        const r = canvas.getBoundingClientRect();
        const dx = (clientX - r.left) - cx, dy = (clientY - r.top) - cy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        state.h = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
        state.s = Math.min(100, (dist / radius) * 100);
        syncUi();
    }

    let dragging = false;
    canvas.addEventListener("pointerdown", (e) => {
        dragging = true;
        canvas.setPointerCapture(e.pointerId);
        setFromPointer(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointermove", (e) => {
        if (dragging) setFromPointer(e.clientX, e.clientY);
    });
    canvas.addEventListener("pointerup", () => {
        if (!dragging) return;
        dragging = false;
        onChange(_hslToHex(state.h, state.s, state.l));
    });

    lightnessInput.addEventListener("input", () => {
        state.l = parseInt(lightnessInput.value, 10);
        syncUi();
    });
    lightnessInput.addEventListener("change", () => {
        onChange(_hslToHex(state.h, state.s, state.l));
    });

    hexInput.addEventListener("blur", () => {
        const v = hexInput.value.trim().replace(/^#/, "");
        if (/^[0-9a-fA-F]{6}$/.test(v)) {
            const hex = "#" + v.toUpperCase();
            state = _hexToHsl(hex);
            syncUi();
            onChange(hex);
        } else {
            syncUi();
        }
    });
    hexInput.addEventListener("keydown", (e) => {
        if (e.key === "Enter") hexInput.blur();
    });

    clearBtn.addEventListener("click", () => {
        onClear();
        closeColorWheelPopover();
    });

    syncUi();
    setTimeout(() => {
        document.addEventListener("click", _onColorWheelOutsideClick);
        document.addEventListener("keydown", _onColorWheelKeydown);
    });
}

const PAGE_IDS = ["tracker", "gatherer", "todo", "notes", "finance"];
const WIDE_PAGES = ["tracker", "gatherer", "todo", "notes", "finance"];

function showPage(page) {
    PAGE_IDS.forEach((id) => {
        const section = $("page-" + id);
        if (section) section.style.display = id === page ? "" : "none";
    });
    document.querySelector(".main").classList.toggle("main-wide", WIDE_PAGES.includes(page));
}

document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        showPage(btn.dataset.page);
    });
});

// The nav-item marked "active" in the HTML never fires a click, so the
// layout classes above would otherwise never apply to it on first load.
showPage(document.querySelector(".nav-item.active").dataset.page);

// ---------- Collapsible sidebar groups ----------

document.querySelectorAll(".sidebar-group-header").forEach((header) => {
    header.addEventListener("click", () => {
        const target = $(header.dataset.collapseTarget);
        if (!target) return;
        target.classList.toggle("collapsed");
        header.classList.toggle("collapsed");
    });
});

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
