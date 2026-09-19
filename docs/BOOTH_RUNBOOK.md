# Booth Runbook — KillSwitch Wallet

English-only booth checklist for judges. Keep this tab open on the demo laptop.

## Story (one breath)

**Coffee paid → one LLM→Deny boundary → Freeze/Close.**  
Session Key authorizes; the contract Guards; deny is a success; the user can revoke.

## Pre-open / warm session (before judges arrive)

1. **Hard-refresh** the console (`Cmd+Shift+R`) so you are not on a stale UI bundle.
2. Hit **Health** (or `GET /api/health`) — confirm RPC reachable and LLM provider is not stuck in mock.
3. **Grant** a warm session (Policy → Grant) with coffee-lane merchant on the allowlist. Leave the console page open so the Node process and RPC stay warm.
4. Optional warm LLM: one in-limit **Propose** (“Buy coffee…”) so the first judge does not eat cold-start latency.
5. Confirm Sepolia (or Anvil) balances for **owner** and **agent** (see Faucet below). Top up if either is low.

## Latency expectations (Kimi / Moonshot)

| Step | Typical wait | What to say while waiting |
|------|----------------|---------------------------|
| LLM propose | **25–65s** (Kimi) | “Model is proposing under SessionPolicy — Guard has not decided yet.” |
| On-chain tx | 2–15s (Sepolia) | “Submitting to the contract — look for Executed or Denied.” |
| Forced skip boundary | <5s | Fast path only — label it as **no LLM**. |

- Keep the console tab warm; avoid closing the laptop / sleeping the network.
- If the UI looks wrong after a deploy: **hard-refresh**.
- Primary boundary button is **LLM→Deny** (not Forced skip). Judges should see **dual evidence**: LLM proposal / usage **and** on-chain `PaymentDenied`.

## Faucet / Sepolia balance

**Do not commit secrets.** Keys live in local `.env` only (see `.env.example`).

### Check balances

```bash
# From repo root, with RPC_URL and keys loaded from .env
cast balance $OWNER_ADDRESS --rpc-url "$RPC_URL"
cast balance $AGENT_ADDRESS --rpc-url "$RPC_URL"
```

Derive addresses from keys if needed:

```bash
cast wallet address --private-key "$OWNER_PRIVATE_KEY"
cast wallet address --private-key "$AGENT_PRIVATE_KEY"
```

### Known local (Anvil) addresses — demo only

These match the well-known Anvil accounts in `.env.example` (never use on mainnet):

| Role | Address (Anvil default) |
|------|-------------------------|
| Owner (account #0) | `0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266` |
| Agent (account #1) | `0x70997970C51812dc3A010C7d01b50e0d17dc79C8` |

### Sepolia top-up

1. Send a little Sepolia ETH to **owner** (grant / freeze / close) and **agent** (propose).
2. Public faucets vary; use whatever the booth network allows (Alchemy / Google / community faucet).
3. Re-check with `cast balance` until both can cover grant value + a few proposes.

## Demo order (canonical)

1. **Coffee paid** — Grant (if needed) → in-limit Propose / Coffee Lane checkout → `PaymentExecuted` + credential.
2. **One LLM→Deny boundary** — Agent panel → **LLM→Deny Over-budget** (or Off-allowlist). Wait for LLM. Show dual pane: proposal/usage + `PaymentDenied`.
3. **Freeze / Close** — Freeze (HITL revoke) and/or Close + refund remaining budget.

Optional failover buttons: **Forced skip: Over-budget / Off-allowlist** (no LLM) if the model is down — tell judges that path skips the LLM on purpose.

### API triggers

```bash
# Primary — real LLM propose, then Guard deny
curl -sS -X POST "$CONSOLE/api/demo/boundary" \
  -H 'content-type: application/json' \
  -d '{"case":"budget"}'
# Response includes mode: "llm-propose-then-guard"

# Fast forced path (no LLM)
curl -sS -X POST "$CONSOLE/api/demo/boundary" \
  -H 'content-type: application/json' \
  -d '{"case":"budget","skipLlm":true}'
# Response includes mode: "forced-skip-llm"
```

UI: **LLM→Deny Over-budget** / **LLM→Deny Off-allowlist** (primary).  
**Forced skip:** … (secondary).

## Failover if RPC / LLM is slow

| Symptom | Action |
|---------|--------|
| LLM >90s or errors | Retry once; if still bad, use **Forced skip** boundary and say so out loud. Still show on-chain deny. |
| RPC / Sepolia lag | Switch narration to “waiting on public testnet”; keep watching receipts. If stuck, fall back to local Anvil bring-up (`./demos/demo-up.sh`) for the next judge if available. |
| Stale UI | Hard-refresh; re-check `/api/health`. |
| Empty owner/agent ETH | Top up faucet (above); do not invent balances. |
| Auto 60s demo feels long | Prefer manual: Coffee → one LLM→Deny → Freeze. |

## Pass criteria (booth)

- [ ] Can say: Session Key ≠ master key  
- [ ] Shows **Executed** and **Denied** as first-class outcomes  
- [ ] At least one **LLM→Deny** with dual evidence (not only Forced skip)  
- [ ] Freeze or Close demonstrates user sovereignty  

See also: [JUDGE.md](../JUDGE.md), [DEMO_SCRIPT.md](../DEMO_SCRIPT.md).
