#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract

echo "=================================================="
echo "Demo 2: Budget Exceeded (Boundary Test)"
echo "=================================================="
echo "chainId=$CHAIN_ID budget=$DEMO_BUDGET_TIGHT_ETH ETH; propose amount_wei=$DEMO_OVER_AMOUNT_WEI (+2% fee → deny)"

FROM=$(latest_block)
echo "Step 1: grant tight-budget session"
TXG=$(grant_session "$DEMO_BUDGET_TIGHT_WEI" 3600 "$MERCHANT2" "$DEMO_BUDGET_TIGHT_ETH")
SID=$(next_session_id)
echo "✓ grant tx: $TXG | session=$SID"

echo "Step 2: propose over-budget payment"
TX=$(propose_pay "$SID" "$MERCHANT2" "$DEMO_OVER_AMOUNT_WEI" "Exceeds budget with fee")
echo "✓ tx: $TX"
if [[ "$CHAIN_ID" == "421614" ]]; then
  echo "  Arbiscan: https://sepolia.arbiscan.io/tx/$TX"
fi

echo ""
show_payment_events "$FROM"
SPENT=$(spent_of "$SID")
echo ""
echo "Spent after denial: $SPENT wei (expect 0)"
echo "=================================================="
echo "Demo 2 Complete"
echo "=================================================="
