// Settings -> Backup. One zip of everything, taken on demand.
//
// The whole point is that it is one click when you are not panicking, so
// there is nothing to configure here: no destination picker, no schedule,
// no "what would you like included". It takes everything, names the file
// after the moment, and tells you where it went.

let backupBusy = false;

function backupSizeLabel(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// "27 Aug 2026, 15:16" - the stamp in the filename is sortable but hard to
// read, and this row is scanned by eye to find "the one from before I
// changed everything".
function backupWhen(iso) {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString(undefined, {
        day: "numeric", month: "short", year: "numeric",
        hour: "2-digit", minute: "2-digit",
    });
}

function renderBackupList(data) {
    const host = $("settings-backup-list");
    const backups = data.backups || [];
    if (!backups.length) {
        host.innerHTML = `<p class="settings-hint backup-empty">No backups yet.</p>`;
        return;
    }
    host.innerHTML = `
        <div class="backup-list">
            ${backups.map((b) => `
                <div class="backup-row" data-name="${escapeAttr(b.name)}">
                    <span class="backup-row-when">${escapeAttr(backupWhen(b.created_at))}</span>
                    <span class="backup-row-size">${escapeAttr(backupSizeLabel(b.size_bytes))}</span>
                    <button class="row-delete-btn" data-role="delete-backup" type="button"
                            title="Delete this backup">${ICON_TRASH_SVG}</button>
                </div>
            `).join("")}
        </div>
    `;
}

async function refreshBackups() {
    const resp = await fetch("/api/backups");
    if (!resp.ok) return;
    const data = await resp.json();
    renderBackupList(data);
    return data;
}

$("settings-backup-now").addEventListener("click", async () => {
    // Guarded because zipping a folder of project documents is not
    // instant, and a second click during it would write a second archive
    // for no reason.
    if (backupBusy) return;
    backupBusy = true;

    const btn = $("settings-backup-now");
    const status = $("settings-backup-status");
    const label = btn.textContent;
    btn.textContent = "Backing up...";
    btn.disabled = true;
    status.classList.remove("is-error");
    status.textContent = "";

    try {
        const resp = await fetch("/api/backups", { method: "POST" });
        if (!resp.ok) throw new Error(await resp.text());
        const made = await resp.json();
        // The folder is named, not just the file: a backup you cannot find
        // is not a backup, and this is the one place the path is on screen.
        status.textContent = `Saved ${made.name} (${backupSizeLabel(made.size_bytes)}) in ${made.folder}`;
        await refreshBackups();
    } catch (err) {
        status.classList.add("is-error");
        status.textContent = `Backup failed: ${err.message || err}`;
    } finally {
        btn.textContent = label;
        btn.disabled = false;
        backupBusy = false;
    }
});

$("settings-backup-reveal").addEventListener("click", async () => {
    const resp = await fetch("/api/backups/reveal", { method: "POST" });
    if (resp.ok) return;
    const status = $("settings-backup-status");
    status.classList.add("is-error");
    status.textContent = "Could not open the folder from here.";
});

$("settings-backup-list").addEventListener("click", async (e) => {
    const btn = e.target.closest("[data-role='delete-backup']");
    if (!btn) return;
    const name = btn.closest(".backup-row").dataset.name;
    if (!(await confirmDialog("This only deletes the backup, not your live data.",
                              { title: "Delete this backup?" }))) return;
    await fetch(`/api/backups/${encodeURIComponent(name)}`, { method: "DELETE" });
    await refreshBackups();
});

$("settings-backup-toggle").addEventListener("click", () => {
    const head = $("settings-backup-toggle");
    const open = head.getAttribute("aria-expanded") !== "true";
    head.setAttribute("aria-expanded", String(open));
    head.closest(".settings-group").classList.toggle("open", open);
    // Listed only when the group is opened. Nobody needs the backup list
    // fetched on every app launch, and it is the one thing here that
    // touches the disk.
    if (open) refreshBackups();
});
