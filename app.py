"""Streamlit GUI for the 3D artist job scraper.

Run with: streamlit run app.py (or ./run.sh / run.bat)
"""
import os

import pandas as pd
import streamlit as st
from dotenv import load_dotenv, set_key

from app_paths import ENV_PATH
from scrapers.common import default_mock_mode
from storage import db

load_dotenv(ENV_PATH)

st.set_page_config(page_title="Scrapper", layout="wide")
db.init_db()

st.sidebar.title("Scrapper")

# Streamlit doesn't expose a per-state color option for st.toggle, so this
# recolors it directly. Targeted by the widget's aria-label (stable, since
# it's just the label text we pass below) rather than Streamlit's hashed
# CSS class names (those change between versions) - the toggle's on/off
# state shows up as a data-selected attribute on its <label>.
st.markdown(
    """
    <style>
    label:has(input[aria-label="Safe mode (demo data)"]) > div:not([data-testid]) {
        background-color: #e57373 !important; /* pastel/saturated red - OFF */
    }
    label[data-selected="true"]:has(input[aria-label="Safe mode (demo data)"]) > div:not([data-testid]) {
        background-color: #22c55e !important; /* green - ON */
    }
    </style>
    """,
    unsafe_allow_html=True,
)

mock = st.sidebar.toggle(
    "Safe mode (demo data)",
    value=default_mock_mode(),
    help="ON: every tab uses realistic fake data - no login, no network, no risk. "
    "OFF: scrapes real LinkedIn/Instagram using your saved credentials.",
)

if mock:
    st.sidebar.success("Safe mode is ON - nothing here touches a real site or account.")
else:
    st.sidebar.warning(
        "Safe mode is OFF. The LinkedIn and Instagram tabs will now log into "
        "your real account and drive a real browser session - that's a ToS "
        "violation on both platforms and carries real risk of account "
        "restriction. Keep run sizes small and prefer your own account only."
    )

st.sidebar.caption(f"LinkedIn credentials: {'configured' if os.environ.get('LINKEDIN_EMAIL') else 'not set'}")
st.sidebar.caption(f"Instagram credentials: {'configured' if os.environ.get('INSTAGRAM_USERNAME') else 'not set'}")

with st.sidebar.expander("Demo data"):
    st.caption("Clears every table - use this to reset between safe-mode test runs.")
    if st.button("Reset all data"):
        for table in ["companies", "people", "job_postings", "scrape_runs"]:
            db.clear_table(table)
        st.success("Cleared.")
        st.rerun()

tab_linkedin, tab_instagram, tab_settings = st.tabs(["LinkedIn Sales Navigator", "Instagram", "Settings"])

