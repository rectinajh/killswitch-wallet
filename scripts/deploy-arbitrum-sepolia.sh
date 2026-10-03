#!/usr/bin/env bash
# Deploy SessionPolicy to Arbitrum Sepolia and print verification hints.
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "FAIL: .env missing — copy .env.example"
  exit 1
fi
# shellcheck disable=SC1091
set -a
source .env
set +a

RPC="${ARB_SEPOLIA_RPC_URL:-${RPC_URL:-}}"
if [[ -z "$RPC" || "$RPC" == *"127.0.0.1"* ]]; then
  echo "FAIL: set ARB_SEPOLIA_RPC_URL or RPC_URL to an Arbitrum Sepolia endpoint"
  echo "  e.g. https://sepolia-rollup.arbitrum.io/rpc"
  exit 1
fi

OWNER_KEY="${OWNER_PRIVATE_KEY:-${PRIVATE_KEY_OWNER:-}}"
if [[ -z "$OWNER_KEY" ]]; then
  echo "FAIL: OWNER_PRIVATE_KEY required (funded throwaway on Arbitrum Sepolia)"
  exit 1
fi

CHAIN_ID_HEX=$(curl -sf -X POST "$RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')
CHAIN_ID=$((16#${CHAIN_ID_HEX#0x}))
if [[ "$CHAIN_ID" != "421614" ]]; then
  echo "FAIL: expected chainId 421614 (Arbitrum Sepolia), got $CHAIN_ID"
  exit 1
fi

echo "Deploying SessionPolicy to Arbitrum Sepolia…"
echo "RPC=$RPC"
DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC")

cd contracts
forge build
ARGS=(script/Deploy.s.sol:DeployScript --rpc-url "$RPC" --broadcast)
if [[ -n "${ARBISCAN_API_KEY:-}" ]]; then
  ARGS+=(--verify --etherscan-api-key "$ARBISCAN_API_KEY")
fi
forge script "${ARGS[@]}"

# Best-effort: read latest broadcast artifact
BROADCAST=$(ls -t broadcast/Deploy.s.sol/421614/run-*.json 2>/dev/null | head -1 || true)
ADDR=""
if [[ -n "$BROADCAST" ]]; then
  ADDR=$(jq -r '.transactions[] | select(.contractName=="SessionPolicy") | .contractAddress' "$BROADCAST" | head -1)
fi

cd ..
echo ""
echo "Approx deploy block: $DEPLOY_BLOCK"
if [[ -n "$ADDR" && "$ADDR" != "null" ]]; then
  echo "Contract: $ADDR"
  echo "Explorer: https://sepolia.arbiscan.io/address/$ADDR"
  echo ""
  echo "Write to .env:"
  echo "  RPC_URL=$RPC"
  echo "  ARB_SEPOLIA_RPC_URL=$RPC"
  echo "  CONTRACT_ADDRESS=$ADDR"
  echo "  CONTRACT_DEPLOY_BLOCK=$DEPLOY_BLOCK"
  echo "  CHAIN_LABEL=arbitrum-sepolia"
else
  echo "Could not parse broadcast JSON — copy address from forge output above into .env"
fi
echo ""
echo "Then: ./demos/setup.sh   # or grant via console (setup redeploys — skip if you only needed deploy)"
echo "Or grant manually / use console Grant after setting CONTRACT_ADDRESS."
echo "Verify path: ./scripts/check-arbitrum-path.sh"
