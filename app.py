"""Streamlit GUI for the 3D artist job/studio scraper.

Run with: streamlit run app.py
"""
import os

import pandas as pd
import streamlit as st

from storage import db

st.set_page_config(page_title="3D Artist Job Scraper", layout="wide")
db.init_db()

st.sidebar.title("3D Artist Job Scraper")
st.sidebar.warning(
    "Personal-use tool. The LinkedIn and Instagram modules automate a "
    "logged-in browser session under your own account - that's a ToS "
    "violation on both platforms and carries real risk of account "
    "restriction. Keep run sizes small and prefer your own account only."
)
st.sidebar.caption(f"LinkedIn credentials: {'configured' if os.environ.get('LINKEDIN_EMAIL') else 'not set'}")
st.sidebar.caption(f"Instagram credentials: {'configured' if os.environ.get('INSTAGRAM_USERNAME') else 'not set'}")

tab_linkedin, tab_behance, tab_instagram, tab_data = st.tabs(
    ["LinkedIn Sales Navigator", "Behance", "Instagram", "Data Browser"]
)

with tab_linkedin:
    st.subheader("LinkedIn Sales Navigator")
    st.caption(
        'Build/save a lead search inside Sales Navigator (e.g. current title '
        'contains "3D Artist" OR "CG Artist"), then paste the resulting URL below.'
    )
    search_url = st.text_input("Sales Navigator search URL", key="li_url")
    max_results = st.number_input("Number of people to scrape", min_value=1, max_value=200, value=10, key="li_max")
    if st.button("Start Scraping", key="li_start"):
        if not search_url:
            st.error("Paste a Sales Navigator search URL first.")
        else:
            from scrapers import linkedin_salesnav

            with st.spinner("Scraping LinkedIn Sales Navigator - a browser window may open for login/checkpoints..."):
                try:
                    results = linkedin_salesnav.scrape_search(search_url, max_results=int(max_results))
                    st.success(f"Scraped {len(results)} leads.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                    if not df.empty:
                        st.download_button("Export CSV", df.to_csv(index=False), file_name="linkedin_leads.csv")
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Scrape failed: {exc}")

with tab_behance:
    st.subheader("Behance")
    st.caption("Discover CG/3D studios via Behance user/team or project search.")
    query = st.text_input("Search query", value="3D studio", key="be_query")
    pages = st.number_input("Pages to fetch", min_value=1, max_value=10, value=1, key="be_pages")
    search_mode = st.radio("Search", ["Users/teams", "Projects"], horizontal=True, key="be_mode")
    if st.button("Start Scraping", key="be_start"):
        from scrapers import behance

        with st.spinner("Searching Behance..."):
            try:
                if search_mode == "Users/teams":
                    results = behance.search_users(query, pages=int(pages))
                else:
                    results = behance.search_projects_for_studios(query, pages=int(pages))
                st.success(f"Found {len(results)} leads.")
                df = pd.DataFrame(results)
                st.dataframe(df, use_container_width=True)
                if not df.empty:
                    st.download_button("Export CSV", df.to_csv(index=False), file_name="behance_studios.csv")
            except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                st.error(f"Scrape failed: {exc}")

with tab_instagram:
    st.subheader("Instagram")
    st.caption(
        "Checks a curated list of studio handles for hiring language in their "
        "bio - this is the recommended, lower-risk workflow. Hashtag discovery "
        "below is higher-risk; see the module docstring before using it."
    )
    usernames_raw = st.text_area("Instagram handles (one per line, no @)", key="ig_usernames")
    if st.button("Scan Profiles", key="ig_scan"):
        usernames = [u.strip().lstrip("@") for u in usernames_raw.splitlines() if u.strip()]
        if not usernames:
            st.error("Enter at least one Instagram handle.")
        else:
            from scrapers import instagram

            with st.spinner("Checking profiles - a browser window may open for login/checkpoints..."):
                try:
                    results = instagram.scan_profiles(usernames)
                    st.success(f"Checked {len(results)} profiles.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                    if not df.empty:
                        st.download_button("Export CSV", df.to_csv(index=False), file_name="instagram_profiles.csv")
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Scan failed: {exc}")

    st.divider()
    st.caption("Optional: hashtag discovery (higher risk - keep batches small)")
    hashtag = st.text_input("Hashtag (no #)", key="ig_hashtag")
    max_posts = st.number_input("Max posts", min_value=1, max_value=50, value=15, key="ig_max_posts")
    if st.button("Search Hashtag", key="ig_hashtag_btn"):
        if not hashtag:
            st.error("Enter a hashtag first.")
        else:
            from scrapers import instagram

            with st.spinner("Searching hashtag..."):
                try:
                    results = instagram.search_hashtag(hashtag, max_posts=int(max_posts))
                    st.success(f"Found {len(results)} posts.")
                    df = pd.DataFrame(results)
                    st.dataframe(df, use_container_width=True)
                except Exception as exc:  # noqa: BLE001 - surface scraper failures in the UI instead of crashing the app
                    st.error(f"Hashtag search failed: {exc}")

with tab_data:
    st.subheader("Data Browser")
    table = st.selectbox("Table", ["companies", "people", "job_postings", "scrape_runs"])
    df = db.fetch_table(table)
    filter_text = st.text_input("Filter (matches any column, case-insensitive)")
    if filter_text and not df.empty:
        mask = df.astype(str).apply(lambda col: col.str.contains(filter_text, case=False, na=False)).any(axis=1)
        df = df[mask]
    st.dataframe(df, use_container_width=True)
    if not df.empty:
        st.download_button("Export CSV", df.to_csv(index=False), file_name=f"{table}.csv")