with tab_linkedin:
    st.subheader("LinkedIn Sales Navigator")
    if mock:
        st.caption("Safe mode: generates realistic fake leads. The search URL below is ignored.")
    else:
        st.caption(
            'Build/save a lead search inside Sales Navigator (e.g. current title '
            'contains "3D Artist" OR "CG Artist"), then paste the resulting URL below.'
        )
    search_url = st.text_input("Sales Navigator search URL", key="li_url", disabled=mock)
    max_results = st.number_input("Number of people to scrape", min_value=1, max_value=200, value=10, key="li_max")
    if st.button("Start Scraping", key="li_start"):
        if not mock and not search_url:
            st.error("Paste a Sales Navigator search URL first (or turn on Safe mode).")
        else:
            from scrapers import linkedin_salesnav

            spinner_msg = "Generating safe demo leads..." if mock else (
                "Scraping LinkedIn Sales Navigator - a browser window may open for login/checkpoints. "
                "First real scrape ever also downloads a browser component (~1-2 min, one-time)."
            )
            with st.spinner(spinner_msg):
                try:
                    results = linkedin_salesnav.scrape_search(search_url, max_results=int(max_results), mock=mock)
                    st.success(f"{'Generated' if mock else 'Scraped'} {len(results)} leads.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                    if not df.empty:
                        st.download_button("Export CSV", df.to_csv(index=False), file_name="linkedin_leads.csv")
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Scrape failed: {exc}")

with tab_instagram:
    st.subheader("Instagram")
    st.caption(
        "Checks a curated list of studio handles for hiring language in their "
        "bio - this is the recommended, lower-risk workflow. Hashtag discovery "
        "below is higher-risk; see the module docstring before using it with safe mode off."
    )
    default_usernames = "nomadrender\npolybrushstudio\nvoxelfoundry" if mock else ""
    usernames_raw = st.text_area("Instagram handles (one per line, no @)", value=default_usernames, key="ig_usernames")
    if st.button("Scan Profiles", key="ig_scan"):
        usernames = [u.strip().lstrip("@") for u in usernames_raw.splitlines() if u.strip()]
        if not usernames:
            st.error("Enter at least one Instagram handle.")
        else:
            from scrapers import instagram

            spinner_msg = "Generating safe demo profile data..." if mock else (
                "Checking profiles - a browser window may open for login/checkpoints. "
                "First real scrape ever also downloads a browser component (~1-2 min, one-time)."
            )
            with st.spinner(spinner_msg):
                try:
                    results = instagram.scan_profiles(usernames, mock=mock)
                    st.success(f"Checked {len(results)} profiles.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                    if not df.empty:
                        st.download_button("Export CSV", df.to_csv(index=False), file_name="instagram_profiles.csv")
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Scan failed: {exc}")

    st.divider()
    st.caption("Optional: hashtag discovery (higher risk with safe mode off - keep batches small)")
    hashtag = st.text_input("Hashtag (no #)", value="3dartist" if mock else "", key="ig_hashtag")
    max_posts = st.number_input("Max posts", min_value=1, max_value=50, value=15, key="ig_max_posts")
    if st.button("Search Hashtag", key="ig_hashtag_btn"):
        if not hashtag:
            st.error("Enter a hashtag first.")
        else:
            from scrapers import instagram

            with st.spinner("Generating safe demo posts..." if mock else "Searching hashtag..."):
                try:
                    results = instagram.search_hashtag(hashtag, max_posts=int(max_posts), mock=mock)
                    st.success(f"Found {len(results)} posts.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Hashtag search failed: {exc}")

with tab_settings:
    st.subheader("Settings")
    st.caption(
        f"Saved to {ENV_PATH} on this machine only - never sent anywhere else. "
        "Leave a field blank to keep its current saved value."
    )

    with st.form("settings_form"):
        st.markdown("**LinkedIn**")
        li_email = st.text_input("LinkedIn email", value=os.environ.get("LINKEDIN_EMAIL", ""))
        li_password = st.text_input("LinkedIn password", type="password", placeholder="leave blank to keep current")

        st.markdown("**Instagram**")
        ig_username = st.text_input("Instagram username", value=os.environ.get("INSTAGRAM_USERNAME", ""))
        ig_password = st.text_input("Instagram password", type="password", placeholder="leave blank to keep current")

        st.markdown("**Scraping behavior**")
        headless = st.checkbox(
            "Run browser headless (hidden)",
            value=os.environ.get("BROWSER_HEADLESS", "False").strip().lower() in {"1", "true", "yes"},
            help="Keep this OFF so you can see and solve login checkpoints (2FA, CAPTCHA) by hand.",
        )
        delay_min, delay_max = st.slider(
            "Delay between page actions (seconds)",
            min_value=0.5,
            max_value=15.0,
            value=(
                float(os.environ.get("SCRAPE_DELAY_MIN", 2.0)),
                float(os.environ.get("SCRAPE_DELAY_MAX", 5.0)),
            ),
            help="Longer delays look less like a bot. Don't shorten this just to finish runs faster.",
        )

        saved = st.form_submit_button("Save settings")

    if saved:
        updates = {
            "BROWSER_HEADLESS": str(headless),
            "SCRAPE_DELAY_MIN": str(delay_min),
            "SCRAPE_DELAY_MAX": str(delay_max),
        }
        if li_email:
            updates["LINKEDIN_EMAIL"] = li_email
        if li_password:
            updates["LINKEDIN_PASSWORD"] = li_password
        if ig_username:
            updates["INSTAGRAM_USERNAME"] = ig_username
        if ig_password:
            updates["INSTAGRAM_PASSWORD"] = ig_password

        for key, value in updates.items():
            set_key(str(ENV_PATH), key, value)
        load_dotenv(ENV_PATH, override=True)
        st.success("Saved. Other tabs will pick this up on their next run.")
