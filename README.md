# Freelancing Tools

A personal-use suite of tools for freelance 3D artist work: a FastAPI
backend + a hand-built HTML/CSS/JS frontend (no Node/React build step -
plain static files, so nothing extra to install), with a vertical tool
menu in the sidebar. Currently:

- **Tracker** - project cards, first in the sidebar. Cards are centered
  on the page and start empty, with a "+ New project" card to create
  one. Clicking a card opens a popup with the project's status
  (Active/Completed), a deadline, a day rate, and "Docs" - a single
  place to attach both contract and invoice files (real file uploads,
  stored on disk next to the database). Every field autosaves on
  blur/change, no separate save button.
- **Gatherer** - a manually-curated list of studios/companies you find
  yourself (Behance, Instagram, wherever) - Title, clickable URL, Type
  (Studio/Company, shown as a purple/orange pill), and outreach Status
  (Sent/Not sent, shown as a gray/green pill, with a date). Inline-
  editable like a spreadsheet: click a cell, type, it saves - no
  separate save button. Click "+ Add row" for a new one. The Type and
  Status column headers double as filters - pick a value to narrow the
  table to just that value, blank to show everything again.
- **Scrapper** - finds 3D artist job leads. Right now: LinkedIn Sales
  Navigator, scraping a lead search you build yourself (e.g. current
  title contains "3D Artist" OR "CG Artist") into a list of people + the
  companies they work at.

Each scrape's results are shown right in the app and can be exported to
CSV. Everything also lands in a shared local SQLite database
(`data/scraper.db`) so results accumulate across runs instead of being
lost between sessions.

## Safe mode

Scrapper's sidebar has a **Safe mode** toggle, ON by default. With it
on, it generates realistic fake data instead of touching a real site -
no login, no network call, no risk to any real account. It's there so
you can click through the whole tool, see exactly how it behaves, and
iterate on the design/workflow freely before ever pointing it at a real
LinkedIn account. Turn it off only when you actually want to run a real
scrape.

## Read this first: risk (applies once Safe mode is off)

Scrapper's LinkedIn module works by logging into **your own** account
with Playwright and driving a real browser session - this is different
(and riskier) than scraping a public page:

- LinkedIn's Terms of Service prohibit automated data collection. Using
  automation on an authenticated session is more likely to get detected
  than scraping logged-out public pages, and the practical consequence
  is account restriction or a ban - which matters more for a paid Sales
  Navigator seat.
- This tool is built for **your own personal use, on your own account, at
  low volume** (tens of results per run, not hundreds), not as something
  to package up and hand to other people or run against accounts you
  don't own.
- Keep the delay settings in Scrapper's Settings tab conservative. They
  exist specifically to look less like a bot - don't shorten them just
  to finish a run faster.
- Login checkpoints (2FA, "verify it's you", CAPTCHA) can't be solved by
  the script. Keep "Run browser headless" OFF (the default) so the
  browser window is visible and you can solve them by hand; the script
  waits and continues automatically once you do.

## Two ways to run this

- **Packaged app** - build once, then just double-click an icon forever.
  Best if you're not planning to edit the code.
- **From source** - venv + a run script. Best if you're actively changing
  scrapers/frontend, since edits take effect instantly (no rebuild).

You can do both; they share the same `.env` credentials once you fill
them in via Scrapper's in-app Settings tab.

### Option A: packaged app (double-click, no terminal after setup)

One-time build, on the same OS you'll actually use the app on (a build
made on Mac won't run on Windows and vice versa):

```bash
./build_app.sh      # Windows: build_app.bat / Mac: double-click build_app.command
```

This creates `dist/FreelancingTools` (`dist/FreelancingTools.exe` on
Windows) - a single self-contained file with Python, FastAPI, and
Playwright all bundled in. Move it wherever you like and double-click it
to launch; it opens in your browser automatically. Safe mode works
immediately with no further setup. If you turn Safe mode off, first
launch takes a bit longer while it downloads the browser component it
needs (needs a normal internet connection, one-time).

Enter your LinkedIn credentials from inside the app itself, in
Scrapper's **Settings** tab - no `.env` file editing required. They're
written to a `.env` file that lives next to the executable and never
leaves your machine.

Re-run the build script only when you change `requirements.txt` or pull
down new scraper code - not for regular use.

### Option B: from source (for actively editing the code)

Just run:

```bash
./run.sh       # Windows: run.bat (double-click it) / Mac: run.command (double-click it)
```

**First time**, this sets itself up automatically - creates a virtual
environment and installs everything - which takes a minute or two.
**Every time after that**, it just starts the app straight away. Either
way, it opens in your browser at `http://localhost:8501`. Leave that
terminal window running while you work.

You don't need `playwright install chromium` at all unless you plan to
turn Safe mode off - Safe mode never touches the browser component.

Credentials go in Scrapper's in-app **Settings** tab (writes to a local
`.env` for you) - no manual file editing needed.

