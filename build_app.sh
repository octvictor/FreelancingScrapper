#!/usr/bin/env bash
# Builds a standalone, double-clickable app (dist/VAIO).
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

# --collect-all webview: pywebview loads its platform backend by name at
# runtime, so PyInstaller cannot see it by following imports. Miss this and
# the built app silently opens a browser instead of its own window.
pyinstaller --onefile --windowed --name VAIO \
    --add-data "frontend:frontend" \
    --collect-all uvicorn \
    --collect-all webview \
    launcher.py

echo ""
echo "Build finished: dist/VAIO"
echo "Move/copy that file anywhere (Desktop, Applications, ...) and double-click it to run the app."
