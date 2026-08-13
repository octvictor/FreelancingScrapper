#!/usr/bin/env bash
# One command to (re)start the app after the one-time setup in README.md.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "No .venv found - run the one-time setup in README.md first."
    exit 1
fi

source .venv/bin/activate
streamlit run app.py
