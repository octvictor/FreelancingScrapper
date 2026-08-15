# Freelancing Tools

A personal-use suite of tools for freelance 3D artist work: a FastAPI
backend + a hand-built HTML/CSS/JS frontend (no Node/React build step -
plain static files, so nothing extra to install), with a vertical tool
menu in the sidebar. Currently:

Tracker and Gatherer live under a collapsible **Tools** section in the
sidebar (click the section header to fold/unfold it). Below it sits a
second collapsible section, **Management**, for non-client-work
items - To Do, Notes, and Finances.

- **Tracker** (shown in the sidebar as "Project Manager") - a project
  table with a drag handle, Title, Description, Status
  (Active/Completed), and Paid/Unpaid, each pill directly editable
  inline like Gatherer's (Paid/Unpaid use a neutral grey/off-white
  tint rather than a status color, since being paid isn't a workflow
  state). An Active/Completed toggle above the table filters which
  rows show; each view caps at 5 rows with its own "Show more/less"
  button at the bottom so a long list doesn't dwarf the page. A
  "+ New project" button below the table creates one. Rows can be
  dragged by the handle to reorder them - the order persists.
  Clicking a row anywhere else opens a popup: a description,
  project status, a client name, a deadline, a day rate (with a
  USD/EUR/GBP/BRL currency picker), "Docs" - a single place to attach
  both contract and invoice files (real file uploads, stored on disk
  next to the database) - and a side panel with Assets/Notes/Briefing
  tabs, each a freeform autosaving text area. Below that, a "Log" table
  for logging work sessions (Task, Status, Duration, Observation, Cost,
  Date), inline-editable like a spreadsheet - Duration auto-fills Cost
  from the day rate (Full = full rate, Half = half, Custom = manual,
  and unlocks the Observation cell) - with a running cost Sum in the
  selected currency. Every field autosaves on blur/change, no separate
  save button. Below that table, a collapsible **Personal Projects**
  section holds a second, simpler project list for work that isn't for
  a client - same row/table look, Active/Completed toggle, 5-row cap,
  and drag-to-reorder, but no Paid column. Its (wider) popup only has a
  description, project status, an Assets/Notes/References panel (no
  Client/Deadline/Day rate/Docs/Log, since none of that applies to a
  personal project), and a Checklist - a plain to-do list, checkbox on
  the left of a freeform title (checked items turn blue and get a
  strikethrough), with "+ Add item" for more rows. Backed by its own
  `personal_projects`/`personal_checklist_items` tables, entirely
  separate from `projects`.
