#!/bin/bash
source "$(dirname "$0")/_lib.sh"
require_contract
echo "=================================================="
echo "Demo 4: Emergency Freeze"
echo "=================================================="
FROM=$(latest_block)
SID=$(next_session_id)
# create fresh session
TXG=$(grant_session 1000000000000000000 3600 "$MERCHANT2" 1)
SID=$(next_session_id)
echo "session=$SID grant=$TXG"
cast send "$CONTRACT_ADDRESS" "freeze(uint256)" "$SID" \
  --private-key "$OWNER_KEY" --rpc-url "$RPC_URL" --json | jq -r '.transactionHash' | awk '{print "freeze tx:",$0}'
# expect revert on propose
set +e
OUT=$(cast send "$CONTRACT_ADDRESS" "proposeOrPay(uint256,address,uint256,string)" \
  "$SID" "$MERCHANT2" 10000000000000000 "after freeze" \
  --private-key "$AGENT_KEY" --rpc-url "$RPC_URL" 2>&1)
RC=$?
set -e
echo "$OUT" | tail -20
if echo "$OUT" | grep -qiE 'SessionIsFrozen|execution reverted|revert'; then
  echo "✓ propose after freeze blocked as expected"
else
  echo "WARN: unexpected outcome rc=$RC"
fi
echo "=================================================="
echo "Demo 4 Complete"
echo "=================================================="
