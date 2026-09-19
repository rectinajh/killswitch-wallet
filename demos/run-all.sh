#!/bin/bash
set -euo pipefail
cd "$(dirname "$0")/.."
echo "Running full KillSwitch local demo suite"
./demos/01-success-payment.sh
./demos/02-budget-exceeded.sh
./demos/03-merchant-denied.sh
./demos/04-freeze-session.sh
echo "ALL DEMOS OK"
