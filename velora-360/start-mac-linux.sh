#!/usr/bin/env bash
# Double-click (or run ./start-mac-linux.sh) to start Velora 360.
cd "$(dirname "$0")" || exit 1
command -v node >/dev/null || { echo "Node.js is not installed. Get it from https://nodejs.org"; exit 1; }
[ -d backend/node_modules ] || npm --prefix backend install || exit 1
( sleep 3; (open http://localhost:5190 || xdg-open http://localhost:5190) >/dev/null 2>&1 ) &
echo "Starting Velora 360. Press Ctrl+C to stop."
node dev.js
