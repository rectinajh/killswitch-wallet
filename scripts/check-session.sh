#!/bin/bash
# Check session status and remaining budget

set -e

if [ -z "$1" ]; then
  echo "Usage: ./scripts/check-session.sh <SESSION_ID>"
  exit 1
fi

SESSION_ID=$1
source .env

echo "=================================================="
echo "Session Status: Session #$SESSION_ID"
echo "=================================================="
echo ""

echo "Reading on-chain state..."
POLICY=$(cast call $CONTRACT_ADDRESS \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  $SESSION_ID \
  --rpc-url $RPC_URL)

OWNER=$(echo "$POLICY" | awk 'NR==1')
BUDGET=$(echo "$POLICY" | awk 'NR==2')
SPENT=$(echo "$POLICY" | awk 'NR==3')
DEADLINE=$(echo "$POLICY" | awk 'NR==4')
FROZEN=$(echo "$POLICY" | awk 'NR==6')
ACTIVE=$(echo "$POLICY" | awk 'NR==7')

BUDGET_ETH=$(cast to-unit $BUDGET ether)
SPENT_ETH=$(cast to-unit $SPENT ether)
REMAINING=$(cast call $CONTRACT_ADDRESS "getRemainingBudget(uint256)(uint256)" $SESSION_ID --rpc-url $RPC_URL)
REMAINING_ETH=$(cast to-unit $REMAINING ether)

DEADLINE_DATE=$(date -d @$DEADLINE 2>/dev/null || date -r $DEADLINE 2>/dev/null || echo "Unknown")
NOW=$(date +%s)

echo "Owner: $OWNER"
echo "Budget: $BUDGET_ETH ETH"
echo "Spent: $SPENT_ETH ETH"
echo "Remaining: $REMAINING_ETH ETH"
echo "Deadline: $DEADLINE_DATE"
echo "Frozen: $FROZEN"
echo "Active: $ACTIVE"
echo ""

if [ "$ACTIVE" = "false" ]; then
  echo "⚠️  Session is CLOSED"
elif [ "$FROZEN" = "true" ]; then
  echo "🔒 Session is FROZEN - no payments allowed"
elif [ $NOW -gt $DEADLINE ]; then
  echo "⏰ Session EXPIRED - deadline passed"
elif [ "$REMAINING" = "0" ]; then
  echo "💰 Budget EXHAUSTED - no funds remaining"
else
  echo "✓ Session is ACTIVE and usable"
fi

echo ""
echo "Merchant Allowlist:"
MERCHANTS=$(echo "$POLICY" | awk 'NR==5')
echo "$MERCHANTS" | tr ',' '\n' | grep -o '0x[a-fA-F0-9]*' || echo "  (parsing error)"

echo ""
echo "=================================================="