**Windows note:** if you're using PowerShell and see errors about
`source` not being recognized, or about running scripts being disabled -
ignore them and just double-click `run.bat` in File Explorer instead of
typing commands. `run.bat` handles all of this correctly on its own.

**Testing a code change:** frontend files (`frontend/index.html`,
`frontend/static/**`) are served straight from disk - edit, save, and
just refresh the browser tab, no restart needed, on any OS.

Backend files (`server.py`, `api/*.py`, `scrapers/*.py`): on Mac/Linux,
`run.sh` passes uvicorn `--reload`, which watches those files and
restarts the server automatically on save. `run.bat` does **not** use
`--reload`, staying conservative around a known class of issue where its
subprocess-based file watcher doesn't correctly inherit an active venv
on some Windows setups. So on Windows, a backend edit needs a manual
restart: `Ctrl+C` in the `run.bat` window, then run it again.

Both `run.sh` and `run.bat` re-run `pip install -r requirements.txt`
every time (not just the first time `.venv` is created) - a plain-satisfied
install is a fast no-op, and this is what actually picks up a
`requirements.txt` change (like a new dependency) into an existing venv.
An earlier version of these scripts only installed once, which meant
pulling a change that added a new dependency didn't actually install it
into a venv from before that change - the fix is on both scripts now.

## Project layout

- `server.py` - FastAPI app: mounts the frontend and the API routers.
  This is the whole "navigation shell" - the extension point for a new
  tool is one new file under `api/`, one under `frontend/static/js/`,
  and one `<button class="nav-item">` + `<section>` in
  `frontend/index.html`.
- `api/scrapper.py`, `api/gatherer.py`, `api/tracker.py` - HTTP routes
  per tool, wrapping the storage/scraper logic below. `api/tracker.py`
  also owns reading/writing uploaded Docs files on disk (under
  `data/project_docs/<project_id>/`), since that's specific to Tracker
  rather than shared storage logic.
- `frontend/index.html` - the whole page shell (both tools' markup live
  here, shown/hidden by `nav.js`).
- `frontend/static/css/app.css` - design tokens + all component styles.
- `frontend/static/js/nav.js` - shared page/tab-switching, loaded first.
- `frontend/static/js/scrapper.js`, `frontend/static/js/gatherer.js` -
  one file per tool, no shared state between them beyond `nav.js`'s `$()`.
- `scrapers/` - the actual scraping logic, independent of the UI.
- `storage/db.py` - shared SQLite layer any tool can write into.
- `app_paths.py` - where persistent data/credentials live on disk.

## Notes on selector fragility (real scraping only, Safe mode is unaffected)

`scrapers/linkedin_salesnav.py` was written without live network access
to verify current page markup. It tries several candidate CSS selectors
per field as a hedge, but LinkedIn changes its DOM regularly, so a real
(mock=False) run may come back with 0 results until you adjust the
selectors.

When that happens:

1. Check `data/debug/` (next to `server.py` when running from source, or
   next to the executable for the packaged app) - the scraper dumps the
   page HTML there automatically when it can't find any results.
2. Open that HTML file, find the real structure for the field that's
   missing, and update the relevant `*_SELECTORS` list at the top of
   `scrapers/linkedin_salesnav.py`.

## Data model

SQLite (`data/scraper.db`, next to `server.py` or next to the packaged
executable), shared across every tool:

- `companies` - name, source, url, industry, location, notes, first/last
  seen. Upserted by name, so the same company discovered via multiple
  scrapes accumulates notes rather than duplicating.
- `people` - name, title, company_name, location, profile_url, source.
  Populated by the LinkedIn scraper.
- `job_postings` - title, company_name, url, location, description,
  source, posted_date.
- `scrape_runs` - a log of every scrape attempt (source, query, result
  count, status, error) for debugging.
- `gatherer_entries` - title, url, type (Studio/Company), status
  (Sent/Not sent), sent_date, created_at, updated_at. Gatherer's own
  table, separate from `companies` since it's manually-curated data with
  a different shape, not something a scraper writes into.
- `projects` - title, status (Active/Completed), deadline, day_rate,
  created_at, updated_at. Tracker's own table.
- `project_docs` - project_id, filename (original name shown in the UI),
  stored_name (the collision-proofed name it's actually saved as on
  disk), uploaded_at. The files themselves live under
  `data/project_docs/<project_id>/`, not in the database - this table
  just points at them.

Scrapper's sidebar has a "Reset all data" button to clear every
Scrapper table between test runs (doesn't touch `gatherer_entries` or
Tracker's tables).

## Roadmap / not built yet

- Tracker - base project cards + detail popup are built (status,
  deadline, day rate, Docs). Everything else for this tab (e.g. tasks
  per project, like the reference screenshot's "Task track." table) is
  still to be discussed/designed.
- Company job-board scraping (many studios post openings on their own
  career pages) - straightforward to add per-company once you have a
  company list from Scrapper.
- Scheduling (currently everything is triggered manually from the GUI).
- Notifications (e.g. Slack/email) on new matches.
