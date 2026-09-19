# KillSwitch Wallet

[![CI](https://github.com/rectinajh/killswitch-wallet/workflows/CI/badge.svg)](https://github.com/rectinajh/killswitch-wallet/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Solidity](https://img.shields.io/badge/Solidity-0.8.24-blue.svg)](https://soliditylang.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)

**Furiosa Challenge B (GWDC 2026 Korea)** — AI Agent spending controls & records (cypherpunk)

## Declared Function

**KillSwitch Wallet lets a user delegate a time-bounded, merchant-whitelisted budget to an AI agent, enforces that boundary in code/on-chain (not by trusting the model), and leaves an auditable trail so anyone can reconstruct whether a payment was authorized.**

### User Need
Intended for users who want an LLM agent to buy/pay on their behalf without unbounded spending risk.

**Problem**: Traditional payment rails record *who paid whom*, but not *who authorized it* or *under what conditions*.

**Solution**: A session-capability system where the agent proposes payments, but enforcement happens in smart contracts and on-chain records — never by trusting the model.

## Cypherpunk Design Principles

1. **Agent proposes; policy contract disposes** — Stopping/deny is a correct recorded outcome
2. **Least privilege** — Session capability with budget, merchant allowlist, deadline
3. **Don't trust the model** — Enforce boundaries in code + on-chain, not in prompts
4. **Evidence** — Another person with only your records can reconstruct authorization

## Architecture

```mermaid
graph TB
    User[User] -->|1. Grant Session| Contract[SessionPolicy Contract]
    Contract -->|Budget, Allowlist, Deadline| Session[Active Session]
    
    Agent[AI Agent<br/>Kiln gpt-oss-120b] -->|2. Propose Payment| Session
    Session -->|3. Check Policy| Contract
    
    Contract -->|✓ Allowed| Payment[Execute Payment]
    Contract -->|✗ Denied| Deny[Record Denial]
    
    Payment -->|Emit Event| Blockchain[On-Chain Receipt]
    Deny -->|Emit Event| Blockchain
    
    User -->|Monitor/Freeze| Contract
    Blockchain -->|Audit Trail| Evidence[Reconstructable Evidence]
```

## What the Agent Does vs What Code Enforces

| Capability | Agent (Kiln gpt-oss-120b) | Smart Contract / Code |
|------------|---------------------------|----------------------|
| **Read Policy** | ✓ Can query current budget/allowlist | N/A |
| **Propose Payment** | ✓ Suggests merchant & amount | ✗ Cannot execute directly |
| **Check Allowlist** | ✗ Advisory only, not enforced | ✓ **Enforced on-chain** |
| **Check Budget** | ✗ Advisory only, not enforced | ✓ **Enforced on-chain** |
| **Check Deadline** | ✗ Advisory only, not enforced | ✓ **Enforced on-chain** |
| **Record Outcome** | ✗ Cannot forge | ✓ **Immutable event logs** |
| **Emergency Stop** | ✗ Cannot override | ✓ **Owner freeze()** |

## Project Structure

```
killswitch-wallet/
├── contracts/           # Foundry smart contracts
│   ├── src/
│   │   ├── SessionPolicy.sol       # Core policy enforcement
│   │   └── KillSwitchVault.sol     # Payment execution
│   ├── test/
│   └── script/          # Deployment scripts
├── agent/               # TypeScript AI agent
│   ├── src/
│   │   ├── kiln-client.ts          # Kiln API integration
│   │   ├── policy-reader.ts        # On-chain policy queries
│   │   └── payment-proposer.ts     # Agent payment logic
│   └── package.json
├── demos/               # Demonstration scripts
│   ├── 01-success-payment.sh
│   ├── 02-budget-exceeded.sh
│   └── 03-merchant-denied.sh
└── README.md
```

## Setup Instructions

### Prerequisites

- **Node.js** 18+ and pnpm
- **Foundry** (forge, anvil, cast)
- **Kiln API Key** (for gpt-oss-120b model)

### 1. Install Dependencies

```bash
# Install Foundry (if not already installed)
curl -L https://foundry.paradigm.xyz | bash
foundryup

# Install Node dependencies
cd agent
pnpm install
```

### 2. Configure Environment

```bash
# Copy environment template
cp .env.example .env

# Edit .env and add your Kiln API key
# KILN_API_KEY=your_key_here
# KILN_API_BASE_URL=https://api.kilnapi.com/v1  # or actual endpoint
```

### 3. Start Local Blockchain

```bash
# Terminal 1: Start Anvil local testnet
anvil
```

### 4. Deploy Contracts

```bash
# Terminal 2: Deploy to local testnet
cd contracts
forge build
forge script script/Deploy.s.sol --rpc-url http://127.0.0.1:8545 --broadcast
```

### 5. Run Demonstrations

```bash
# Terminal 2: Run demo scenarios
cd demos

# Success case: payment within budget and allowlist
./01-success-payment.sh

# Boundary case: budget exceeded
./02-budget-exceeded.sh

# Boundary case: merchant not on allowlist
./03-merchant-denied.sh
```

## Acceptance Criteria Demonstrated

### 1. ✓ Declared Function
README clearly states what the agent does vs what code enforces (see table above).

### 2. ✓ Boundaries & Stopping
Two forced out-of-scope denial scenarios:
- **Budget Exceeded**: `02-budget-exceeded.sh` — Agent proposes $150 payment, but budget is $100 (after fees). Contract denies and emits `PaymentDenied(reason: "Insufficient budget")`.
- **Merchant Not Allowlisted**: `03-merchant-denied.sh` — Agent proposes payment to `0xBAD...`, but only `[0xMERCHANT1, 0xMERCHANT2]` are allowed. Contract denies and emits `PaymentDenied(reason: "Merchant not allowed")`.
- **Deadline Expired**: (Optional) Contract checks `block.timestamp > deadline`.

### 3. ✓ Kiln API Integration
- Agent uses `gpt-oss-120b` model via Kiln API
- Token usage reported per flow:
  - `proposePayment()`: ~500 tokens (merchant reasoning)
  - `explainReceipt()`: ~300 tokens (transaction summary)
- Efficiency: Model only generates proposal; enforcement is O(1) contract logic
- Mock client provided if no API key (logs requests, returns synthetic responses)

### 4. ✓ Blockchain On-Chain Transaction
- Every demo run produces at least one on-chain transaction:
  - `grantSession()`: Creates session with policy parameters
  - `proposeOrPay()`: Emits `PaymentExecuted` or `PaymentDenied`
- Scripts print transaction hash with matching log entries:
  ```
  ✓ Session created: 0x1234...
  ✓ Payment proposed: 0x5678...
    → Event: PaymentDenied(sessionId=1, reason="Budget exceeded")
  ```

### 5. ✓ Approval & Evidence
- **Human grants budget**: `grantSession()` signed by owner
- **Watch spend**: Query `spent` and `remaining` from contract
- **Emergency stop**: Owner can call `freeze()` to halt session
- **Receipt**: On-chain events provide complete audit trail
- **Reconstructability**: Anyone with contract address + RPC can rebuild full history:
  ```bash
  cast logs --address $CONTRACT --from-block 0 | jq
  ```

## NPU Efficiency Assumptions

Kiln API `gpt-oss-120b` runs on NPU hardware, optimized for:
- **Latency**: ~100-200ms inference (vs 500ms+ CPU)
- **Throughput**: 50+ requests/sec per NPU instance
- **Cost**: ~10x cheaper than cloud GPU for this model size

Agent design minimizes model calls:
- Policy checks: pure on-chain reads (no LLM)
- Payment proposal: single LLM call per user intent
- No retry loops or self-correction via LLM

## Development Roadmap (Post-Hackathon)

- [ ] Multi-session support (parallel budgets)
- [ ] Fiat on/off-ramp integration (Stripe → USDC)
- [ ] ZK proofs for private merchant allowlists
- [ ] Cross-chain settlement (L2 optimistic rollups)
- [ ] Agent reputation/slashing for malicious proposals

## License

MIT

## Challenge Submission

**Furiosa Challenge B — GWDC 2026 Korea**  
Team: [Your Team Name]  
Demo Video: [Link to recorded demo]

---

**Built with**: Foundry, TypeScript, Kiln NPU API, EVM (Anvil/Sepolia)


## Local verification (Mac, 2026-09-20)

Verified on Anvil without cloud agents:

- `forge test`: **7/7 passed** (after renaming error `SessionIsFrozen` to avoid clashing with event `SessionFrozen`)
- `./demos/setup.sh` requires Foundry **`--broadcast`** on `forge create`
- Demos:
  - `01-success-payment.sh` → `PaymentExecuted`, spent `5.1e16` wei for 0.05 ETH + 2% fee
  - `02-budget-exceeded.sh` → `PaymentDenied` reason `Insufficient budget`, spent `0`
  - `03-merchant-denied.sh` → `PaymentDenied` reason `Merchant not allowed`, spent `0`
  - `04-freeze-session.sh` → `proposeOrPay` reverts with `SessionIsFrozen`
- Agent mock mode works (`KILN_API_KEY` unset/placeholder): proposes then submits on-chain tx

Quick path:

```bash
anvil --host 127.0.0.1 --port 8545 --block-time 1
cp -n .env.example .env   # quote USER_INTENT
./demos/setup.sh
./demos/01-success-payment.sh
./demos/02-budget-exceeded.sh
./demos/03-merchant-denied.sh
./demos/04-freeze-session.sh
```
