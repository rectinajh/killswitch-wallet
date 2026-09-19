#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract

echo "=================================================="
echo "Demo 2: Budget Exceeded (Boundary Test)"
echo "=================================================="
echo "Budget 0.1 ETH; propose 0.099 ETH + 2% fee = 0.10098 ETH > budget"

FROM=$(latest_block)
echo "Step 1: grant tight-budget session"
TXG=$(grant_session 100000000000000000 3600 "$MERCHANT2" 0.1)
SID=$(next_session_id)
echo "✓ grant tx: $TXG | session=$SID"

echo "Step 2: propose over-budget payment"
TX=$(propose_pay "$SID" "$MERCHANT2" 99000000000000000 "Exceeds budget with fee")
echo "✓ tx: $TX"

echo ""
show_payment_events "$FROM"
SPENT=$(spent_of "$SID")
echo ""
echo "Spent after denial: $SPENT wei (expect 0)"
echo "=================================================="
echo "Demo 2 Complete"
echo "=================================================="
