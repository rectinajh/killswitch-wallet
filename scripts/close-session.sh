#!/bin/bash
# Close session and reclaim remaining budget

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/close-session.sh <SESSION_ID>"
  exit 1
fi

SESSION_ID=$1
source .env

echo "=================================================="
echo "Close Session: Session #$SESSION_ID"
echo "=================================================="
echo ""

echo "Reading current state..."
POLICY=$(cast call $CONTRACT_ADDRESS \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  $SESSION_ID \
  --rpc-url $RPC_URL)

OWNER=$(echo "$POLICY" | awk 'NR==1')
BUDGET=$(echo "$POLICY" | awk 'NR==2')
SPENT=$(echo "$POLICY" | awk 'NR==3')
ACTIVE=$(echo "$POLICY" | awk 'NR==7')

if [ "$ACTIVE" = "false" ]; then
  echo "✗ Session is already closed"
  exit 1
fi

REMAINING=$((BUDGET - SPENT))
REMAINING_ETH=$(cast to-unit $REMAINING ether)

echo "Session #$SESSION_ID"
echo "Owner: $OWNER"
echo "Remaining budget: $REMAINING_ETH ETH"
echo ""

read -p "Close session and reclaim $REMAINING_ETH ETH? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
  echo "Cancelled."
  exit 0
fi

echo ""
echo "Sending close transaction..."
TX=$(cast send $CONTRACT_ADDRESS \
  "closeSession(uint256)" \
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

echo "Verifying closure..."
POLICY_AFTER=$(cast call $CONTRACT_ADDRESS \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  $SESSION_ID \
  --rpc-url $RPC_URL)

ACTIVE_AFTER=$(echo "$POLICY_AFTER" | awk 'NR==7')

if [ "$ACTIVE_AFTER" = "false" ]; then
  echo "✓ Session #$SESSION_ID is now CLOSED"
  echo "✓ Remaining $REMAINING_ETH ETH refunded to owner"
else
  echo "✗ Close failed - session still active"
fi

echo ""
echo "=================================================="
