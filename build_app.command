#!/bin/bash
# Double-click this file in Finder to build the app on macOS - it just
# runs build_app.sh for you so you never have to open Terminal manually.
cd "$(dirname "$0")"
./build_app.sh
echo ""
read -p "Done. Press Enter to close this window..."
