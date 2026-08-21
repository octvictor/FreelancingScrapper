# VAIO

A personal-use suite of tools for freelance 3D artist work: a FastAPI
backend + a hand-built HTML/CSS/JS frontend (no Node/React build step -
plain static files, so nothing extra to install). Light theme (dark
mode returns later as a toggle), set in Google Sans Flex.

All the navigation lives in one permanent 247px rail down the left -
there is no header. The rail holds the asterisk icon + "vaio" wordmark,
the app's single search box beneath it, then six rows: Overview,
Projects and Studio Logs, a hairline, then To Do, Notes and
Calculator. Every row carries a Lucide icon plus its label and no
background of its own at rest; the open page's row gets a plain white
card with a soft shadow. The rail never shrinks, collapses, or hides.
The content field takes everything else, square on every side with no
radius and no gap - only its left edge, against the rail, keeps a border
- and bleeds to the window's top, right and bottom edges. Overview is the home page and
the default on launch, reached through the sidebar like any other page.

- **Overview** (shown as such, internally still "Overview") - the
  app's home page, its "Full Board" layout (one of three combinations
  mocked up and compared side by side before shipping). A greeting
  ("Good morning/afternoon/evening", time-of-day driven) and today's
  date, top-aligned with the sidebar's "Workspace" label; a quick-capture
  field right below it drops a line straight into Notes on Enter, no
  need to leave the page. Below that, two paired rows - Today's Focus
  (up to 5 incomplete to-dos, newest first, check one off right there
  without navigating) beside Due Soon (up to 5 active projects with a
  deadline, soonest first, an urgency-colored dot), then Active
  Projects beside Recent Notes - both capped at 3, tighter above than
  the row above them since there's less in them - and a small visual
  strip of the 4 most recently *created* notes at the bottom (each one
  its own color, same contrast logic Notes' own cards use). Every row's
  title renders in the Regular weight (Light reads too faint at this
  size) and is clickable, opening that item's real detail view via the
  same functions the header search already uses - nothing here is a
  dead end. The search box in the
  header searches titles across Tracker projects, Gatherer studios, To
  Do tasks, and Notes as you type, in a dropdown under the bar; clicking
  a result jumps to that tool and, where a detail view exists, opens it
  directly (a studio result just lands on Studio Logs, which has no
  per-row detail view).
- **Tracker** (shown as "Projects") - the panel wrapping the grid
  (and the Personal Projects panel below it) uses the darker `#e6e5e1`
  tone with no outline, so the lighter cards/fields inside stand out
  against it - the same panel/card relationship To Do's boards already
  use, just applied here too. A grid of project cards
  (auto-fits its cards to a 300px minimum width, so it may show two,
  three, or more across depending on window size), styled as an accent
  stripe rather than status pills: a colored left edge (amber Active,
  green Completed), a title, a two-line description clip, then Client
  and a Logs count (the number of Log rows under that project) at
  top-right. A hairline divider separates that from the footer -
  Status and Paid as plain colored/muted text with a dot between them
  on the left, the project's running Log Sum total (in its own
  currency) on the right. No date on the card itself. Status/Paid are
  no longer directly editable from the card (that pill-and-select look
  was dropped on purpose) - both live in the modal now, alongside
  everything else. An All/Active/Completed toggle above the grid
  filters which cards show; each view caps at 2 *rows* of cards, not a
  fixed card count - the grid wraps a different number of cards per row
  depending on window width (`repeat(auto-fill, minmax(300px, 1fr))`),
  so the cap is measured from where cards actually land after each
  render/resize rather than sliced off the list at a hardcoded index. A
  "Show more/less" button at the bottom reveals the rest so a long list
  doesn't dwarf the page. A "+ New project" button below the grid
  creates one. A
  small drag handle sits at the top-right of a card (next to the
  Client/Logs meta) on hover, for reordering - the order persists.
  Clicking a card anywhere else opens a popup: a description, project
  status, Paid, a client name, a deadline, a day rate (with a
  USD/EUR/GBP/BRL currency picker), "Docs" - a single place to attach
  both contract and invoice files (real file uploads, stored on disk
  next to the database) - and a side panel with Assets/Notes/Briefing
  tabs, each a freeform autosaving text area. Below that, a "Log" table
  for logging work sessions (Task, Status, Duration, Observation, Cost,
  Date), inline-editable like a spreadsheet - Duration auto-fills Cost
  from the day rate (Full = full rate, Half = half, Custom = manual,
  and unlocks the Observation cell) - with a running cost Sum in the
  selected currency; the card behind the modal keeps its own Logs/SUM
  stat live as tasks are added, removed, or re-costed, not just after
  the modal closes. Every field autosaves on blur/change, no separate
  save button. Below the grid, a collapsible **Personal Projects**
  section holds a second, simpler project list for work that isn't for
  a client - keeps the original row/table look (not cards; softened
  row striping - a faint tint plus a hairline under each row, not the
  harsh alternating grey the main table's cards moved away from), plus
  the same All/Active/Completed toggle, 5-row cap, and drag-to-reorder,
  but no Paid column. Its (wider) popup only has a
  description, project status, an Assets/Notes/References panel (no
  Client/Deadline/Day rate/Docs/Log, since none of that applies to a
  personal project), and a Checklist - a plain to-do list, checkbox on
  the left of a freeform title (checked items turn blue and get a
  strikethrough), with "+ Add item" for more rows. Backed by its own
  `personal_projects`/`personal_checklist_items` tables, entirely
  separate from `projects`.
- **Gatherer** (shown as "Studio Logs") - the table's wrapping panel
  uses the same darker `#e6e5e1`/no-outline treatment as Project
  Manager, so its lighter inline-editable fields stand out against it. A
  manually-curated list of studios/companies you find yourself
  (Behance, Instagram, wherever) - Title, clickable URL, Type
  (Studio/Company, a neutral grey pill - the type doesn't carry a
  status, so it doesn't get a status color), and outreach Status
  (Sent/Not sent, shown as a gray/green pill, with a date). Inline-
  editable like a spreadsheet: click a cell, type, it saves - no
  separate save button. Click "+ Add row" for a new one. The Type and
  Status column headers double as filters - pick a value to narrow the
  table to just that value, blank to show everything again.
- **To Do** - a Kanban board, one column per list, laid out side by side
  (horizontally scrolling once there are more than fit on screen) so
  every list is visible at once instead of clicked through one at a
  time. Column width stays fixed regardless of content - task titles
  wrap instead of stretching the column. A column's header holds a
  small color dot (the shared `.color-dot-btn` trigger - it grows on
  hover and opens the color preset popover; the chosen color also shows
  as a stripe on every card in that list), an editable title, a task
  count, and a delete (only visible on hover). "+ Add task" sits at the
  bottom of each column; a trailing "+ New list" column adds another
  list. Each task is a compact card: a colored stripe across the top in
  its list's color, the title, a checkbox to complete it without
  opening it, a Steps sub-checklist progress badge when the task has
  any steps (e.g. "2/5 steps", turning green once complete), and - when
  set - a due date shown as a small urgency-colored dot plus a relative
  label ("Today", "Tomorrow", "in 3 days") - red for overdue/today,
  amber for this week, blue for later, the same convention Command
  Center's Due Soon row uses. Checking a task off doesn't move it -
  it stays in place, title struck through and greyed, checkbox filled
  green. Favoriting lists exists at the data layer but isn't currently
  exposed in the UI. Clicking a card (anywhere but its checkbox) opens
  a detail view: title, a Due date field, a Steps checklist (a mini
  to-do list within the task, same checkbox-and-title pattern as
  Personal Projects' Checklist), and a freeform Notes text area.
  Everything autosaves on blur/change. Loosely inspired by Trello's
  card language (colored stripe + a checklist badge) but rebuilt in the
  app's own palette/type, not Trello's chrome. A **Due Soon** toast
  (bottom-right corner) checks for tasks due today or in the next
  couple of days whenever the app loads
  and every 30 minutes while the tab stays open - in-app only, no
  email/Slack/background job - listing them with the same urgency-dot
  convention; dismissing it holds for the rest of the session, and
  clicking a listed task jumps straight to it.
- **Notes** - a Google Keep-style board of cards, titleless - a note is
  just a body of text, or a checklist, with no separate title field
  anywhere. A dashed "+" tile is always the first card; clicking it
  creates a blank text note and drops straight into its detail modal,
  Notepad-style, no picker in the way. The modal itself is flush -
  borderless, background-less textarea, just a thin divider and the
  delete control - with a toggle button that switches the *same* note
  between Text and List at any time (not just at creation): text-to-list
  splits the body on newlines into checklist items, list-to-text joins
  the items back into lines. The modal's extra top padding (46px, up
  from the 28px every other modal uses) exists purely to clear that
  toggle button and the close (x) button - both float via
  `position:absolute` at the same `top:10px`, and without the extra
  padding the first checklist row started underneath them instead of
  below. Cards themselves are read-only previews - clicking one
  (anywhere but its color/delete controls or a list item's checkbox)
  reopens that modal for full editing; a list note's items use the same
  checkbox-and-text row as To Do's Steps (a `<textarea rows="1">` that
  grows downward as its own text wraps, rather than a single-line input
  that would scroll long text out of view - `autoGrowChecklistText()` in
  nav.js drives it, shared by Notes/To Do/Personal Projects' checklist
  alike since they're the same row markup), with "+ Add item" for more,
  and can also be checked off straight from the card preview without
  opening the modal. Since there's no title, both the card
  preview and any place Notes show up elsewhere (Overview's rows
  and strip, search results) derive a short label from the body's first
  line, or a list's first item text. Cards flow into a responsive
  masonry grid (CSS columns, so it reflows its own column count as the
  window resizes) and can be dragged by a small handle to reorder - the
  order persists. Each card has the shared `.color-dot-btn` color dot,
  deliberately fed a fixed neutral rather than the note's own color -
  here the color already fills the card behind it, so a matching dot
  would disappear into its own background (the dot flips between a
  light and dark neutral so it stays legible either way). It opens the
  same shared color preset popover To Do's list colors use, applied as
  the card's full
  background - text on the card switches to dark automatically for a
  light enough pick - and an always-visible red delete button (with the
  themed confirm dialog).
- **Calculator** - shown under its own **Finances** sidebar group rather
  than inside "Personal". The active table's panel uses the same darker
  `#e6e5e1`/no-outline treatment as Projects and Studio Logs; the
  tab bar above the panel is unaffected, since it isn't part of the
  panel itself. Browser-tab-style, holding any number of independent
  ledgers ("tables"). A tab bar lists every table as a plain button
  showing its title - clicking one switches to it, and that's all a tab
  does; there's nothing to type into or delete on the tab itself.
  Renaming happens once, in an editable title field inside the active
  table's panel, next to a small currency pill (USD/EUR/GBP/BRL) - the
  tab it belongs to just displays whatever the title field currently
  holds. That title field, and a row's own Title below it, are both
  read-only until double-clicked - there's no hover state to discover
  them by any more, so the table title carries a permanent faint tint
  at rest (no outline in either state) to read as a field at all, and
  both auto-size to their own text rather than sitting in a fixed-width
  box (a hidden same-font mirror span drives the width - see
  autoSizeTitleField in nav.js). The table title field's left edge
  lines up with the row card's own left edge below it (not the row's
  white Title pill, which sits inset inside that card by the card's own
  padding - a distinction that isn't obvious from a screenshot alone,
  confirmed by comparing getBoundingClientRect() on both in a live
  browser rather than trusting the rendered CSS by eye). Each
  entry is a card sitting on the dark panel, tinted with whatever color
  it's been given (or the plain light `--panel` fill if none) - the
  row's color lives only on the card's own background now, per a
  follow-up wireframe: a small colored dot opens the same shared color
  preset popover every other picker in the app uses (To Do's list
  color, Notes' card color) - the dot itself stays small at rest, but
  its actual click target is bigger than it looks and grows the dot to
  meet your cursor as you approach, so you don't have to land a click
  on an 8px circle - and both the Title and the Value/currency sit in
  their own fixed `#fafafa` field instead of directly on that color, so
  neither one needs to track it for contrast: Title text is always
  `#282828`, the "R$"-style currency prefix is always `#717171`, and
  the Value is always `#0fb54b` positive / `#c24236` negative / `#717171`
  zero-or-empty, regardless of what the card itself is tinted. The
  Title field sizes itself to its own text (a hidden same-font mirror
  span drives an absolutely-positioned input's width, updated on every
  keystroke) rather than filling the row, so it reads as a compact tag
  at the card's left edge; Toggle (Lucide circle-power) and Delete
  (Lucide trash-2) sit directly on the card's own color between the two
  fields, always visible now rather than a hover reveal, at a flat
  `#bdbdbd` regardless of the card's color - the one exception to the
  "give it its own fixed field" rule, since two small icons didn't
  need a third pill. Toggling a row off dims the whole card and blocks
  every field except the toggle and Delete from being clicked, and
  drops it from the Sum - for entries you want to keep on record
  without them counting. Both icons render at the same 16px,
  stroke-width:2 size as every other icon in the app (see "Design
  system notes" below) - Title and Value are the only two fields, fixed
  and permanent, with no custom-column feature. The Value is a
  text-only entry - a bare `type="number"` input's native up/down
  stepper is hidden, since this is a typed amount, not something
  incremented one unit at a time. One currency applies per table (the
  pill next to the title),
  matching Tracker's Day rate currency picker, so a running Sum at the
  bottom - a full-width total bar in the same light/shadowed card style
  - is always one coherent total: a negative Value just subtracts from
  it, being plain addition under the hood, and the Sum still counts
  every visible-and-active row even the ones collapsed behind "Show
  more" (rows past the 7th on a table cap there, same pattern as
  Projects's list). A dashed "+ Add row" card - matching Notes'
  add-note tile rather than a plain text link - creates a new one.

Everything lands in a shared local SQLite database (`data/vaio.db`)
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

This creates `dist/VAIO` (`dist/VAIO.exe` on
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
  and one `<button class="sb-item">` + `<section>` in
  `frontend/index.html`.
- `api/gatherer.py`, `api/tracker.py`, `api/todo.py` - HTTP routes per
  tool, wrapping the storage logic below. `api/tracker.py` also owns
  reading/writing uploaded Docs files on disk (under
  `data/project_docs/<project_id>/`), since that's specific to Tracker
  rather than shared storage logic.
- `api/overview.py` - read-only routes: the header search bar's
  cross-tool title search, plus the stats endpoint powering Command
  Center's Full Board (counts, due-soon, recent-notes, today's-focus,
  active-projects, notes-preview) - aggregates the other tools' tables,
  doesn't own any of its own. Quick capture and the Today's Focus
  checkbox don't add new routes - they call the existing Notes/To Do
  endpoints directly.
- `frontend/index.html` - the whole page shell (every tool's markup
  lives here, shown/hidden by `nav.js`).
- `frontend/static/css/app.css` - design tokens + all component styles.
- `frontend/static/js/nav.js` - shared page navigation (which page
  section is visible inside `.ct-card` and which `.sb-item` is marked
  active), the custom dropdown component, and a themed `confirmDialog()`
  (used in place of the browser's native `confirm()` for every delete
  action) - loaded first since every tool depends on it.
- `frontend/static/js/gatherer.js`, `frontend/static/js/tracker.js`,
  `frontend/static/js/todo.js` - one file per tool, no shared state
  between them beyond `nav.js`'s `$()`.
- `frontend/static/js/overview.js` - Overview's Full Board
  rendering (quick capture, Today's Focus, Due Soon, Active Projects,
  Recent Notes, Notes preview) and the header search bar's logic;
  reuses `openProjectModal`/`selectTodoList`+`openTodoTaskModal`/
  `openNoteModal` from the other tools' own files to open a detail view
  on click, the same functions a search jump already used, rather than
  duplicating that logic.
- `storage/db.py` - shared SQLite layer any tool can write into.
- `app_paths.py` - where persistent data lives on disk.

## Data model

SQLite (`data/vaio.db`, next to `server.py` or next to the packaged
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
- `notes` - body, type ('text' or 'list', mutable via the modal's toggle
  button), color, position (manual drag order), created_at, updated_at.
  Notes' own table, a flat board (no lists/nesting). Still has a `title`
  column for schema compatibility, but the frontend no longer reads or
  writes it - display everywhere derives a short label from `body`'s
  first line, or a list's first item text, instead.
- `note_items` - note_id, text, checked, created_at, updated_at. Backs
  a 'list'-type note's checklist.
- `finance_tables` - title, currency, position, created_at, updated_at.
  One row per Calculator tab - each tab is fully independent, with its
  own rows and currency.
- `finance_rows` - table_id, title, value, color, active, created_at,
  updated_at. A table's own rows - Title, Value, an optional row color,
  and the on/off toggle are fixed columns on the row itself.
- `finance_columns` / `finance_cells` - **dropped.** These backed a
  freeform-column feature (an extra column per table, with per-row values
  in `finance_cells` as an EAV side table) that was removed, leaving them
  unreachable. `init_db()` now drops both on startup, so an older local
  database cleans itself up on first run.

## Roadmap / not built yet

- Roadmap of possible future tools/pages, not yet designed:
  - Lead pipeline (Lead → Quoted → Won/Lost), upstream of Project
    Manager, for prospecting before a job is active.
  - Invoice generator, turning a project's day-rate math and
    Calculator's totals into an actual client-facing document.
  - Asset & reference library - tagged textures, HDRIs, rigs, and
    moodboard images per project, distinct from Notes.
  - Render job tracker - job, cost, status, output per render-farm or
    local render job.
  - Time tracking per project, feeding the existing day-rate math.
  - Software/subscription tracker (renewal dates, cost) alongside
    Calculator.
  - Client contact log - last contacted / next follow-up, attached to
    a Studio Database entry or project.
  - Portfolio/reel manager - what's currently in the demo reel and
    site, versioned, with a "last updated" nudge.
  - Quote/estimate builder - hours × day rate × complexity multiplier,
    a "before the job" companion to Calculator's "after the job" ledger.
  - Contract/NDA template library with client-specific fields to fill in.
  - Job board watcher - a feed of new listings, in spirit the successor
    to this app's original scraper, aimed at leads instead of studios.
  - Rate card - a reference page of service packages and prices.
  - Deliverables checklist per project (file format, texture
    resolution, UDIM layout, poly budget, naming convention).
  - Revision-round tracker - how many rounds a contract includes vs.
    how many have been used.
  - Deadline calendar view - a date-based alternate view of Project
    Manager's rows instead of a flat table.

## Design system notes

**Two themes, one rule: no color literal outside the token block.** Every
color in `app.css` is a named token defined twice - once on `:root` (light,
warm paper) and once on `:root[data-theme="dark"]` (warm charcoal). Adding
a color means adding a token with both values, not a hex where it is used.
Roughly seventy literals were spread through the stylesheet before dark
mode; they are gone, and the two blocks are checked for parity (same token
names on both sides) rather than by eye.

There are exactly two sanctioned exceptions, both in Notes: the
`.note-card-light` / `.note-card-dark` ramps and `.note-chip-dark-text` /
`.note-chip-light-text`. Those inks are chosen against the note's *own*
user-picked color, which does not change when the theme does, so they must
not follow the theme. The bug that proves the rule: the note chip on
Overview only had a class for the light-ink case, so a pale note fell
through to `--text` - fine on paper, invisible the moment `--text` went
pale. If a surface carries a user color, both ink cases need a class.

**A picked card color has to clear two rules that pull against each
other.** The picker's swatches tint a whole surface - a note, a To Do
list, a Calculator row - and a color is stored as one hex and painted on
both a `#fafafa` page and a `#1c1c1c` one. Rule one: stay under 5.5:1
against both grounds, which puts relative luminance in roughly
[0.15, 0.26]. (Under 4:1 against both is arithmetically impossible - the
grounds are too far apart.) Rule two: the text on the card, whose ink
`colorNeedsDarkText` picks, needs 4.5:1 - and mid-tone is the *worst*
place to be for that, since neither ink is far from it. The current ten
clear both, which cost the eight hues about 12% of their value; the two
neutrals sit slightly outside rule one on purpose, because "darker and
brighter grey" is a request for separation. Keep both checks, and keep
every hue clear of luma 0.55 where the ink flips and both inks are poor.

The pale tints the picker used to hold (`#C2E0CE`, `#88A8BF`) fail rule
one badly on charcoal. Colors already stored on existing rows still
render - they just are not offered any more.

Saturation, usefully, is free. Both rules are functions of relative
luminance alone, so chroma can be raised or dropped at fixed luminance and
neither check needs re-deriving - which is how the set went from muted to
its current 1.5x without another contrast pass. Only a change that moves
luminance needs the numbers run again.

**The dark greys are neutral, and that was a correction.** They shipped
warm first, mirroring the light theme's yellow-biased paper, on the theory
that the app should read as the same app with the lights off. In use it
read as a tan cast rather than as warmth - worst at small sizes, where
`--text-faint` on a panel looked like a third accent sitting next to the
real amber and green. The greys are now hue-free; the status hues were
never the problem and are untouched. One knock-on: dropping the tint costs
a grey some luminance, so `--text-faint` sits at `#7b7b7b` rather than the
`#76` the ramp wanted, which is what keeps the empty-state actions above
3:1 on `--panel-alt`.

Three relationships in the dark palette are deliberate and worth keeping:
panels always lift *toward* the light source (`--panel` is brighter than
`--bg` in both themes), `--panel-alt` inverts direction because its job is
"reads as a distinct surface" and that means recessing on paper but lifting
on charcoal, and `--accent` / `--accent-text` swap wholesale. Shadows do
not invert - there is no light shadow - they get darker and deeper. The ink
washes (`--ink-*`, used for hover tints and zebra stripes) do invert, and
land a little heavier, because a 3% wash disappears on charcoal.

A token that means "a surface on `--panel`" cannot *be* `--panel`, even
when the two are the same value in one theme. An uncolored Calculator row
was `--panel`, which on paper still reads because the row carries a shadow
- but in dark it was the exact tone of the page behind it and vanished.
Hence `--finance-row-bg`: same near-white as before in light, a lifted grey
in dark. Look for the same trap anywhere a card defaults to the surface it
sits on.

The theme is stamped on `<html>` by a blocking inline script in the
`<head>`, above the stylesheet link, so no frame of the wrong theme ever
paints. It reads localStorage, falls back to `prefers-color-scheme`, and
follows the OS only until the toggle is used once. Never apply the theme by
`@media` alone: the toggle has to be able to beat the OS in both
directions.

Two traps this cost: **`element.className` is read-only on an SVG** (it is
an `SVGAnimatedString`), so the icon-swap classes silently did nothing and
both icons stayed lit - use `setAttribute("class", ...)`. And when auditing
contrast, composite the alpha: a `rgba(...,0.22)` pill measured as if it
were opaque reports a 1.27:1 failure that does not exist.

**The rail is its own column, sized to the window.** `position: sticky;
top: 0; height: 100vh` - not to the page beside it. Nothing sat at the
rail's bottom edge until the theme toggle did, so the rail quietly growing
to match a long page never showed; now it would drift the toggle by however
far that page overflows and scroll it off on a long one.

**One rail, no header.** The app used to carry two pieces of navigation
furniture. Measured, the pair took 27% of a 1280x800 window and 30% of a
1120x720 one - and the smaller the window, the worse, because both bands
were a fixed size. The header held three things: a wordmark (in a
personal tool you launched yourself, in its own window, the least
informative row of pixels on screen), a 527px search box sized like a web
app's global search, and a theme toggle with no listener behind it. The
first two moved into the rail and the third was deleted rather than left
as a control that does nothing - it returned to the rail's foot, wired up,
when dark mode landed. Chrome is now 19% at 1280x800, 22% at
1120x720.

The band it returns is on the axis that is actually scarce: every page
that overflowed in the fit work overflowed vertically, never
horizontally. The fit helpers picked the 77px up on their own - Studio
Logs went from 11 rows to 13 at 1280x800, Notes from 12 to 15 - and it
took Overview from 106% of that window to 96%, which is the
overflow the fit work could not reach.

Two things to know if you touch the shell again: `.body-row` is what makes
the rail and the content field sit side by side, so deleting header CSS
around it silently stacks them vertically; and the search results panel is
deliberately wider (330px) than the 247px rail that holds it, breaking out
over the content field, because a rail-width dropdown cannot show a result
title.

**Long lists are capped to what fits the window, not to a number.** Every
tool whose data grows without bound shows a window onto it with a "Show N
more" button, and how big that window is comes from `applyRowFit` /
`rowsOfCardsThatFit` in nav.js: enough rows are rendered to overflow any
plausible window, the real row height is measured from the laid-out DOM,
and whatever does not reach the bottom edge is hidden. A constant is right
at exactly one window size and wrong everywhere else - too many rows on a
short window, half a page of nothing on a tall one. Measured across
1100x700 to 1920x1080 on a full database, the capped pages land 87-99% of
the viewport at every size, and Studio Logs goes from 9 rows to 18.

Four rules when adding one:

- Apply the cap **after** filtering, so narrowing by a column narrows what
  the cap counts.
- If a newly created row would land outside the cap, expand first - never
  create something the user cannot see (see the add handlers in
  gatherer.js and finance.js).
- Re-run on resize, debounced, with a timer **per registration** -
  `onRowFitResize` used to share one timer, which let each tool cancel the
  others so only the last registered ever re-fit.
- Re-render when the page becomes visible. A first render while the
  section is still `display: none` measures every height as zero, so the
  cap concludes that everything fits and hides nothing. `showPage` in
  nav.js calls back into tracker, gatherer, finance, notes and todo for
  exactly this reason; a new tool that measures its own layout needs the
  same hook.
- Measure from the **document**, not the viewport (`documentTopOf`).
  `getBoundingClientRect().top` goes negative once the page is scrolled,
  so "room left below" computes as far more than exists - expanding a
  list and scrolling down to the collapse button made the next fit decide
  everything fits, and collapse silently did nothing.

Three shapes, three helpers, because the geometry genuinely differs:
`applyRowFit` for a stack of equal rows (tables), `rowsOfCardsThatFit` for
a wrapping card grid where the unit is a row of cards, and
`applyColumnFit` for Notes' CSS multi-column grid, which has no rows at
all - hiding one card reflows every card after it, so it estimates from
the height ratio then corrects a step at a time. A kanban board is the
exception that scrolls instead: `fitBoardHeight` caps `.todo-board`'s
height so it ends at the fold and scrolls internally, because capping it
would mean a "Show more" button per column.

**A dynamically created `input[type="date"]` must opt in.**
`enhanceDateField()` is swept over the document once on `DOMContentLoaded`,
which covers the static fields in index.html but never table rows built
later. Every render that emits a date input has to call
`enhanceDateField()` on it itself - see `wireGathererRowEvents` and
`renderTaskTable`. Miss it and the row silently keeps the OS-formatted
native control while every other date in the app shows the custom one.

**An empty panel offers the action.** `.empty-action` is the shared empty
state: a ghost button in To Do's `.kanban-col-new` language (faint text on
a barely-there tint, brightening on hover). An empty panel is the moment a
user is most likely to want the missing thing, so it hands them the way to
make it rather than only reporting the absence. Overview's four
panels and the project modal's Log all use it. Don't ship a bare grey
sentence as an empty state.

**Dates never render in the OS's format.** `enhanceDateField()` in nav.js
replaces every `input[type="date"]` with a trigger button plus a calendar
popover, and prints one fixed format (`18 Aug 2026`) everywhere. A native
date input picks its format from the operating system, so the same field
reads `mm/dd/yyyy` on one machine and `dd/mm/yyyy` on another - the only
control in the app whose appearance wasn't ours. The native input stays in
the DOM, hidden, as the source of truth: existing code keeps assigning
`.value` and listening for `change` exactly as before.

**Every popover type must declare its own open state.** `.popover-panel`
is `display: none` and the shared `.open` class sets no display of its
own - only `.color-preset-popover.open` did, so a new popover with
`class="popover-panel foo open"` renders, answers `querySelectorAll`, and
even accepts scripted `.click()` while being completely invisible. That
combination makes it easy to write a passing test for a popover nobody can
see; assert a non-zero `getBoundingClientRect()` and drive it with a real
mouse click, not `element.click()`.

**Escape inside a modal needs the capture phase.** A popover opened from
inside a modal shares `document` with the modal's own Escape handler, and
`stopPropagation()` does not stop a sibling listener on the same element.
Bind with `{ capture: true }` and use `stopImmediatePropagation()`, or one
Escape closes both layers at once (see `onDateFieldKeydown`).

**Modals animate; nothing else does.** `.modal-backdrop > .modal` gets a
200ms `cubic-bezier(0.23, 1, 0.32, 1)` entry from `scale(0.97)` and 6px
up. Page switching happens dozens of times a day and stays instant - a
transition on something that frequent is a tax paid all day. A modal is
occasional, and a hard cut reads as the page being replaced rather than
covered. Entry only: closing is the user's own action with their eye
already on the button. Never `scale(0)`; reduced motion keeps the fade and
drops the movement.

**A page takes a panel wrapper unless its contents already carry the panel
tone.** Projects, Studio Logs, Calculator and Notes wrap their
contents in `.panel` (`--panel-alt`, contents light inside). To Do does
not, and shouldn't: its `.kanban-col` already *is* that layer, so a
wrapper would make three levels (wrapper / column / card) out of a
two-tone system - the columns would vanish into the wrapper, or the cards
into the columns. Two tones, two levels; a third level needs a third
token, which isn't worth adding.

**The page gap is leftover space, not a percentage.** `.ct-card` sets its
side padding with `clamp(20px, calc((100vw - 1400px) / 2), 180px)`. The
gap exists to stop content sprawling on a full-screen display, so it may
only spend room the window can spare: nothing below ~1400px, growing from
there, capped at 180px. It was a flat `10%` before, which took the same
cut at every size - a windowed app lost the room its tables needed and
started scrolling sideways, content that fit fine before the gap existed
no longer did. This app is meant to be run windowed, so the narrow end is
the case that has to be right. A page that wants the full field can cancel
the gap with `margin-inline: calc(var(--ct-pad-x) * -1)` rather than by
overriding the padding.

**A kanban board is allowed to scroll sideways.** `.kanban-col` is
`flex: 0 0 230px` on purpose - past a certain number of lists no window
fits them all, and shrinking the columns to avoid a scrollbar squishes
the cards instead. That one horizontal scroll is the board's own sizing,
not the page gap.

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
  avoid when adding something new. The one exception is the shell
  itself - the search bar and sidebar's active-row card still use the
  flat `--radius-shell` (9px) per the Figma spec instead of the lg/md/sm
  scale, but the content field (`.ct-card`) is deliberately square with
  no radius at all, per the later wireframe that dropped its rounded
  top-left corner.
- **Light theme, one typeface.** `--bg`/`--panel`/`--panel-alt`/`--text`/
  etc. in `:root` now hold the light palette (dark mode is parked, not
  deleted - it'll come back as a toggle). Every page uses the same
  Google Sans Flex family (`frontend/static/fonts/`, Light 300, Regular
  400, Medium 500, Bold 700) - the sidebar/header are Light per the
  Figma spec, the rest of the app kept whatever weights it already had.
  Don't reintroduce a second typeface for a single element (the "VAIO"
  brand wordmark briefly used a serif before this shipped) - one face,
  used consistently, is the whole point. Only request weights that have
  a real `@font-face` file backing them (300/400/500/700) - asking for
  an unbacked weight like 600 makes the browser synthesize a faux-bold
  face, which renders heavier than intended and can glitch into
  mixed-weight/mixed-color glyphs on some letters. Page titles
  (`.page-title`) are 22px/400, matching `.cc-greeting` exactly.
- **Panel is the dark tone, contents are the light tone.** The container
  that wraps a page's board/table/grid (`.panel` in Projects,
  Studio Logs, and Calculator; `.kanban-col` in To Do) uses `--panel-alt`
  (`#e6e5e1`) with no border, and everything inside it that reads as a
  discrete card, field, or button - cards, `.cell-input`, dropdowns/
  pills on hover or focus, non-text buttons - uses `--panel` (`#fafafa`)
  instead, standing out against the darker wrapper rather than blending
  into a light one behind an outline. Projects's Personal
  Projects section is a direct-child `.panel` of the same page, so it
  picks this up automatically rather than needing its own rule. This is
  the default for any new page or panel going forward - match it rather
  than falling back to the older light-panel-with-border look.
- **Qualify selectors that override a generic input rule.** The catch-all
  `input[type="text"], input[type="password"], ...` rule in app.css has
  higher specificity than a bare class selector, so a class-only
  override (e.g. `.overview-search-input`) can silently lose to it. Use
  an element+class selector (`input.overview-search-input`) to tie
  specificity and win on source order instead.
- **One color-picker trigger app-wide.** Every color control in the app
  (Calculator's row color, To Do's list color, Notes' card color)
  renders the same `.color-dot-btn` / `.color-dot` pair from app.css:
  a `<button class="color-dot-btn">` wrapping a
  `<span class="color-dot">`, with `--dot-color` set on the button or
  any ancestor. The pattern started as Calculator's row dot and was
  promoted to the standard from there, replacing the older fixed-16px
  `.swatch-btn`. Two things make it work and both need to stay in sync
  if the sizes change: the button is much bigger than the dot (22px vs
  8px) and is pulled back by a negative margin of exactly half that
  difference (7px), so its *layout* footprint is still the dot's 8px and
  it never shifts what sits beside it - the extra size is pure hit area
  reaching into surrounding whitespace; and entering that area grows the
  dot to 14px to meet the cursor, so you never have to land a click on
  an 8px target. Resize that one rule rather than overriding per-tool,
  and don't reintroduce a per-tool swatch. `--dot-color` falls back to a
  neutral when unset, so an uncolored item needs no separate "empty"
  variant (To Do used to swap in a half-fill glyph for that; it doesn't
  any more). The one per-tool decision left is *what* color to feed it:
  Calculator and To Do pass the item's own color, while Notes passes a
  fixed neutral instead, since there the color already fills the whole
  card behind the dot and a matching dot would vanish into it.
- **One icon size app-wide.** The sidebar nav (`.sb-item svg`) is the
  standard every icon button in the app now matches: Lucide markup at
  `viewBox="0 0 24 24"` with `stroke-width="2"`, rendered at 16x16px -
  not smaller. Calculator's per-row toggle (circle-power) and delete
  (trash-2) icons were originally sized down to fit their buttons and
  read as illegibly small; both the icons and the buttons around them
  were resized up to match the sidebar instead of shrinking the icon to
  fit a smaller button. Setting `width`/`height: 16px` on an svg isn't
  enough by itself inside a *fixed-size* flex `<button>` - Chromium
  silently shrinks it further (16px measured as 12px in practice) even
  though there's room, a quirk the sidebar's own full-width button
  never triggers. `flex-shrink: 0` on the svg is what actually holds it
  at the specified size; any new icon-in-a-small-button control needs
  the same rule or it'll quietly render undersized again.
- **A mirror-span sizer must be `display: block`.** The auto-width
  fields (Calculator's table title and row Title) size themselves by
  mirroring their text into a hidden sibling `<span>` and pinning the
  real `<input>` over it with `inset: 0`. A `<span>` is inline, and
  vertical padding on an inline box *paints but adds no layout height*
  - horizontal padding does, so a sizer left inline gets the width
  right and the height silently wrong. The measure box then collapses
  to one line-height, the absolutely-positioned input is locked to
  that height while still carrying its own vertical padding, and its
  text is pushed down and clipped at the bottom. The tell is that
  raising the padding makes the clipping *worse* rather than better,
  because the box being padded inside of never grows. Measure
  `getBoundingClientRect().height` on the measure element when a field
  looks vertically cramped - if it equals the line-height, this is why.
- **Qualify an input's own `:focus`/`:read-only`, not just its base
  rule.** `input[type="text"]:focus` in app.css's catch-all sets its
  own `border-color`, at a specificity a plain `.my-input:focus` class
  selector loses to (see "Qualify selectors that override a generic
  input rule" above for the same fight at rest). A scoped input needs
  `input.my-input:focus` to win by source order, *and* to re-declare
  `border-color` itself if it wants a different one - inheriting only
  `outline: none` from your own rule still leaves the generic
  `border-color` painting a border you never asked for. Calculator's
  table-title and row-title fields both hit this exact gap.
- **One color picker, everywhere.** `openColorPresetPopover()` in
  `frontend/static/js/nav.js` is the app's only color picker - two
  single-hue tonal ramps (green, blue - `COLOR_PRESET_RAMPS` in the same
  file), five swatches each, plus a "No color" link. A free-form hue/
  saturation wheel with a lightness slider and hex field came before
  this and got replaced: precise, but slower than a one-click pick for
  something meant to be quick. Every color-picking swatch in the app (To
  Do's list color, Notes' card color, Calculator's row color, and
  whatever gets added next) opens this one popover and hands it a save
  callback and a clear callback, rather than keeping its own popover or
  preset list. `colorNeedsDarkText()` (also in nav.js, a standard luma
  check) decides whether a chosen color is light enough to need dark
  text instead of light text on top of it - it only matters for a
  picker that tints an entire surface with text on it (currently just
  Notes' card background); a picker that only fills a small standalone
  swatch icon (To Do, Calculator) never needs this since there's no
  text sitting on the color itself. Notes applies `note-card-light` or
  `note-card-dark` depending on which way that check goes - two classes,
  not one, since the app's own default text color is dark now (light
  theme) and needs to flip the opposite way for a note whose own chosen
  color happens to be dark.
