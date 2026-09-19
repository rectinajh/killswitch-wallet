#!/bin/bash
# Pretty on-chain audit for a session: policy + proposed/executed/denied
set -euo pipefail
cd "$(dirname "$0")/.."
# shellcheck disable=SC1091
set -a; source .env; set +a
SID="${1:-0}"

if [[ -z "${CONTRACT_ADDRESS:-}" ]]; then
  echo "CONTRACT_ADDRESS missing. Run ./demos/setup.sh first."
  exit 1
fi

echo "=================================================="
echo "KillSwitch audit — session $SID"
echo "Contract: $CONTRACT_ADDRESS"
echo "RPC:      $RPC_URL"
echo "=================================================="
echo ""
echo "=== Policy (owner, budget, spent, deadline, merchants, frozen, active) ==="
echo "Note: spent includes 2% fee on executed payments; budget check = amount + fee."
cast call "$CONTRACT_ADDRESS" \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  "$SID" --rpc-url "$RPC_URL"

echo ""
echo "=== Remaining budget ==="
cast call "$CONTRACT_ADDRESS" \
  "getRemainingBudget(uint256)(uint256)" \
  "$SID" --rpc-url "$RPC_URL"

echo ""
echo "=== PaymentProposed ==="
cast logs --address "$CONTRACT_ADDRESS" --from-block 0 --rpc-url "$RPC_URL" \
  "PaymentProposed(uint256,address,uint256,string)" 2>/dev/null | sed -n '1,100p' || true

echo ""
echo "=== PaymentExecuted (amount, fee, receiptHash) ==="
cast logs --address "$CONTRACT_ADDRESS" --from-block 0 --rpc-url "$RPC_URL" \
  "PaymentExecuted(uint256,address,uint256,uint256,bytes32)" 2>/dev/null | sed -n '1,100p' || true

echo ""
echo "=== PaymentDenied (reason) ==="
cast logs --address "$CONTRACT_ADDRESS" --from-block 0 --rpc-url "$RPC_URL" \
  "PaymentDenied(uint256,address,uint256,string)" 2>/dev/null | sed -n '1,120p' || true

echo ""
echo "Tip: filter by session topic if many sessions exist."
echo "Done."
