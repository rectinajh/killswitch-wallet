#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract

echo "=================================================="
echo "Demo 1: Successful Payment Within Policy"
echo "=================================================="
echo "chainId=$CHAIN_ID amount_wei=$DEMO_SUCCESS_AMOUNT_WEI"

FROM=$(latest_block)
echo "Step 1: proposeOrPay to allowlisted merchant"
TX=$(propose_pay 0 "$MERCHANT2" "$DEMO_SUCCESS_AMOUNT_WEI" "Coffee purchase")
echo "✓ tx: $TX"
if [[ "$CHAIN_ID" == "421614" ]]; then
  echo "  Arbiscan: https://sepolia.arbiscan.io/tx/$TX"
fi

echo ""
echo "Step 2: on-chain events"
show_payment_events "$FROM"

SPENT=$(spent_of 0)
echo ""
echo "Spent after success: $SPENT wei"
echo "=================================================="
echo "Demo 1 Complete"
echo "=================================================="
