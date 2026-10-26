#!/bin/sh
# Dev mode: backend (tsx watch) and frontend (Vite) together, both reloading
# on save. Ctrl+C stops both. Runs independently of the Docker container.
cd "$(dirname "$0")/.."

# Stop whichever is still running when the other exits or on Ctrl+C
trap 'trap - INT TERM EXIT; kill 0' INT TERM EXIT

npm --prefix backend run dev &
npm --prefix frontend run dev &
wait
