#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract

echo "=================================================="
echo "Demo 1: Successful Payment Within Policy"
echo "=================================================="

FROM=$(latest_block)
echo "Step 1: proposeOrPay 0.05 ETH to allowlisted merchant"
AMOUNT=50000000000000000
TX=$(propose_pay 0 "$MERCHANT2" "$AMOUNT" "Coffee purchase")
echo "✓ tx: $TX"

echo ""
echo "Step 2: on-chain events"
show_payment_events "$FROM"

SPENT=$(spent_of 0)
echo ""
echo "Spent after success: $SPENT wei (expect ~0.051 ETH = 5.1e16)"
echo "=================================================="
echo "Demo 1 Complete"
echo "=================================================="
