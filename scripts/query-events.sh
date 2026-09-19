#!/bin/bash
# Query payment events for audit trail

set -e

source .env

SESSION_ID=${1:-""}

echo "=================================================="
echo "Payment Events Audit Trail"
echo "=================================================="
echo ""

if [ -n "$SESSION_ID" ]; then
  echo "Filtering by Session ID: $SESSION_ID"
  echo ""
fi

echo "Querying PaymentExecuted events..."
EXECUTED=$(cast logs --address $CONTRACT_ADDRESS \
  --from-block 0 \
  --to-block latest \
  --rpc-url $RPC_URL \
  2>/dev/null | grep -A10 "PaymentExecuted" || echo "")

if [ -n "$EXECUTED" ]; then
  echo "$EXECUTED"
  echo ""
else
  echo "  (no executed payments)"
  echo ""
fi

echo "Querying PaymentDenied events..."
DENIED=$(cast logs --address $CONTRACT_ADDRESS \
  --from-block 0 \
  --to-block latest \
  --rpc-url $RPC_URL \
  2>/dev/null | grep -A10 "PaymentDenied" || echo "")

if [ -n "$DENIED" ]; then
  echo "$DENIED"
  echo ""
else
  echo "  (no denied payments)"
  echo ""
fi

echo "Querying SessionGranted events..."
GRANTED=$(cast logs --address $CONTRACT_ADDRESS \
  --from-block 0 \
  --to-block latest \
  --rpc-url $RPC_URL \
  2>/dev/null | grep -A10 "SessionGranted" || echo "")

if [ -n "$GRANTED" ]; then
  echo "$GRANTED"
  echo ""
else
  echo "  (no sessions created)"
  echo ""
fi

echo "Querying SessionFrozen events..."
FROZEN=$(cast logs --address $CONTRACT_ADDRESS \
  --from-block 0 \
  --to-block latest \
  --rpc-url $RPC_URL \
  2>/dev/null | grep -A5 "SessionFrozen" || echo "")

if [ -n "$FROZEN" ]; then
  echo "$FROZEN"
  echo ""
else
  echo "  (no frozen sessions)"
  echo ""
fi

echo "=================================================="
echo ""
echo "💡 Tip: All events are immutable on-chain"
echo "   Anyone with contract address can reconstruct this history"
echo ""
