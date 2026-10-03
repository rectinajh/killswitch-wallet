#!/usr/bin/env bash
# Validate Arbitrum Buildathon deployment path (no secrets printed).
set -euo pipefail
cd "$(dirname "$0")/.."

if [[ ! -f .env ]]; then
  echo "FAIL: .env missing (copy from .env.example)"
  exit 1
fi
# shellcheck disable=SC1091
set -a
source .env
set +a

ok=1
RPC="${RPC_URL:-}"
echo "RPC_URL=${RPC:-<unset>}"

if [[ -z "$RPC" ]]; then
  echo "FAIL: RPC_URL unset"
  exit 1
fi

if ! curl -sf -X POST "$RPC" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' >/tmp/ks-chain.json; then
  echo "FAIL: RPC not reachable"
  exit 1
fi

CHAIN_ID_HEX=$(jq -r '.result' /tmp/ks-chain.json)
CHAIN_ID=$((16#${CHAIN_ID_HEX#0x}))
echo "chainId=$CHAIN_ID"

if [[ "$CHAIN_ID" == "421614" ]]; then
  echo "✓ Arbitrum Sepolia"
elif [[ "$CHAIN_ID" == "42161" ]]; then
  echo "✓ Arbitrum One (mainnet — use with care)"
else
  echo "· Not Arbitrum (got $CHAIN_ID). Qualification needs Arbitrum Sepolia/One/Robinhood/etc."
  [[ "$CHAIN_ID" == "31337" ]] && echo "  (Anvil is fine for local; switch RPC for submission)"
  ok=0
fi

echo "CHAIN_LABEL=${CHAIN_LABEL:-<unset>}"
echo "CONTRACT_ADDRESS=${CONTRACT_ADDRESS:-<unset>}"
echo "CONTRACT_DEPLOY_BLOCK=${CONTRACT_DEPLOY_BLOCK:-<unset>}"

if [[ -z "${CONTRACT_ADDRESS:-}" ]]; then
  echo "· CONTRACT_ADDRESS missing — run scripts/deploy-arbitrum-sepolia.sh or demos/setup.sh"
  ok=0
else
  CODE=$(cast code "$CONTRACT_ADDRESS" --rpc-url "$RPC" 2>/dev/null || echo "0x")
  if [[ "$CODE" == "0x" || -z "$CODE" ]]; then
    echo "FAIL: no contract code at CONTRACT_ADDRESS"
    ok=0
  else
    echo "✓ Contract has code (${#CODE} chars)"
  fi
  if [[ "$CHAIN_ID" == "421614" ]]; then
    echo "Explorer: https://sepolia.arbiscan.io/address/$CONTRACT_ADDRESS"
  elif [[ "$CHAIN_ID" == "42161" ]]; then
    echo "Explorer: https://arbiscan.io/address/$CONTRACT_ADDRESS"
  fi
fi

OWNER_KEY="${OWNER_PRIVATE_KEY:-}"
AGENT_KEY="${AGENT_PRIVATE_KEY:-${PRIVATE_KEY:-}}"
if [[ -n "$OWNER_KEY" ]]; then
  OA=$(cast wallet address --private-key "$OWNER_KEY" 2>/dev/null || true)
  if [[ -n "$OA" ]]; then
    OB=$(cast balance "$OA" --rpc-url "$RPC" 2>/dev/null || echo "?")
    echo "owner=$OA balance_wei=$OB"
  fi
else
  echo "· OWNER_PRIVATE_KEY unset"
  ok=0
fi
if [[ -n "$AGENT_KEY" ]]; then
  AA=$(cast wallet address --private-key "$AGENT_KEY" 2>/dev/null || true)
  if [[ -n "$AA" ]]; then
    AB=$(cast balance "$AA" --rpc-url "$RPC" 2>/dev/null || echo "?")
    echo "agent=$AA balance_wei=$AB"
  fi
else
  echo "· AGENT_PRIVATE_KEY unset"
  ok=0
fi

echo "LLM_PROVIDER=${LLM_PROVIDER:-<unset>} (optional for Arbitrum track)"
echo "Docs: docs/ARBITRUM_BUILDATHON.md"

if [[ $ok -eq 1 ]]; then
  echo "ARB_PATH_OK"
  exit 0
fi
echo "ARB_PATH_NEEDS_FIX"
exit 2
