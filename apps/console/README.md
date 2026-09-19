# KillSwitch Console

Cyber/ops console for Agentic Commerce: grant budget, agent checkout, force boundary denies, freeze, and watch on-chain receipts.

## Run

```bash
# One-click (anvil + setup + console):
./demos/demo-up.sh

# Or manually after setup:
node apps/console/server.mjs
# http://127.0.0.1:8787
```

## Panels

- **Policy** — budget/spent/remaining bar, deadline countdown, merchant chips, frozen/active
- **Agent** — intent + Propose; **LLM→Deny** Over-budget / Off-allowlist (primary); Forced skip (secondary)
- **Chain** — receipt cards with fee (amount + 2%), reason, tx hash; Watch poll

## Fee model

Budget check uses **amount + 2% fee** (`(amount * 2) / 100` in `SessionPolicy.sol`). Console and agent `feeWei()` display the same numbers.

## APIs

| Method | Path | Notes |
|--------|------|-------|
| GET | `/api/health` | RPC + contract + LLM status |
| GET | `/api/policy?sessionId=` | Policy + remaining % |
| GET | `/api/sessions` | Recent session ids |
| GET | `/api/events?sessionId=` | proposed/executed/denied + fee |
| POST | `/api/grant` | Grant session |
| POST | `/api/freeze` | Kill switch |
| POST | `/api/propose` | Optional `forceAmountEth`, `forceMerchant`, `allowOffAllowlist` |
| POST | `/api/demo/boundary` | `{ case: "budget" \| "merchant", skipLlm?: boolean }` — default **LLM→Guard deny**; `skipLlm:true` = forced fast path |

Uses `.env` (`RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS`). Optional Kiln `gpt-oss-120b` (`LLM_PROVIDER=kiln`); local demos often use `LLM_PROVIDER=kimi`.
