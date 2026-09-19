#!/bin/bash
set -e

echo "=================================================="
echo "KillSwitch Wallet - Demo Setup"
echo "=================================================="
echo ""

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example and configure it."
  exit 1
fi

source .env

echo "Step 1: Checking Anvil is running..."
if ! curl -sf -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | grep -q result; then
  echo "Error: Anvil not running. Start with: anvil"
  exit 1
fi
echo "✓ Anvil is running"
echo ""

echo "Step 2: Deploying SessionPolicy contract..."
cd contracts

if [ ! -f out/SessionPolicy.sol/SessionPolicy.json ]; then
  echo "Building contracts..."
  forge build
fi

DEPLOY_OUTPUT=$(forge create src/SessionPolicy.sol:SessionPolicy \
  --rpc-url $RPC_URL \
  --private-key $PRIVATE_KEY \
  --broadcast \
  --json)

CONTRACT_ADDRESS=$(echo $DEPLOY_OUTPUT | jq -r '.deployedTo')
echo "✓ Contract deployed at: $CONTRACT_ADDRESS"

cd ..

echo ""
echo "Step 3: Updating .env with contract address..."
if grep -q "^CONTRACT_ADDRESS=" .env; then
  sed -i.bak "s|^CONTRACT_ADDRESS=.*|CONTRACT_ADDRESS=$CONTRACT_ADDRESS|" .env
else
  echo "CONTRACT_ADDRESS=$CONTRACT_ADDRESS" >> .env
fi
echo "✓ .env updated"

source .env

echo ""
echo "Step 4: Creating initial demo session..."
MERCHANT1="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"  # Anvil account 0
MERCHANT2="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"  # Anvil account 1

SESSION_TX=$(cast send $CONTRACT_ADDRESS \
  "grantSession(uint256,uint256,address[])(uint256)" \
  1000000000000000000 \
  3600 \
  "[$MERCHANT1,$MERCHANT2]" \
  --value 1ether \
  --private-key $PRIVATE_KEY \
  --rpc-url $RPC_URL \
  --json | jq -r '.transactionHash')

echo "✓ Session created: $SESSION_TX"
echo "  Budget: 1 ETH"
echo "  Duration: 1 hour"
echo "  Merchants: $MERCHANT1, $MERCHANT2"

SESSION_ID=$(cast call $CONTRACT_ADDRESS "nextSessionId()(uint256)" --rpc-url $RPC_URL)
SESSION_ID=$((SESSION_ID - 1))
echo "  Session ID: $SESSION_ID"

echo ""
echo "Step 5: Building agent..."
cd agent
if [ ! -d node_modules ]; then
  echo "Installing agent dependencies..."
  npm install
fi
npm run build || { echo "WARN: agent build failed; cast demos still work"; }
cd ..
echo "✓ Agent step done"

echo ""
echo "=================================================="
echo "Setup Complete!"
echo "=================================================="
echo ""
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Session ID: $SESSION_ID"
echo ""
echo "Run demos:"
echo "  ./demos/01-success-payment.sh"
echo "  ./demos/02-budget-exceeded.sh"
echo "  ./demos/03-merchant-denied.sh"
echo ""
