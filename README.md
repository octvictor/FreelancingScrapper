# 3D Artist Job/Studio Scraper

A personal-use tool for finding CG/3D studios and job leads across three
sources:

- **LinkedIn Sales Navigator** - scrapes a Sales Navigator lead search you
  build yourself (e.g. current title contains "3D Artist" OR "CG Artist")
  into a list of people + the companies they work at.
- **Behance** - searches public user/team and project pages to discover
  studios working in CG/3D.
- **Instagram** - checks a curated list of studio handles for hiring
  language in their bio (plus optional, higher-risk hashtag discovery).

All results land in one shared SQLite database (`data/scraper.db`) so you
can browse/filter/export everything from the "Data Browser" tab
regardless of which source it came from.

## Read this first: risk

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
- Keep `SCRAPE_DELAY_MIN`/`SCRAPE_DELAY_MAX` in `.env` conservative. The
  delays exist specifically to look less like a bot - don't shorten them
  just to finish a run faster.
- Login checkpoints (2FA, "verify it's you", CAPTCHA) can't be solved by
  the script. Keep `BROWSER_HEADLESS=False` (the default) so the browser
  window is visible and you can solve them by hand; the script waits and
  continues automatically once you do.

## Setup

```bash
python3 -m venv .venv
source .venv/bin/activate        # Windows: .venv\Scripts\activate
pip install -r requirements.txt
playwright install chromium

cp .env.example .env
# then edit .env and fill in your LinkedIn/Instagram credentials
```

Run the app:

```bash
streamlit run app.py
```

It opens in your browser at `http://localhost:8501`.

## Notes on selector fragility

`scrapers/linkedin_salesnav.py`, `scrapers/instagram.py`, and
`scrapers/behance.py` were written without live network access to verify
current page markup (this was built in a sandboxed dev environment with
no route to linkedin.com / instagram.com / behance.net). Each scraper
tries several candidate CSS selectors per field as a hedge, but all three
sites change their DOM regularly, so a run may come back with 0 results
until you adjust the selectors.

When that happens:

1. Check `data/debug/` - each scraper dumps the page HTML there
   automatically when it can't find any results.
2. Open that HTML file, find the real structure for the field that's
   missing, and update the relevant `*_SELECTORS` list at the top of the
   scraper file.
3. If a page is shipping essentially empty HTML (fully client-rendered),
   the DOM approach won't work at all for it - see the note in
   `behance.py` about porting it to Playwright the same way the
   LinkedIn/Instagram modules work.

## Data model

SQLite (`data/scraper.db`), shared across all sources:

- `companies` - name, source, url, industry, location, notes, first/last
  seen. Upserted by name, so the same studio discovered via multiple
  sources accumulates notes rather than duplicating.
- `people` - name, title, company_name, location, profile_url, source.
  Mainly populated by the LinkedIn scraper.
- `job_postings` - title, company_name, url, location, description,
  source, posted_date. Populated when a source has an actual posting/
  hiring signal (e.g. an Instagram bio flagged as hiring).
- `scrape_runs` - a log of every scrape attempt (source, query, result
  count, status, error) for debugging.

## Roadmap / not built yet

- Company job-board scraping (many studios post openings on their own
  career pages, not just LinkedIn/Behance/Instagram) - straightforward to
  add per-studio once you have a company list from the above.
- Scheduling (currently everything is triggered manually from the GUI).
- Notifications (e.g. Slack/email) on new matches.
