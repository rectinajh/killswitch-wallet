#!/bin/bash
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
cat "$DIR/server.part1.mjs.txt" "$DIR/server.part2.mjs.txt" > "$DIR/server.mjs"
echo "assembled server.mjs ($(wc -c < "$DIR/server.mjs") bytes)"
