#!/usr/bin/env bash
# Validate Furiosa B official configuration without printing secrets.
set -euo pipefail
cd "$(dirname "$0")/.."
if [[ ! -f .env ]]; then
  echo "FAIL: .env missing (copy from .env.example)"
  exit 1
fi
set -a
# shellcheck disable=SC1091
source .env
set +a

ok=1
echo "LLM_PROVIDER=${LLM_PROVIDER:-<unset>}"
if [[ "${LLM_PROVIDER:-}" == "kiln" ]]; then
  echo "✓ Official provider selected (kiln)"
else
  echo "· Local/demo provider: ${LLM_PROVIDER:-kimi} (switch to kiln for Furiosa official path)"
fi

key="${KILN_API_KEY:-}"
if [[ -n "$key" && "$key" != "your_key_here" && "$key" != your_* ]]; then
  echo "✓ KILN_API_KEY is set (${#key} chars, value hidden)"
else
  echo "· KILN_API_KEY not configured — mock/kiln live unavailable"
  [[ "${LLM_PROVIDER:-}" == "kiln" ]] && ok=0
fi

echo "KILN_MODEL=${KILN_MODEL:-gpt-oss-120b}"
echo "KILN_API_BASE_URL=${KILN_API_BASE_URL:-https://api.kilnapi.com/v1}"
echo "CONTRACT_ADDRESS=${CONTRACT_ADDRESS:-<unset>}"
echo "See KILN_SETUP.md and docs/AA_SESSION_KEY.md"
[[ $ok -eq 1 ]] && echo "PATH_OK" || { echo "PATH_NEEDS_KILN_KEY"; exit 2; }
