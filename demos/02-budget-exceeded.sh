#!/bin/bash
set -e

echo "=================================================="
echo "Demo 2: Budget Exceeded (Boundary Test)"
echo "=================================================="
echo ""

source .env

echo "Scenario: Agent proposes payment that exceeds budget after fees"
echo "Budget: 0.1 ETH | Proposed: 0.099 ETH | With 2% fee: 0.10098 ETH > Budget"
echo ""

echo "Step 1: Reading current session policy..."
POLICY=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL)
BUDGET=$(echo "$POLICY" | awk 'NR==2')
SPENT=$(echo "$POLICY" | awk 'NR==3')
echo "Budget: $BUDGET wei"
echo "Spent: $SPENT wei"
echo ""

echo "Step 2: Creating new session with tight budget..."
MERCHANT=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL | awk 'NR==5' | awk '{print $1}')

# Grant new session with 0.1 ETH budget
SESSION_TX=$(cast send $CONTRACT_ADDRESS \
  "grantSession(uint256,uint256,address[])(uint256)" \
  100000000000000000 \
  3600 \
  "[$MERCHANT]" \
  --value 0.1ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Session created: $SESSION_TX"

# Get new session ID (should be 1 if first demo used session 0)
NEW_SESSION_ID=$(cast call $CONTRACT_ADDRESS "nextSessionId()(uint256)" --rpc-url $RPC_URL)
NEW_SESSION_ID=$((NEW_SESSION_ID - 1))
echo "✓ New session ID: $NEW_SESSION_ID"
echo ""

echo "Step 3: Agent proposes payment that exceeds budget..."
echo "User Intent: 'Buy expensive item for 0.099 ETH'"
echo ""

SESSION_ID=$NEW_SESSION_ID USER_INTENT="Buy expensive item for 0.099 ETH" node agent/dist/index.js > /tmp/demo2-output.log 2>&1 || true

echo ""
echo "Step 4: Checking transaction outcome..."
echo ""

EVENTS=$(cast logs --address $CONTRACT_ADDRESS --from-block latest:1 --rpc-url $RPC_URL)
echo "$EVENTS" | grep -A5 "PaymentDenied" && echo "✓ Payment DENIED as expected!" || echo "Unexpected: payment was not denied"

echo ""
echo "Step 5: Contract denial reason..."
cat /tmp/demo2-output.log | grep -A3 "denied" || echo "(Check full logs at /tmp/demo2-output.log)"

echo ""
echo "Step 6: Verify no funds were transferred..."
SPENT_AFTER=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" $NEW_SESSION_ID --rpc-url $RPC_URL | awk 'NR==3')
echo "Budget spent after denial: $SPENT_AFTER wei (should be 0)"

echo ""
echo "=================================================="
echo "Demo 2 Complete: Boundary enforced, denial recorded"
echo "=================================================="
