#!/bin/bash
# One-click local demo bring-up: anvil → setup → agent build → optional console
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

START_CONSOLE="${START_CONSOLE:-1}"
ANVIL_PORT="${ANVIL_PORT:-8545}"
ANVIL_HOST="${ANVIL_HOST:-127.0.0.1}"
RPC_URL_DEFAULT="http://${ANVIL_HOST}:${ANVIL_PORT}"

echo "=================================================="
echo "KillSwitch Wallet — demo-up"
echo "=================================================="

if [ ! -f .env ]; then
  echo "Creating .env from .env.example (no secrets committed)..."
  cp .env.example .env
fi

# shellcheck disable=SC1091
set -a; source .env; set +a
RPC_URL="${RPC_URL:-$RPC_URL_DEFAULT}"

anvil_up() {
  curl -sf -X POST "$RPC_URL" \
    -H "Content-Type: application/json" \
    -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' \
    | grep -q result
}

if anvil_up; then
  echo "✓ Anvil already running at $RPC_URL"
else
  if ! command -v anvil >/dev/null 2>&1; then
    echo "Error: anvil not found. Install Foundry: https://book.getfoundry.sh/getting-started/installation"
    exit 1
  fi
  mkdir -p .demo-logs
  echo "Starting anvil in background → .demo-logs/anvil.log"
  nohup anvil --host "$ANVIL_HOST" --port "$ANVIL_PORT" --block-time 1 \
    > .demo-logs/anvil.log 2>&1 &
  echo $! > .demo-logs/anvil.pid
  for i in $(seq 1 30); do
    if anvil_up; then
      echo "✓ Anvil ready (pid $(cat .demo-logs/anvil.pid))"
      break
    fi
    sleep 0.5
    if [ "$i" -eq 30 ]; then
      echo "Error: anvil failed to start. See .demo-logs/anvil.log"
      exit 1
    fi
  done
fi

echo ""
./demos/setup.sh

echo ""
echo "Building agent..."
(cd agent && npm install --silent && npm run build)
echo "✓ Agent built"

# Re-load .env so CONTRACT_ADDRESS from setup is visible (dotenv won't override empty shell vars)
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ "$START_CONSOLE" = "1" ]; then
  mkdir -p .demo-logs
  if curl -sf "http://127.0.0.1:${CONSOLE_PORT:-8787}/api/health" >/dev/null 2>&1; then
    echo "✓ Console already running on :${CONSOLE_PORT:-8787}"
  else
    echo "Starting console → .demo-logs/console.log"
    (cd apps/console && npm install --silent)
    nohup node apps/console/server.mjs > .demo-logs/console.log 2>&1 &
    echo $! > .demo-logs/console.pid
    sleep 1
    echo "✓ Console http://127.0.0.1:${CONSOLE_PORT:-8787}"
  fi
fi

echo ""
echo "=================================================="
echo "Ready. Next:"
echo "  ./demos/run-all.sh"
echo "  node demos/agent-boundary.mjs all   # agent-path boundary denies"
echo "  open http://127.0.0.1:${CONSOLE_PORT:-8787}"
echo "=================================================="
