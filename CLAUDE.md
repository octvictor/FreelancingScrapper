# Freelancing Tools - working notes for Claude

## Always use the installed design skills

This project has design/animation skills installed under `.agents/skills/`
(see `skills-lock.json`). **Use them on any UI, styling, layout, or motion
work here** - don't design from scratch when a skill covers it.

Relevant to this project:

- `emil-design-eng` - UI polish, component design, the invisible details.
  The default one to reach for on any "make this feel better" work.
- `apple-design` - interface design and fluid/physical motion for the web;
  gestures, springs, depth, typography.
- `animate` - building a web animation from scratch (this project is
  vanilla web, so use this one, **not** `animate-expo`).
- `find-animation-opportunities` - what here should animate but doesn't.
- `improve-animations` / `review-animations` - auditing or critiquing
  existing motion.
- `animation-vocabulary` - naming a motion effect.
- `prototype` - throwaway explorations.

Not applicable here (installed but for other stacks): `animate-expo`
(React Native), `ask-sonner` (React toast lib), `pick-ui-library` (this
app is deliberately vanilla with no build step).

## Stack

FastAPI backend + hand-written HTML/CSS/JS frontend. No Node build step,
no framework - plain static files under `frontend/`. SQLite at
`data/scraper.db`. Run with `run.sh` / `run.bat` (port 8501).

- `frontend/index.html` - every page, shown/hidden by `nav.js`
- `frontend/static/css/app.css` - the whole stylesheet
- `frontend/static/js/` - `nav.js` (shared helpers + navigation) loads
  first, then one file per tool
- `api/`, `storage/db.py` - routes and all DB access

## Read the README's "Design system notes" before styling anything

`README.md` ends with a **Design system notes** section recording the
app's conventions (radius tokens, the one icon size, panel/card tone
relationship, the single color-picker trigger, the single color picker)
plus specific CSS traps already hit in this codebase. Read it before
adding UI, and add to it when a new convention or trap is established.

## Verify visually, and measure rather than eyeball

Layout/spacing/alignment bugs here have repeatedly been misdiagnosed by
looking at a screenshot. Before claiming a visual fix works, run the app
and check the real numbers - `getBoundingClientRect()` on both elements
for alignment, computed styles for color, element height when spacing
looks wrong. A screenshot says something is off; only a measurement says
what. (A 24px-tall box that looked ~50px cost several rounds of wrong
padding fixes.)

When testing against the local DB, back it up first and restore it
after - don't leave test rows in the user's real data.
