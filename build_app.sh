#!/usr/bin/env bash
# Builds a standalone, double-clickable app (dist/3DArtistScraper).
#
# Run this ONCE (and again only if you change requirements.txt or add new
# scraper modules) - after that, day-to-day use is just double-clicking
# the file it produces. No terminal, no venv, no `streamlit run` needed
# for regular use.
#
# Must be run on the same OS you intend to use the app on - a Linux-built
# binary won't run on macOS/Windows and vice versa.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt
pip install -q pyinstaller

rm -rf build dist

pyinstaller --onefile --name 3DArtistScraper \
    --add-data "app.py:." \
    --collect-all streamlit \
    launcher.py

echo ""
echo "Build finished: dist/3DArtistScraper"
echo "Move/copy that file anywhere (Desktop, Applications, ...) and double-click it to run the app."
echo "First launch will take a little longer while it downloads the browser component - that's normal, one-time."
