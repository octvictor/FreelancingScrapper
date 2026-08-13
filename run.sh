#!/usr/bin/env bash
# Run this to start the app. First run also sets itself up (creates a
# virtual environment, installs packages) - that only happens once and
# takes a minute or two; every run after that just starts the app.
set -e
cd "$(dirname "$0")"

if [ ! -d ".venv" ]; then
    echo "First run: setting up - this only happens once..."
    python3 -m venv .venv
    source .venv/bin/activate
    pip install -r requirements.txt
else
    source .venv/bin/activate
fi

python -c "import time, webbrowser; time.sleep(1.2); webbrowser.open('http://127.0.0.1:8501')" &
uvicorn server:app --reload --port 8501
