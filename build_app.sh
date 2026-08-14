#!/usr/bin/env bash
# Builds a standalone, double-clickable app (dist/FreelancingTools).
#
# Run this ONCE (and again only if you change requirements.txt or the
# app's code) - after that, day-to-day use is just double-clicking the
# file it produces. No terminal, no venv, no `uvicorn` needed for
# regular use.
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

pyinstaller --onefile --name FreelancingTools \
    --add-data "frontend:frontend" \
    --collect-all uvicorn \
    launcher.py

echo ""
echo "Build finished: dist/FreelancingTools"
echo "Move/copy that file anywhere (Desktop, Applications, ...) and double-click it to run the app."
