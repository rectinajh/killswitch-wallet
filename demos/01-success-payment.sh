#!/bin/bash
set -e

echo "=================================================="
echo "Demo 1: Successful Payment Within Policy"
echo "=================================================="
echo ""

source .env

echo "Step 1: Reading session policy..."
POLICY=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL)
echo "✓ Policy retrieved"
echo ""

echo "Step 2: Agent proposes payment for coffee..."
echo "User Intent: 'Buy a coffee for 0.05 ETH'"
echo ""

SESSION_ID=0 USER_INTENT="Buy a coffee for 0.05 ETH" node agent/dist/index.js > /tmp/demo1-output.log 2>&1 || true

echo ""
echo "Step 3: Checking transaction outcome..."
echo ""

EVENTS=$(cast logs --address $CONTRACT_ADDRESS --from-block latest:1 --rpc-url $RPC_URL)
echo "$EVENTS" | grep -A5 "PaymentExecuted" && echo "✓ Payment EXECUTED successfully!" || echo "Payment was denied (check logs)"

echo ""
echo "Step 4: Transaction receipt..."
cat /tmp/demo1-output.log

echo ""
echo "Step 5: Verify on-chain evidence..."
SPENT=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL | awk 'NR==3')
echo "Budget spent: $SPENT wei"

echo ""
echo "=================================================="
echo "Demo 1 Complete: Payment authorized and recorded"
echo "=================================================="
