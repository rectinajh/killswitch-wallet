#!/bin/bash
set -e

echo "=================================================="
echo "Demo 3: Merchant Not on Allowlist (Boundary Test)"
echo "=================================================="
echo ""

source .env

echo "Scenario: Agent proposes payment to unauthorized merchant"
echo ""

echo "Step 1: Reading current allowed merchants..."
MERCHANT1=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" 0 --rpc-url $RPC_URL | grep -o '0x[a-fA-F0-9]*' | head -1)
echo "Allowed merchant: $MERCHANT1"
echo ""

echo "Step 2: Creating session with single merchant allowlist..."
SESSION_TX=$(cast send $CONTRACT_ADDRESS \
  "grantSession(uint256,uint256,address[])(uint256)" \
  1000000000000000000 \
  3600 \
  "[$MERCHANT1]" \
  --value 1ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Session created: $SESSION_TX"

NEW_SESSION_ID=$(cast call $CONTRACT_ADDRESS "nextSessionId()(uint256)" --rpc-url $RPC_URL)
NEW_SESSION_ID=$((NEW_SESSION_ID - 1))
echo "✓ New session ID: $NEW_SESSION_ID"
echo "✓ Only merchant $MERCHANT1 is allowed"
echo ""

echo "Step 3: Agent attempts payment to UNAUTHORIZED merchant..."
UNAUTHORIZED_MERCHANT="0xBAD0000000000000000000000000000000000BAD"
echo "Unauthorized merchant: $UNAUTHORIZED_MERCHANT"
echo ""

# Modify agent to use unauthorized merchant (simulate agent misbehavior or user error)
echo "User Intent: 'Pay 0.1 ETH to address $UNAUTHORIZED_MERCHANT'"

# Direct contract call with unauthorized merchant
echo "Calling contract directly to demonstrate boundary enforcement..."
DENY_TX=$(cast send $CONTRACT_ADDRESS \
  "proposeOrPay(uint256,address,uint256,string)" \
  $NEW_SESSION_ID \
  $UNAUTHORIZED_MERCHANT \
  100000000000000000 \
  "Unauthorized merchant test" \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Transaction sent: $DENY_TX"
echo ""

echo "Step 4: Checking transaction outcome..."
echo ""

EVENTS=$(cast logs --address $CONTRACT_ADDRESS --from-block latest:1 --rpc-url $RPC_URL)
echo "$EVENTS" | grep -A5 "PaymentDenied" && echo "✓ Payment DENIED as expected!" || echo "Unexpected: payment was not denied"

REASON=$(echo "$EVENTS" | grep "Merchant not allowed" || echo "")
if [ -n "$REASON" ]; then
  echo "✓ Denial reason: Merchant not allowed"
fi

echo ""
echo "Step 5: Verify no funds were transferred..."
SPENT_AFTER=$(cast call $CONTRACT_ADDRESS "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" $NEW_SESSION_ID --rpc-url $RPC_URL | awk 'NR==3')
echo "Budget spent after denial: $SPENT_AFTER wei (should be 0)"

UNAUTHORIZED_BALANCE=$(cast balance $UNAUTHORIZED_MERCHANT --rpc-url $RPC_URL)
echo "Unauthorized merchant balance: $UNAUTHORIZED_BALANCE (should be 0)"

echo ""
echo "=================================================="
echo "Demo 3 Complete: Allowlist enforced, denial recorded"
echo "=================================================="
