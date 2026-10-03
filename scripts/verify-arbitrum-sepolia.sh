#!/usr/bin/env bash
# Verify SessionPolicy on Arbiscan (Arbitrum Sepolia).
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
set -a
source .env
set +a

ADDR="${CONTRACT_ADDRESS:-}"
RPC="${ARB_SEPOLIA_RPC_URL:-${RPC_URL:-}}"
if [[ -z "$ADDR" ]]; then
  echo "FAIL: CONTRACT_ADDRESS unset"
  exit 1
fi

KEY="${ARBISCAN_API_KEY:-${ETHERSCAN_API_KEY:-}}"
echo "Contract: $ADDR"
echo "Explorer: https://sepolia.arbiscan.io/address/$ADDR"

cd contracts
forge build

if [[ -z "$KEY" || "$KEY" == your_* || "$KEY" == dummy || ${#KEY} -lt 20 ]]; then
  echo "No real ARBISCAN_API_KEY — trying Sourcify…"
  unset ETHERSCAN_API_KEY || true
  unset ARBISCAN_API_KEY || true
  forge verify-contract "$ADDR" src/SessionPolicy.sol:SessionPolicy \
    --chain 421614 \
    --verifier sourcify \
    --watch || echo "Sourcify failed. Get https://arbiscan.io/myapikey then: export ARBISCAN_API_KEY=... && ./scripts/verify-arbitrum-sepolia.sh"
  exit 0
fi

forge verify-contract "$ADDR" src/SessionPolicy.sol:SessionPolicy \
  --chain 421614 \
  --etherscan-api-key "$KEY" \
  --watch
