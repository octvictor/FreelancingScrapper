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

# launcher.py, not `uvicorn` directly: it starts the same server and then
# opens the app in its own window instead of a browser tab. Set
# VAIO_BROWSER=1 to get a browser (and its devtools) instead, which is what
# you want while editing the frontend:
#     VAIO_BROWSER=1 ./run.sh
python launcher.py
