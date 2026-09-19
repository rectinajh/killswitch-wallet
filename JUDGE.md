# KillSwitch Wallet — Judge Path (≈90 seconds)

**Furiosa Challenge B / GWDC 2026 Korea** · Agent spending controls  
**Handbook track:** [AI × Web3 — Wallet / Permission · Agent Wallet](https://aiweb3.school/zh/handbook/)

## Scenario (Agentic Commerce)

You authorize an agent to pay **whitelisted merchants** within a **time-bounded budget** (e.g. coffee / API bills while you are in a meeting). The agent proposes; the contract guards; deny is success; you can Freeze or Close+refund.

## One-liner

User grants a **Session Key** (`SessionPolicy`: budget + merchant allowlist + deadline).  
The **Agent proposes**; the **contract Guards**; **`PaymentDenied` is a successful security outcome**.  
User can **Freeze** (HITL revoke) at any time. Do not trust the model.

## Bring-up (local)

```bash
./demos/demo-up.sh
# Console: http://127.0.0.1:8787
# Or: anvil → ./demos/setup.sh → node apps/console/server.mjs
```

Open **http://127.0.0.1:8787/** (hard-refresh if UI looks stale).

Optional CLI suite (no browser):

```bash
./demos/run-all.sh
RUN_AGENT_BOUNDARY=1 ./demos/run-all.sh   # includes LLM→contract deny paths
# or: node demos/agent-boundary.mjs all
```

## 90-second click path (Handbook four-contrast)

| # | Action | Where | What you should see |
|---|--------|--------|---------------------|
| 1 | **Grant Session Key** | Policy → Grant session | New `sessionId`; budget / allowlist / deadline active |
| 2 | **In-limit Propose** | Agent → intent e.g. coffee 0.03 ETH → **Propose** | Dual pane: LLM proposal + **PaymentExecuted**; Chain receipt |
| 3a | **Guard: over-budget** | Agent → **Over-budget** | **PaymentDenied** (Insufficient budget) — **deny = success** |
| 3b | **Guard: off-allowlist** | Agent → **Off-allowlist** | **PaymentDenied** (Merchant not allowed) — **deny = success** |
| 4 | **HITL revoke** | Policy → **Freeze (Kill)** | Session frozen; Agent cannot spend further |
| 4b | **Close / refund** (optional) | Policy → **Close / 退款** | Session closed; remaining budget refunded to owner |

Narrative strip on the console maps: **Session Key · Policy · Guard · HITL**.

## What code enforces (not the LLM)

- Budget check uses **`amount + 2% fee`**
- Merchant allowlist, deadline, frozen flag
- Immutable events: `PaymentProposed` / `PaymentExecuted` / `PaymentDenied`

## LLM note

- **Furiosa official path:** Kiln `gpt-oss-120b` (`LLM_PROVIDER=kiln`)
- **Local build/demo:** may use Kimi (`LLM_PROVIDER=kimi`) — same propose→guard flow
- Never commit `.env` / API keys

## Repo map

| Path | Role |
|------|------|
| `contracts/src/SessionPolicy.sol` | On-chain policy / Guard |
| `agent/` | Propose via LLM; submit to contract |
| `apps/console/` | Judge UI + dual evidence (LLM vs chain) |
| `demos/agent-boundary.mjs` | Automated over-budget + off-allowlist |
| `README.md` | Handbook alignment table |

## Bridge Lab (on console)

Open the **Bridge Lab** tabs under the scenario strip:

| Tab | Prove in ≤15s |
|-----|----------------|
| Chain-aware Context | Refresh — only session policy in LLM prompt |
| Web3 Tool Use | Permission matrix (Freeze/Close = owner only) |
| Agent Workflow | Auto / Guard / HITL zones light during 60s demo |
| Machine Payment | Budget / spent / whitelist shops + timeline |
| Verifiable AI | Dual pane + match label after Propose/Deny |
| AI Security | Deny scoreboard (`PaymentDenied` reasons) |
| AI Sovereignty | Freeze vs Close table + live session state |
| AI Privacy | Include/exclude chips + same context preview |
| Production | Kiln official-path flags + AA Session Key rule map |

## Pass criteria for judges

1. Can explain Session Key ≠ master key in one sentence  
2. Sees **Executed** and **Denied** as first-class outcomes  
3. Sees user **Freeze** as revoke  
4. Can point to on-chain events / receipts without trusting the model  
