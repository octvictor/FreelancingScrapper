// Freelancing Tools frontend - plain JS, no build step. Talks to the
// FastAPI backend under /api/scrapper.

let safeMode = true;
let lastResults = [];

function $(id) {
    return document.getElementById(id);
}

// ---------- Page + tab navigation ----------

document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const page = btn.dataset.page;
        $("page-scrapper").style.display = page === "scrapper" ? "" : "none";
        $("page-gatherer").style.display = page === "gatherer" ? "" : "none";
        $("scrapper-sidebar").style.display = page === "scrapper" ? "" : "none";
    });
});

document.querySelectorAll(".tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
        document.querySelectorAll(".tab-panel").forEach((p) => p.classList.remove("active"));
        btn.classList.add("active");
        $("tab-" + btn.dataset.tab).classList.add("active");
    });
});

// ---------- Safe mode toggle ----------

function applySafeModeUI() {
    const toggle = $("safe-mode-toggle");
    const banner = $("safe-mode-banner");
    const hint = $("search-url-hint");
    const urlInput = $("search-url");

    toggle.classList.toggle("on", safeMode);
    toggle.setAttribute("aria-pressed", String(safeMode));
    urlInput.disabled = safeMode;

    if (safeMode) {
        banner.className = "banner banner-success";
        banner.textContent = "Safe mode is ON - nothing here touches a real site or account.";
        hint.textContent = "Safe mode: generates realistic fake leads. The URL above is ignored.";
    } else {
        banner.className = "banner banner-warning";
        banner.textContent = "Safe mode is OFF. LinkedIn Sales Navigator will now log into your real " +
            "account and drive a real browser session - that's a ToS violation and carries real risk " +
            "of account restriction. Keep run sizes small and prefer your own account only.";
        hint.textContent = 'Build/save a lead search inside Sales Navigator, then paste the resulting URL above.';
    }
}

$("safe-mode-toggle").addEventListener("click", () => {
    safeMode = !safeMode;
    applySafeModeUI();
});

// ---------- Log helper ----------

function log(elId, message, kind) {
    const el = $(elId);
    el.style.display = "";
    const span = document.createElement("div");
    if (kind) span.className = kind;
    span.textContent = message;
    el.appendChild(span);
    el.scrollTop = el.scrollHeight;
}

function clearLog(elId) {
    const el = $(elId);
    el.innerHTML = "";
}

// ---------- Results table ----------

function renderResults(results) {
    lastResults = results;
    const wrap = $("results-wrap");
    const exportRow = $("export-row");
    if (!results.length) {
        wrap.style.display = "none";
        exportRow.style.display = "none";
        return;
    }
    const columns = Object.keys(results[0]);
    $("results-head").innerHTML = columns.map((c) => `<th>${c}</th>`).join("");
    $("results-body").innerHTML = results
        .map((row) => "<tr>" + columns.map((c) => `<td>${row[c] ?? ""}</td>`).join("") + "</tr>")
        .join("");
    wrap.style.display = "";
    exportRow.style.display = "";
}

function toCsv(results) {
    if (!results.length) return "";
    const columns = Object.keys(results[0]);
    const escape = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
    const lines = [columns.join(",")];
    for (const row of results) {
        lines.push(columns.map((c) => escape(row[c])).join(","));
    }
    return lines.join("\n");
}

$("export-csv-btn").addEventListener("click", () => {
    const csv = toCsv(lastResults);
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "linkedin_leads.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
});

// ---------- Scraping ----------

$("scrape-btn").addEventListener("click", async () => {
    const searchUrl = $("search-url").value.trim();
    const maxResults = parseInt($("max-results").value, 10) || 10;

    if (!safeMode && !searchUrl) {
        log("scrape-log", "Paste a Sales Navigator search URL first (or turn on Safe mode).", "err");
        return;
    }

    const btn = $("scrape-btn");
    btn.disabled = true;
    clearLog("scrape-log");
    log("scrape-log", safeMode ? "Generating safe demo leads..." : "Scraping LinkedIn Sales Navigator...");

    try {
        const resp = await fetch("/api/scrapper/scrape", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ search_url: searchUrl, max_results: maxResults, mock: safeMode }),
        });
        const data = await resp.json();
        if (!resp.ok) throw new Error(data.detail || "Scrape failed");

        renderResults(data.results);
        log("scrape-log", `${safeMode ? "Generated" : "Scraped"} ${data.results.length} leads.`, "ok");
    } catch (err) {
        log("scrape-log", "Scrape failed: " + err.message, "err");
    } finally {
        btn.disabled = false;
    }
});

// ---------- Settings ----------

$("delay-min").addEventListener("input", (e) => ($("delay-min-value").textContent = parseFloat(e.target.value).toFixed(1)));
$("delay-max").addEventListener("input", (e) => ($("delay-max-value").textContent = parseFloat(e.target.value).toFixed(1)));

async function loadSettings() {
    const resp = await fetch("/api/scrapper/settings");
    const data = await resp.json();
    $("li-email").value = data.linkedin_email;
    $("headless-checkbox").checked = data.headless;
    $("delay-min").value = data.delay_min;
    $("delay-max").value = data.delay_max;
    $("delay-min-value").textContent = data.delay_min.toFixed(1);
    $("delay-max-value").textContent = data.delay_max.toFixed(1);
}

$("save-settings-btn").addEventListener("click", async () => {
    const payload = {
        linkedin_email: $("li-email").value.trim(),
        linkedin_password: $("li-password").value,
        headless: $("headless-checkbox").checked,
        delay_min: parseFloat($("delay-min").value),
        delay_max: parseFloat($("delay-max").value),
    };
    const resp = await fetch("/api/scrapper/settings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });
    clearLog("settings-log");
    if (resp.ok) {
        log("settings-log", "Saved. The LinkedIn tab will pick this up on its next run.", "ok");
        $("li-password").value = "";
        refreshStatus();
    } else {
        log("settings-log", "Failed to save settings.", "err");
    }
});

// ---------- Demo data reset ----------

$("reset-data-btn").addEventListener("click", async () => {
    await fetch("/api/scrapper/reset", { method: "POST" });
    renderResults([]);
    clearLog("scrape-log");
    log("scrape-log", "Data cleared.", "ok");
});

// ---------- Initial load ----------

async function refreshStatus() {
    const resp = await fetch("/api/scrapper/status");
    const data = await resp.json();
    $("linkedin-status").textContent = "LinkedIn credentials: " + (data.linkedin_configured ? "configured" : "not set");
    return data;
}

(async function init() {
    const status = await refreshStatus();
    safeMode = status.safe_mode_default;
    applySafeModeUI();
    await loadSettings();
})();
