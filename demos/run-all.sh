#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running full KillSwitch local demo suite"
echo "(cast demos + note: agent-boundary.mjs exercises the TS agent path)"
./demos/01-success-payment.sh
./demos/02-budget-exceeded.sh
./demos/03-merchant-denied.sh
./demos/04-freeze-session.sh
echo ""
echo "--- Agent-boundary (optional but recommended for award polish) ---"
echo "  node demos/agent-boundary.mjs all"
echo "  → forces over-budget + off-allowlist via proposePayment options;"
echo "    contract emits PaymentDenied (deny is a success outcome)."
if [ "${RUN_AGENT_BOUNDARY:-0}" = "1" ]; then
  node demos/agent-boundary.mjs all
fi
echo "ALL DEMOS OK"