- **Gatherer** (shown in the sidebar as "Studio Database") - a
  manually-curated list of studios/companies you find yourself
  (Behance, Instagram, wherever) - Title, clickable URL, Type
  (Studio/Company, a neutral grey pill - the type doesn't carry a
  status, so it doesn't get a status color), and outreach Status
  (Sent/Not sent, shown as a gray/green pill, with a date). Inline-
  editable like a spreadsheet: click a cell, type, it saves - no
  separate save button. Click "+ Add row" for a new one. The Type and
  Status column headers double as filters - pick a value to narrow the
  table to just that value, blank to show everything again.
- **To Do** (under Management, noticeably wider than the other tools -
  not full-width, just roomier) - inspired by Microsoft To Do.
  Multiple lists in a rail on the left; a star sits to the right of
  every list's name there - always visible, grey by default and gold
  once favorited, toggled directly from the rail without selecting the
  list first - and a matching star above the rail filters it down to
  just favorited lists. "+ New list" adds one. Click a list's name in
  the tasks pane to rename it; a color swatch to the title's left opens
  the shared color wheel, shown as a dot next to the list's name in
  the rail. "Delete list" sits to the title's right. Favoriting
  only applies to lists - there's no importance concept for individual
  tasks. Each list is a set of checkbox tasks - check one off and it
  drops into a collapsed "Completed (n)" section below the active
  ones, with a "Clean" link right in that section's header to clear
  out every completed task in one go (confirms first, shows how many).
  Clicking a task (anywhere but its checkbox/delete) opens a detail
  view: title in a header row, a Steps checklist (a mini to-do list
  within the task, same checkbox-and-title pattern as Personal
  Projects' Checklist), and a freeform Notes text area. Everything
  autosaves on blur/change.
- **Notes** (under Management, no page title of its own - the sidebar
  already labels it) - a Google Keep-style board of cards. A dashed
  "+" tile is always the first card; clicking it opens a small popover
  to choose Text note or List before creating anything (a note's type
  is fixed at creation - a text note has a freeform body, a list note
  has a checklist instead) and immediately opens the new note's detail
  modal so title/content get entered in a bigger space. Cards
  themselves are read-only previews - clicking one (anywhere but its
  color/delete controls or a list item's checkbox) reopens that modal
  for full editing; a list note's items use the same checkbox-and-title
  row as To Do's Steps, with "+ Add item" for more, and can also be
  checked off straight from the card preview without opening the
  modal. Cards flow into a responsive masonry grid (CSS columns, so it
  reflows its own column count as the window resizes) and can be
  dragged by a small handle to reorder - the order persists. Each card
  has a color button (a fixed grey glyph, not tinted by the note's own
  color) opening the same shared color wheel used by To Do's list
  colors, applied as the card's full background - text on the card
  switches to dark automatically for a light enough pick - and an
  always-visible red delete button (with the themed confirm dialog).
- **Finances** (under Management) - a page for money tools, starting
  with **Calculator**, a section labeled by its own heading inside the
  page (more Finances features can join it later). Calculator is
  browser-tab-style, holding any number of independent spreadsheet-
  style ledgers ("tables"). A tab bar lists every table as a plain
  button showing its title - clicking one switches to it, and that's
  all a tab does; there's nothing to type into or delete on the tab
  itself. Renaming happens once, in an editable title field inside the
  active table's panel - the tab it belongs to just displays whatever
  that field currently holds. A "Delete" link sits on the same row as
  that field, right-aligned, and removes the active table (confirms
  first) - if it was the last one left, a fresh blank table takes its
  place so Calculator is never left empty. Each table is the same
  inline-editable "+ Add row" look as Studio Database: every row has a
  Title, a small round color swatch to its left (opening the same
  shared color wheel as To Do/Notes' colors - like To Do, only the
  swatch itself shows the color, the row's own background never gets
  tinted)
  and a currency-formatted Value; a "+" button in the header adds
  further freeform text columns shared across every row (also inline-
  renamable), each with its own delete button - Title and Value are
  permanent and never get one. One currency (USD/EUR/GBP/BRL) applies
  per table via a picker above it, matching Tracker's Day rate currency
  picker, so a running Sum at the bottom is always one coherent total -
  a negative Value just subtracts from it, being plain addition under
  the hood, and the Sum still counts every row even the ones collapsed
  behind "Show more" (rows past the 7th on a table cap there, same
  pattern as Project Manager's list).

Everything lands in a shared local SQLite database (`data/scraper.db`)
so it accumulates across sessions instead of being lost between runs.

## Two ways to run this

- **Packaged app** - build once, then just double-click an icon forever.
  Best if you're not planning to edit the code.
- **From source** - venv + a run script. Best if you're actively changing
  the frontend/backend, since edits take effect instantly (no rebuild).

You can do both; they share the same local SQLite database.

### Option A: packaged app (double-click, no terminal after setup)

One-time build, on the same OS you'll actually use the app on (a build
made on Mac won't run on Windows and vice versa):

```bash
./build_app.sh      # Windows: build_app.bat / Mac: double-click build_app.command
```

This creates `dist/FreelancingTools` (`dist/FreelancingTools.exe` on
Windows) - a single self-contained file with Python and FastAPI bundled
in. Move it wherever you like and double-click it to launch; it opens in
your browser automatically.

Re-run the build script only when you change `requirements.txt` or pull
down new code - not for regular use.

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

**Windows note:** if you're using PowerShell and see errors about
`source` not being recognized, or about running scripts being disabled -
ignore them and just double-click `run.bat` in File Explorer instead of
typing commands. `run.bat` handles all of this correctly on its own.

**Testing a code change:** frontend files (`frontend/index.html`,
`frontend/static/**`) are served straight from disk - edit, save, and
just refresh the browser tab, no restart needed, on any OS.

Backend files (`server.py`, `api/*.py`, `storage/*.py`): on Mac/Linux,
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
- `api/gatherer.py`, `api/tracker.py`, `api/todo.py` - HTTP routes per
  tool, wrapping the storage logic below. `api/tracker.py` also owns
  reading/writing uploaded Docs files on disk (under
  `data/project_docs/<project_id>/`), since that's specific to Tracker
  rather than shared storage logic.
- `frontend/index.html` - the whole page shell (every tool's markup
  lives here, shown/hidden by `nav.js`).
- `frontend/static/css/app.css` - design tokens + all component styles.
- `frontend/static/js/nav.js` - shared page navigation, the custom
  dropdown component, and a themed `confirmDialog()` (used in place of
  the browser's native `confirm()` for every delete action) - loaded
  first since every tool depends on it.
- `frontend/static/js/gatherer.js`, `frontend/static/js/tracker.js`,
  `frontend/static/js/todo.js` - one file per tool, no shared state
  between them beyond `nav.js`'s `$()`.
- `storage/db.py` - shared SQLite layer any tool can write into.
- `app_paths.py` - where persistent data lives on disk.

## Data model

SQLite (`data/scraper.db`, next to `server.py` or next to the packaged
executable), shared across every tool:

- `gatherer_entries` - title, url, type (Studio/Company), status
  (Sent/Not sent), sent_date, created_at, updated_at. Gatherer's own
  table.
- `projects` - title, description, status (Active/Completed), paid
  (Paid/Unpaid), client, deadline, day_rate, currency
  (USD/EUR/GBP/BRL), assets_text/notes_text/briefing_text (the side
  panel's three tabs), position (manual drag order within a status
  view), created_at, updated_at. Tracker's own table.
- `project_docs` - project_id, filename (original name shown in the UI),
  stored_name (the collision-proofed name it's actually saved as on
  disk), uploaded_at. The files themselves live under
  `data/project_docs/<project_id>/`, not in the database - this table
  just points at them.
- `project_tasks` - project_id, task, status (Active/Done), duration
  (Full/Half/Custom), cost, observation (only usable when duration is
  Custom), task_date, created_at, updated_at. Backs a project's Log
  table.
- `personal_projects` - title, description, status (Active/Completed),
  assets_text/notes_text/references_text (the side panel's three
  tabs), position (manual drag order within a status view), created_at,
  updated_at. A separate, simpler table from `projects` - no
  client/deadline/day rate/docs/tasks, since personal projects don't
  bill anyone.
- `personal_checklist_items` - personal_project_id, text, checked,
  created_at, updated_at. Backs a personal project's Checklist.
- `todo_lists` - title, favorite, color, created_at, updated_at. To
  Do's lists.
- `todo_tasks` - list_id, title, completed, important, notes,
  position (manual create-order, newest on top), created_at,
  updated_at. A list's tasks.
- `todo_steps` - task_id, text, checked, created_at, updated_at. Backs
  a task's Steps mini-checklist.
- `notes` - title, body, type ('text' or 'list'), color, position
  (manual drag order), created_at, updated_at. Notes' own table, a flat
  board (no lists/nesting).
- `note_items` - note_id, text, checked, created_at, updated_at. Backs
  a 'list'-type note's checklist.
- `finance_tables` - title, currency, position, created_at, updated_at.
  One row per Calculator tab - each tab is fully independent, with its
  own columns, rows, and currency.
- `finance_columns` - table_id, name, created_at. Any extra freeform
  columns added on top of Title/Value for that table, shared across
  every row in it, deletable independently of Title/Value.
- `finance_rows` - table_id, title, value, color, created_at,
  updated_at. A table's own rows - Title, Value, and an optional row
  color are fixed columns on the row itself.
- `finance_cells` - row_id, column_id, value (unique per row+column
  pair). An EAV side table backing each row's value in a
  `finance_columns` entry, so columns can be added/renamed/deleted
  freely without an ALTER TABLE per column or backfilling every
  existing row.

## Roadmap / not built yet

- Scheduling (currently everything is triggered manually from the GUI).
- Notifications (e.g. Slack/email) on new matches.
- Wider content area for the other tools too (To Do, Notes, and
  Calculator already got this) - not full-width, just noticeably
  roomier than today.

## Design system notes

A few shared rules to keep in mind so new UI stays consistent with the
rest of the app instead of drifting:

- **Rounded corners everywhere.** Every container, button, input, pill,
  and popover uses one of the `--radius-*` tokens in
  `frontend/static/css/app.css` (`--radius-lg` for panels/cards,
  `--radius-md` for buttons/dropdowns, `--radius-sm` for small icon
  buttons, `--radius-pill` for status pills, `50%` for circular
  swatches) - never a bare `border-radius` value and never left
  unset. A couple of elements (Notes cards, Calculator's tab buttons,
  popovers, the modal close button) previously shipped without one and
  read as sharp against everything else; that's the failure mode to
  avoid when adding something new.
- **One swatch size app-wide.** Every color-picker trigger (To Do's
  list color, Notes' card color, Calculator's row color) shares the
  same `.swatch-btn` class in app.css, which is what keeps them the
  same size automatically - resize that one rule rather than
  overriding size per-tool.
- **One color picker, everywhere.** `openColorWheelPopover()` in
  `frontend/static/js/nav.js` is the app's only color picker - a
  free-form hue/saturation wheel, a lightness slider, and a hex field
  for precision, plus a "No color" link. Every color-picking swatch in
  the app (To Do's list color, Notes' card color, Calculator's row
  color, and whatever gets added next) opens this one popover and
  hands it a save callback and a clear callback, rather than keeping
  its own popover or preset list - there is no fixed palette to pick
  from anymore, any color is fair game. `colorNeedsDarkText()` (also
  in nav.js, a standard luma check) decides whether a chosen color is
  light enough to need dark text instead of white on top of it - it
  only matters for a picker that tints an entire surface with text on
  it (currently just Notes' card background); a picker that only fills
  a small standalone swatch icon (To Do, Calculator) never needs this
  since there's no text sitting on the color itself.
