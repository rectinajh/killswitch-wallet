> **录屏分镜：** 见 [`DEMO_SCRIPT.md`](DEMO_SCRIPT.md)（Agentic Commerce 90 秒）。  
> **理念详解：** [`docs/AGENTIC_COMMERCE.md`](docs/AGENTIC_COMMERCE.md)

# KillSwitch Wallet — Judge Path (≈90 seconds)

**Core idea:** **Agentic Commerce（智能体商业）** — agent discovers, quotes, and pays under a Session Key; contract Guards; user keeps Freeze/Close.  
**Handbook (optional vocabulary):** [AI × Web3 — Wallet / Permission · Agent Wallet](https://aiweb3.school/zh/handbook/)

## Why Agentic Commerce

A **concrete loop** lands clearer than a generic “agent wallet”:

| Lens | What KillSwitch shows |
|------------|------------------------|
| Problem clarity | Meeting / offline → agent should pay coffee or API bills, not the whole vault |
| Mechanism | Session Key = budget + allowlist + deadline (not master key) |
| Security outcome | `PaymentDenied` is success; dual evidence LLM vs chain |
| Sovereignty | Freeze / Close+refund — human override |
| Verifiability | `CommercePaymentCredential` + on-chain events |

Session Key / Policy / Guard are the **mechanism**; Agentic Commerce is the **story you demo**.

## Scenario (one breath)

You authorize an agent to pay **whitelisted merchants** within a **time-bounded budget**. Agent **proposes / checkouts**; contract **Guards**; deny is success; you can **Freeze** or **Close+refund**.

## One-liner

**Agentic Commerce under SessionPolicy:** discover → quote → checkout → Guard (`Executed` \| `Denied`) → credential / Freeze / Close.  
Do not trust the model.

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

## Agentic Commerce path (recommended story)

1. Grant session (budget + allowlist includes Coffee Lane / API merchant)
2. In **情景** funnel: pick **Coffee Lane** → see quote → **Checkout 代付**
3. Read **CommercePaymentCredential** (status `paid` + tx) — merchant-verifiable
4. Click **付给 Shadow Shop** → `denied` credential (Guard success)
5. Freeze or Close/退款

## 90-second click path (Handbook four-contrast)

| # | Action | Where | What you should see |
|---|--------|--------|---------------------|
| 1 | **Grant Session Key** | Policy → Grant session | New `sessionId`; budget / allowlist / deadline active |
| 2 | **In-limit Checkout** | 情景 → Coffee Lane → **Checkout 代付** | Dual pane: LLM proposal + **PaymentExecuted**; paid credential |
| 3a | **Guard: over-budget** | Agent → **Over-budget** | **PaymentDenied** (Insufficient budget) — **deny = success** |
| 3b | **Guard: off-allowlist** | 情景 → **Shadow Shop** / Agent → **Off-allowlist** | **PaymentDenied** (Merchant not allowed) — **deny = success** |
| 4 | **HITL revoke** | Policy → **Freeze (Kill)** | Session frozen; Agent cannot spend further |
| 4b | **Close / refund** (optional) | Policy → **Close / 退款** | Session closed; remaining budget refunded to owner |

Narrative strip on the console maps: **Session Key · Policy · Guard · HITL** inside the Agentic Commerce scene.

## What code enforces (not the LLM)

- Budget check uses **`amount + 2% fee`**
- Merchant allowlist, deadline, frozen flag
- Immutable events: `PaymentProposed` / `PaymentExecuted` / `PaymentDenied`
- Checkout receipt: **`CommercePaymentCredential`**

## LLM note

**If you do not have a Furiosa Kiln / NPU kit key yet:** run with `LLM_PROVIDER=kimi` and a real `KIMI_API_KEY` so propose + explainReceipt still return live prompt/completion token splits (not mock). Switch to `LLM_PROVIDER=kiln` + `KILN_MODEL=gpt-oss-120b` as soon as the organizer key or onsite developer kit is available.


- **Kiln path (default):** `gpt-oss-120b` (`LLM_PROVIDER=kiln`)
- **Local build/demo:** may use Kimi (`LLM_PROVIDER=kimi`) — same propose→guard flow
- Never commit `.env` / API keys

## Repo map

| Path | Role |
|------|------|
| `docs/AGENTIC_COMMERCE.md` | Core Agentic Commerce thesis |
| `contracts/src/SessionPolicy.sol` | On-chain policy / Guard |
| `agent/` | Propose via LLM; submit to contract |
| `apps/console/` | Judge UI + commerce funnel + dual evidence |
| `demos/agent-boundary.mjs` | Automated over-budget + off-allowlist |
| `README.md` | Handbook alignment table |

## Bridge Lab (on console)

Open the **Bridge Lab** tabs under the scenario strip:

| Tab | Prove in ≤15s |
|-----|----------------|
| Chain-aware Context | Cards: remaining / budget / deadline / allowlist (raw prompt optional) |
| Web3 Tool Use | Permission matrix (Freeze/Close = owner only) |
| Agent Workflow | Auto / Guard / HITL zones light during 60s demo |
| Machine Payment | Budget / spent / whitelist shops + timeline |
| Verifiable AI | Dual pane + match label after Propose/Deny |
| AI Security | Deny scoreboard (`PaymentDenied` reasons) |
| AI Sovereignty | Freeze vs Close table + live session state |
| AI Privacy | Include/exclude chips + same context preview |
| Production | Kiln official-path flags + AA Session Key rule map |

## Pass criteria (demo readiness)

1. Can restate **Agentic Commerce loop** in one sentence (discover → pay under session → Guard)  
2. Can explain Session Key ≠ master key  
3. Sees **Executed** and **Denied** as first-class outcomes  
4. Sees user **Freeze / Close** as sovereignty  
5. Can point to credential / on-chain events without trusting the model

---

## Official LLM path · tokens · energy (no fabricated joules)

| Item | Value |
|------|--------|
| Provider | **Kiln** (`LLM_PROVIDER=kiln`) |
| Model | **gpt-oss-120b** |
| Role | Short JSON propose + receipt explain |
| Policy | **Not in the model** — `SessionPolicy.sol` Guards |

### Capturing real prompt / completion split

API JSON (`POST /api/propose`, `/api/commerce/checkout`, `/api/demo/boundary`, `/api/demo/success`) returns:

```json
"usage": {
  "propose": { "promptTokens": N, "completionTokens": M, "totalTokens": N+M },
  "explain": { "promptTokens": …, "completionTokens": …, "totalTokens": … }
}
```

Also logged as `[KilnClient] API usage for …`. Mock mode labels `mock: true` with zero tokens — do not treat as real NPU usage.

Prompts: short JSON; `reasoning_effort=low` when API accepts (retry without on 400).

### Energy

**No fabricated joules.** If no meter / kit measurement:

> Energy: UNKNOWN — report tokens only.  
> NPU board power draw assumed X W **only if from kit docs**; else UNKNOWN.

Unverifiable “Nx cheaper than GPU” claims are not evidence — use measured tokens + stated kit assumptions.

### Keys

| Role | Env | Signs |
|------|-----|--------|
| Owner | `OWNER_PRIVATE_KEY` | grant / freeze / close |
| Agent | `AGENT_PRIVATE_KEY` (alias `PRIVATE_KEY`) | proposeOrPay |

On-chain `receiptId` ≠ chain tx hash. `CommercePaymentCredential.transactionHash` is the ethers tx hash only.
