"""Freelancing Tools - entry point and navigation shell.

Run with: streamlit run app.py (or ./run.sh / run.bat)

Each tool lives in its own page under pages/ and is added to the
navigation list below - that's the whole extension point for adding a
new tool later.
"""
from pathlib import Path

import streamlit as st

st.set_page_config(page_title="Freelancing Tools", layout="wide")

# st.logo (not st.sidebar.title) is what actually renders above
# st.navigation's page list - the nav widget always pins itself to the
# very top of the sidebar regardless of call order, so a plain title
# call would end up stuck below it instead of acting as a header.
st.logo(str(Path(__file__).resolve().parent / "assets" / "logo.svg"))

pg = st.navigation(
    [
        st.Page("pages/scrapper.py", title="Scrapper"),
        st.Page("pages/gatherer.py", title="Gatherer"),
    ]
)
pg.run()
