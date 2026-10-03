#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract

echo "=================================================="
echo "Demo 3: Merchant Not on Allowlist (Boundary Test)"
echo "=================================================="
echo "chainId=$CHAIN_ID"

FROM=$(latest_block)
echo "Step 1: grant session allowlisting only MERCHANT2"
TXG=$(grant_session "$DEMO_BUDGET_MERCHANT_WEI" 3600 "$MERCHANT2" "$DEMO_BUDGET_MERCHANT_ETH")
SID=$(next_session_id)
echo "✓ grant tx: $TXG | session=$SID"

echo "Step 2: propose pay to unauthorized merchant $UNAUTHORIZED"
TX=$(propose_pay "$SID" "$UNAUTHORIZED" "$DEMO_MERCHANT_AMOUNT_WEI" "Unauthorized merchant test")
echo "✓ tx: $TX"
if [[ "$CHAIN_ID" == "421614" ]]; then
  echo "  Arbiscan: https://sepolia.arbiscan.io/tx/$TX"
fi

echo ""
show_payment_events "$FROM"
SPENT=$(spent_of "$SID")
BAL=$(cast balance "$UNAUTHORIZED" --rpc-url "$RPC_URL")
echo ""
echo "Spent after denial: $SPENT wei (expect 0)"
echo "Unauthorized balance: $BAL (expect 0)"
echo "=================================================="
echo "Demo 3 Complete"
echo "=================================================="
