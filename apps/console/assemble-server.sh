#!/bin/bash
# Concatenate split console server sources into server.assembled.mjs.
# apps/console/server.mjs is a thin loader (also used by api/index.mjs on Vercel)
# that imports the assembled file.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/server.assembled.mjs"
cat "$DIR/server.part1.mjs.txt" "$DIR/server.part2.mjs.txt" > "$OUT"
echo "assembled $(basename "$OUT") ($(wc -c < "$OUT") bytes)"
