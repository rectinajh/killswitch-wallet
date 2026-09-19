#!/bin/bash
# Concatenate split console server sources into server.assembled.mjs.
# apps/console/server.mjs is a thin loader (also used by api/index.mjs on Vercel)
# that imports the assembled file.
set -e
DIR="$(cd "$(dirname "$0")" && pwd)"
OUT="$DIR/server.assembled.mjs"
cat "$DIR/server.part1.mjs.txt" "$DIR/server.part2.mjs.txt" > "$OUT"

# Booth UI: wire decorateBoothHtml (LLM→Deny labels + Forced skip) if not already in part1
if ! grep -q "decorateBoothHtml" "$OUT" && [[ -f "$DIR/booth-html-decorate.mjs" ]]; then
  python3 - "$OUT" <<'PY'
import sys
from pathlib import Path
p = Path(sys.argv[1])
t = p.read_text()
needle = "import { buildAgentContextPreview } from '../../agent/dist/agent-context.js';\n"
if needle in t and "booth-html-decorate" not in t:
    t = t.replace(
        needle,
        needle + "import { decorateBoothHtml } from './booth-html-decorate.mjs';\n",
        1,
    )
old = """    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }"""
new = """    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const raw = fs.readFileSync(path.join(__dirname, 'index.html'), 'utf8');
      const html = decorateBoothHtml(raw);
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }"""
if old in t:
    t = t.replace(old, new, 1)
    print("booth decorate wired into assembled server")
else:
    print("booth decorate: GET / handler pattern not found (skip)", file=sys.stderr)
p.write_text(t)
PY
fi

echo "assembled $(basename "$OUT") ($(wc -c < "$OUT") bytes)"
