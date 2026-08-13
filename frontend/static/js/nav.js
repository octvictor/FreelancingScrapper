// Shared helpers + page/tab navigation. Loaded before any per-tool
// script (scrapper.js, gatherer.js), which rely on $() being defined.

function $(id) {
    return document.getElementById(id);
}

const PAGE_IDS = ["tracker", "gatherer", "scrapper"];

document.querySelectorAll(".nav-item").forEach((btn) => {
    btn.addEventListener("click", () => {
        document.querySelectorAll(".nav-item").forEach((b) => b.classList.remove("active"));
        btn.classList.add("active");
        const page = btn.dataset.page;

        PAGE_IDS.forEach((id) => {
            const section = $("page-" + id);
            if (section) section.style.display = id === page ? "" : "none";
        });
        $("scrapper-sidebar").style.display = page === "scrapper" ? "" : "none";
        document.querySelector(".main").classList.toggle("main-wide", page === "gatherer");
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
