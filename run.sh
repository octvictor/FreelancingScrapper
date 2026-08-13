#!/usr/bin/env bash
# Run this to start the app. Creates a virtual environment the first
# time (takes a minute or two); every run - including this one -
# re-checks dependencies against requirements.txt, since a plain
# `pip install` is a fast no-op when everything's already satisfied.
# That's deliberate: skipping it whenever .venv already existed used to
# mean a requirements.txt change (like a new dependency) silently never
# got installed into an existing venv.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "First run: setting up - this only happens once..."
    python3 -m venv .venv
fi
source .venv/bin/activate
pip install -q -r requirements.txt

python -c "import time, webbrowser; time.sleep(1.2); webbrowser.open('http://127.0.0.1:8501')" &
uvicorn server:app --reload --port 8501
