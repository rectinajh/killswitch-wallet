#!/bin/bash
# Deploy SessionPolicy + seed a demo session on whatever RPC_URL points at
# (Anvil locally, or Arbitrum Sepolia / other public testnets).
set -euo pipefail
cd "$(dirname "$0")/.."

echo "=================================================="
echo "KillSwitch Wallet - Demo Setup"
echo "=================================================="
echo ""

if [ ! -f .env ]; then
  echo "Error: .env file not found. Copy .env.example and configure it."
  exit 1
fi

# shellcheck disable=SC1091
set -a
source .env
set +a

RPC_URL="${RPC_URL:-http://127.0.0.1:8545}"

echo "Step 1: Checking RPC ($RPC_URL)..."
if ! curl -sf -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_blockNumber","params":[],"id":1}' | grep -q result; then
  echo "Error: RPC not reachable. Start anvil, or set RPC_URL to Arbitrum Sepolia."
  exit 1
fi

CHAIN_ID_HEX=$(curl -sf -X POST "$RPC_URL" \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"eth_chainId","params":[],"id":1}' | jq -r '.result')
CHAIN_ID=$((16#${CHAIN_ID_HEX#0x}))
echo "✓ RPC ok — chainId=$CHAIN_ID"

OWNER_KEY="${OWNER_PRIVATE_KEY:-${PRIVATE_KEY_OWNER:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}}"
AGENT_KEY="${AGENT_PRIVATE_KEY:-${PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}}"
OWNER_ADDR=$(cast wallet address --private-key "$OWNER_KEY")
AGENT_ADDR=$(cast wallet address --private-key "$AGENT_KEY")

# Budget for initial session: large on Anvil, faucet-sized on public nets
if [ "$CHAIN_ID" = "31337" ]; then
  BUDGET_WEI=1000000000000000000   # 1 ETH
  BUDGET_LABEL="1 ETH"
  MERCHANT1="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
  MERCHANT2="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
else
  BUDGET_WEI=800000000000000       # 0.0008 ETH
  BUDGET_LABEL="0.0008 ETH"
  MERCHANT1="${MERCHANT_API:-$OWNER_ADDR}"
  MERCHANT2="${MERCHANT_COFFEE:-$AGENT_ADDR}"
  echo "· Public testnet mode — using faucet-sized grant ($BUDGET_LABEL)"
  echo "· Merchants: API=$MERCHANT1 coffee=$MERCHANT2 (your EOAs, not Anvil)"
  echo "· Tip: fund OWNER + AGENT (see docs/ARBITRUM_BUILDATHON.md)"
fi
echo ""
DEPLOY_BLOCK=$(cast block-number --rpc-url "$RPC_URL")

if [[ "${SKIP_DEPLOY:-0}" == "1" && -n "${CONTRACT_ADDRESS:-}" ]]; then
  echo "Step 2: SKIP_DEPLOY=1 — reusing CONTRACT_ADDRESS=$CONTRACT_ADDRESS"
else
  echo "Step 2: Deploying SessionPolicy contract..."
  cd contracts

  if [ ! -f out/SessionPolicy.sol/SessionPolicy.json ]; then
    echo "Building contracts..."
    forge build
  fi

  DEPLOY_OUTPUT=$(forge create src/SessionPolicy.sol:SessionPolicy \
    --rpc-url "$RPC_URL" \
    --private-key "$OWNER_KEY" \
    --broadcast \
    --json)

  CONTRACT_ADDRESS=$(echo "$DEPLOY_OUTPUT" | jq -r '.deployedTo')
  if [ -z "$CONTRACT_ADDRESS" ] || [ "$CONTRACT_ADDRESS" = "null" ]; then
    echo "Deploy failed. Raw output:"
    echo "$DEPLOY_OUTPUT"
    exit 1
  fi
  echo "✓ Contract deployed at: $CONTRACT_ADDRESS (approx deploy block ≥ $DEPLOY_BLOCK)"

  cd ..
fi

echo ""
echo "Step 3: Updating .env..."
upsert_env() {
  local key="$1" val="$2"
  if grep -q "^${key}=" .env; then
    sed -i.bak "s|^${key}=.*|${key}=${val}|" .env
  else
    echo "${key}=${val}" >> .env
  fi
}
upsert_env CONTRACT_ADDRESS "$CONTRACT_ADDRESS"
upsert_env CONTRACT_DEPLOY_BLOCK "$DEPLOY_BLOCK"
case "$CHAIN_ID" in
  421614) upsert_env CHAIN_LABEL "arbitrum-sepolia" ;;
  42161)  upsert_env CHAIN_LABEL "arbitrum-one" ;;
  11155111) upsert_env CHAIN_LABEL "ethereum-sepolia" ;;
  31337)  upsert_env CHAIN_LABEL "anvil" ;;
esac
echo "✓ .env updated (CONTRACT_ADDRESS, CONTRACT_DEPLOY_BLOCK, CHAIN_LABEL)"

# shellcheck disable=SC1091
set -a
source .env
set +a

echo ""
echo "Step 4: Creating initial demo session..."
AGENT_KEY="${AGENT_PRIVATE_KEY:-${PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}}"
AGENT_ADDR=$(cast wallet address --private-key "$AGENT_KEY")

SESSION_TX=$(cast send "$CONTRACT_ADDRESS" \
  "grantSession(uint256,uint256,address,address[])(uint256)" \
  "$BUDGET_WEI" \
  3600 \
  "$AGENT_ADDR" \
  "[$MERCHANT1,$MERCHANT2]" \
  --value "$BUDGET_WEI" \
  --private-key "$OWNER_KEY" \
  --rpc-url "$RPC_URL" \
  --json | jq -r '.transactionHash')

echo "✓ Session created: $SESSION_TX"
echo "  Budget: $BUDGET_LABEL"
echo "  Agent:  $AGENT_ADDR"
echo "  Merchants: $MERCHANT1, $MERCHANT2"

SESSION_ID=$(cast call "$CONTRACT_ADDRESS" "nextSessionId()(uint256)" --rpc-url "$RPC_URL")
SESSION_ID=$((SESSION_ID - 1))
echo "  Session ID: $SESSION_ID"

echo ""
echo "Step 5: Building agent..."
cd agent
if [ ! -d node_modules ]; then
  npm install
fi
npm run build || { echo "WARN: agent build failed; cast demos still work"; }
cd ..
echo "✓ Agent step done"

echo ""
echo "=================================================="
echo "Setup Complete!"
echo "=================================================="
echo "chainId:          $CHAIN_ID"
echo "Contract Address: $CONTRACT_ADDRESS"
echo "Deploy block:     $DEPLOY_BLOCK"
echo "Session ID:       $SESSION_ID"
if [ "$CHAIN_ID" = "421614" ]; then
  echo "Explorer:         https://sepolia.arbiscan.io/address/$CONTRACT_ADDRESS"
fi
echo ""
echo "Next:"
echo "  ./scripts/check-arbitrum-path.sh   # when on Arbitrum"
echo "  ./demos/01-success-payment.sh"
echo "  ./demos/02-budget-exceeded.sh"
echo "  ./demos/03-merchant-denied.sh"
echo ""
