# Scrapper

A personal-use tool for finding 3D artist job leads:

- **LinkedIn Sales Navigator** - scrapes a Sales Navigator lead search you
  build yourself (e.g. current title contains "3D Artist" OR "CG Artist")
  into a list of people + the companies they work at.
- **Instagram** - checks a curated list of studio handles for hiring
  language in their bio (plus optional, higher-risk hashtag discovery).

Each scrape's results are shown right in the app and can be exported to
CSV. Everything also lands in a shared local SQLite database
(`data/scraper.db`) so results accumulate across runs instead of being
lost between sessions.

## Safe mode

The sidebar has a **Safe mode** toggle, ON by default. With it on, every
tab generates realistic fake data instead of touching a real site -
no login, no network call, no risk to any real account. It's there so
you can click through the entire app, see exactly how each tab behaves,
and iterate on the design/workflow freely before ever pointing it at a
real LinkedIn/Instagram account. Turn it off only when you actually want
to run a real scrape.

## Read this first: risk (applies once Safe mode is off)

The LinkedIn and Instagram modules work by logging into **your own**
account with Playwright and driving a real browser session - this is
different (and riskier) than scraping a public page:

- Both platforms' Terms of Service prohibit automated data collection.
  Using automation on an authenticated session is more likely to get
  detected than scraping logged-out public pages, and the practical
  consequence is account restriction or a ban - which matters more for a
  paid Sales Navigator seat.
- This tool is built for **your own personal use, on your own account, at
  low volume** (tens of results per run, not hundreds), not as something
  to package up and hand to other people or run against accounts you
  don't own.
- Keep the delay settings in the Settings tab conservative. They exist
  specifically to look less like a bot - don't shorten them just to
  finish a run faster.
- Login checkpoints (2FA, "verify it's you", CAPTCHA) can't be solved by
  the script. Keep "Run browser headless" OFF (the default) so the
  browser window is visible and you can solve them by hand; the script
  waits and continues automatically once you do.

## Two ways to run this

- **Packaged app** - build once, then just double-click an icon forever.
  Best if you're not planning to edit the code.
- **From source** - venv + a run script. Best if you're actively changing
  scrapers/selectors, since edits take effect instantly (no rebuild).

You can do both; they share the same `.env` credentials once you fill
them in via the in-app Settings tab.

### Option A: packaged app (double-click, no terminal after setup)

One-time build, on the same OS you'll actually use the app on (a build
made on Mac won't run on Windows and vice versa):

```bash
./build_app.sh      # Windows: build_app.bat / Mac: double-click build_app.command
```

This creates `dist/Scrapper` (`dist/Scrapper.exe` on Windows) - a single
self-contained file with Python, Streamlit, and Playwright all bundled
in. Move it wherever you like and double-click it to launch; it opens in
your browser automatically. Safe mode works immediately with no further
setup. If you turn Safe mode off, first launch takes a bit longer while
it downloads the browser component it needs (needs a normal internet
connection, one-time).

Enter your LinkedIn/Instagram credentials from inside the app itself, in
the **Settings** tab - no `.env` file editing required. They're written
to a `.env` file that lives next to the executable and never leaves your
machine.

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

Credentials go in the in-app **Settings** tab (writes to a local `.env`
for you) - no manual file editing needed.

**Windows note:** if you're using PowerShell and see errors about
`source` not being recognized, or about running scripts being disabled -
ignore them and just double-click `run.bat` in File Explorer instead of
typing commands. `run.bat` handles all of this correctly on its own.

**Testing a code change:** you don't need to restart anything. The app
auto-reloads whenever you save a file (`runOnSave = true` in
`.streamlit/config.toml`) - edit a scraper or `app.py`, save, and the
browser tab updates within a second or two.

## Notes on selector fragility (real scraping only, Safe mode is unaffected)

`scrapers/linkedin_salesnav.py` and `scrapers/instagram.py` were written
without live network access to verify current page markup. Each scraper
tries several candidate CSS selectors per field as a hedge, but both
sites change their DOM regularly, so a real (mock=False) run may come
back with 0 results until you adjust the selectors.

When that happens:

1. Check `data/debug/` (next to `app.py` when running from source, or
   next to the executable for the packaged app) - each scraper dumps the
   page HTML there automatically when it can't find any results.
2. Open that HTML file, find the real structure for the field that's
   missing, and update the relevant `*_SELECTORS` list at the top of the
   scraper file.

## Data model

SQLite (`data/scraper.db`, next to `app.py` or next to the packaged
executable):

- `companies` - name, source, url, industry, location, notes, first/last
  seen. Upserted by name, so the same studio discovered via multiple
  scrapes accumulates notes rather than duplicating.
- `people` - name, title, company_name, location, profile_url, source.
  Populated by the LinkedIn scraper.
- `job_postings` - title, company_name, url, location, description,
  source, posted_date. Populated when a source has an actual posting/
  hiring signal (e.g. an Instagram bio flagged as hiring).
- `scrape_runs` - a log of every scrape attempt (source, query, result
  count, status, error) for debugging.

The sidebar's "Demo data" panel has a one-click "Reset all data" button
to clear every table between test runs.

## Roadmap / not built yet

- Company job-board scraping (many studios post openings on their own
  career pages, not just LinkedIn/Instagram) - straightforward to add
  per-studio once you have a company list from the above.
- Scheduling (currently everything is triggered manually from the GUI).
- Notifications (e.g. Slack/email) on new matches.
- Broader freelancing-platform features beyond 3D-artist job discovery
  (this is the planned direction long-term).
