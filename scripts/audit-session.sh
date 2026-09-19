#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
source .env
SID="${1:-0}"
echo "Audit session $SID at $CONTRACT_ADDRESS"
cast call "$CONTRACT_ADDRESS" \
  "getSessionPolicy(uint256)(address,uint256,uint256,uint256,address[],bool,bool)" \
  "$SID" --rpc-url "$RPC_URL"
echo "--- executed ---"
cast logs --address "$CONTRACT_ADDRESS" --from-block 0 --rpc-url "$RPC_URL" \
  "PaymentExecuted(uint256,address,uint256,uint256,bytes32)" | sed -n "1,80p"
echo "--- denied ---"
cast logs --address "$CONTRACT_ADDRESS" --from-block 0 --rpc-url "$RPC_URL" \
  "PaymentDenied(uint256,address,uint256,string)" | sed -n "1,120p"
