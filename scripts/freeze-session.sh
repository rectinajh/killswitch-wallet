#!/bin/bash
# Emergency freeze session to stop spending

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/freeze-session.sh <SESSION_ID>"
  exit 1
fi

SESSION_ID=$1
source .env

echo "=================================================="
echo "Emergency Freeze: Session #$SESSION_ID"
echo "=================================================="
echo ""

echo "⚠️  WARNING: This will immediately stop all spending on this session"
echo "   Pending transactions will be rejected"
echo "   You can close the session later to reclaim remaining budget"
echo ""

read -p "Confirm freeze session #$SESSION_ID? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Sending freeze transaction..."
TX=$(cast send $CONTRACT_ADDRESS \
  "freeze(uint256)" \
  $SESSION_ID \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Transaction sent: $TX"
echo ""

echo "Waiting for confirmation..."
cast receipt $TX --rpc-url $RPC_URL > /dev/null
echo "✓ Transaction confirmed"
echo ""

echo "Verifying freeze status..."
POLICY=$(cast call $CONTRACT_ADDRESS \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  $SESSION_ID \
  --rpc-url $RPC_URL)

FROZEN=$(echo "$POLICY" | awk 'NR==6')

if [ "$FROZEN" = "true" ]; then
  echo "✓ Session #$SESSION_ID is now FROZEN"
  echo ""
  echo "🔒 All payment attempts will be rejected"
  echo "💡 To reclaim remaining budget, run:"
  echo "   ./scripts/close-session.sh $SESSION_ID"
else
  echo "✗ Freeze failed - session still active"
fi

echo ""
echo "=================================================="
