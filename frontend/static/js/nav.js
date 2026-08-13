// Shared helpers + page/tab navigation. Loaded before any per-tool
// script (scrapper.js, gatherer.js), which rely on $() being defined.

function $(id) {
    return document.getElementById(id);
}

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
