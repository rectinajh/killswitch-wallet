#!/bin/bash
set -euo pipefail
ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"
set -a
# shellcheck disable=SC1091
source .env
set +a

MERCHANT1="0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266"
MERCHANT2="0x70997970C51812dc3A010C7d01b50e0d17dc79C8"
UNAUTHORIZED="0xBad0000000000000000000000000000000000Bad"

# Owner = Anvil #0 (grant/freeze/close); Agent = Anvil #1 (propose)
OWNER_KEY="${OWNER_PRIVATE_KEY:-0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80}"
AGENT_KEY="${AGENT_PRIVATE_KEY:-${PRIVATE_KEY:-0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d}}"
AGENT_ADDR="${AGENT_ADDRESS:-$(cast wallet address --private-key "$AGENT_KEY")}"

require_contract() {
  if [[ -z "${CONTRACT_ADDRESS:-}" || "$CONTRACT_ADDRESS" == "null" ]]; then
    echo "CONTRACT_ADDRESS missing. Run ./demos/setup.sh first."
    exit 1
  fi
}

latest_block() {
  cast block-number --rpc-url "$RPC_URL"
}

show_payment_events() {
  local from_block="${1:-0}"
  echo "--- PaymentExecuted ---"
  cast logs --address "$CONTRACT_ADDRESS" \
    --from-block "$from_block" \
    --rpc-url "$RPC_URL" \
    "PaymentExecuted(uint256,address,uint256,uint256,bytes32)" || true
  echo "--- PaymentDenied ---"
  cast logs --address "$CONTRACT_ADDRESS" \
    --from-block "$from_block" \
    --rpc-url "$RPC_URL" \
    "PaymentDenied(uint256,address,uint256,string)" || true
}

propose_pay() {
  local session_id="$1" merchant="$2" amount_wei="$3" desc="$4"
  cast send "$CONTRACT_ADDRESS" \
    "proposeOrPay(uint256,address,uint256,string)" \
    "$session_id" "$merchant" "$amount_wei" "$desc" \
    --private-key "$AGENT_KEY" \
    --rpc-url "$RPC_URL" \
    --json | jq -r '.transactionHash'
}

grant_session() {
  local budget_wei="$1" duration="$2" merchant="$3" value_ether="$4"
  cast send "$CONTRACT_ADDRESS" \
    "grantSession(uint256,uint256,address,address[])" \
    "$budget_wei" "$duration" "$AGENT_ADDR" "[$merchant]" \
    --value "${value_ether}ether" \
    --private-key "$OWNER_KEY" \
    --rpc-url "$RPC_URL" \
    --json | jq -r '.transactionHash'
}

next_session_id() {
  local n
  n=$(cast call "$CONTRACT_ADDRESS" "nextSessionId()(uint256)" --rpc-url "$RPC_URL")
  echo $((n - 1))
}

spent_of() {
  local sid="$1"
  cast call "$CONTRACT_ADDRESS" \
    "getSessionPolicy(uint256)(address,address,uint256,uint256,uint256,address[],bool,bool)" \
    "$sid" --rpc-url "$RPC_URL" | sed -n '4p'
}
