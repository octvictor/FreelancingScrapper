// Shared helpers + page navigation. Loaded before any per-tool script
// (gatherer.js, tracker.js), which rely on $() being defined.

function $(id) {
    return document.getElementById(id);
}

// The one preset color scheme for every color picker in the app (To
// Do's list color, Notes' card color, Calculator's row color, and
// whatever color picker gets added next) - same seven colors, same
// order, everywhere, so "the third swatch" always means the same
// color no matter which tool you're in.
const SWATCH_COLORS = ["#EFEFEF", "#98FBCB", "#CCFF00", "#2B59D2", "#6E2DD0", "#C04A3C", "#C89C35"];

// Some of the swatch colors above are light enough that white text on
// top of them (e.g. Notes tinting a whole card with one) would be
// unreadable - this decides whether a given color needs dark text
// instead, via the standard luma formula. Only matters for pickers
// that tint an entire surface, not ones that just fill a small icon.
function colorNeedsDarkText(hex) {
    if (!hex) return false;
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return luminance > 0.55;
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
