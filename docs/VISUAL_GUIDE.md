# KillSwitch Wallet - Visual Guide

## System Overview

```
┌─────────────────────────────────────────────────────────────┐
│                         USER LAYER                          │
│  👤 Human operator with budget, monitors spending, can stop │
└─────────────────────────────────────────────────────────────┘
                              │
                    ┌─────────┴─────────┐
                    │                   │
                    ▼                   ▼
┌──────────────────────────┐  ┌──────────────────────────┐
│    AGENT LAYER           │  │   CONTROL LAYER          │
│  🤖 AI proposes payments │  │  🎛️ Owner operations     │
│  - Read policy           │  │  - Grant session         │
│  - Generate proposal     │  │  - Monitor spending      │
│  - Submit to contract    │  │  - Freeze session        │
│  ⚠️ CANNOT execute!      │  │  - Close & refund        │
└──────────────────────────┘  └──────────────────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ▼
┌─────────────────────────────────────────────────────────────┐
│                    ENFORCEMENT LAYER                        │
│         📜 SessionPolicy Smart Contract (EVM)               │
│                                                             │
│  ✓ Check budget (spent + amount + fee ≤ budget)            │
│  ✓ Check merchant (address in allowlist)                   │
│  ✓ Check deadline (block.timestamp ≤ deadline)             │
│  ✓ Check frozen (!frozen)                                  │
│                                                             │
│  Decision: EXECUTE ✅  or  DENY ❌                          │
└─────────────────────────────────────────────────────────────┘
                      │
         ┌────────────┴────────────┐
         ▼                         ▼
┌──────────────────┐    ┌─────────────────────┐
│  💸 PAYMENT      │    │  📋 EVENT LOG       │
│  Transfer funds  │    │  Immutable record   │
│  to merchant     │    │  - PaymentExecuted  │
└──────────────────┘    │  - PaymentDenied    │
                        │  - SessionFrozen    │
                        └─────────────────────┘
                                  │
                                  ▼
                        ┌─────────────────────┐
                        │  ⛓️ BLOCKCHAIN      │
                        │  Audit trail        │
                        │  Reconstructable    │
                        └─────────────────────┘
```

## Trust Model

```
╔═══════════════════════════════════════════════════════════╗
║                   ZERO TRUST IN AGENT                     ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Agent capabilities:                                      ║
║  ✓ Read policy (public view functions)                   ║
║  ✓ Propose payments (any merchant, any amount)           ║
║  ✓ Query history                                         ║
║                                                           ║
║  Agent CANNOT:                                           ║
║  ✗ Execute payments directly                             ║
║  ✗ Modify policy boundaries                              ║
║  ✗ Forge events                                          ║
║  ✗ Bypass contract checks                                ║
║  ✗ Freeze/close sessions                                 ║
║                                                           ║
╠═══════════════════════════════════════════════════════════╣
║             ENFORCEMENT IN SMART CONTRACT                 ║
╠═══════════════════════════════════════════════════════════╣
║                                                           ║
║  Contract ALWAYS checks:                                  ║
║  1. Merchant in allowlist?                               ║
║  2. Budget sufficient (including fees)?                  ║
║  3. Deadline not expired?                                ║
║  4. Session not frozen?                                  ║
║                                                           ║
║  If ANY check fails → DENY + emit event                  ║
║  All checks pass → EXECUTE + emit event                  ║
║                                                           ║
╚═══════════════════════════════════════════════════════════╝
```

## Payment Flow Sequence

```
User                Agent               Kiln API          Contract          Blockchain
 │                    │                    │                 │                 │
 │ 1. Grant session   │                    │                 │                 │
 ├───────────────────────────────────────────────────────►  │                 │
 │                    │                    │                 │                 │
 │                    │                    │    2. Emit SessionGranted         │
 │                    │                    │                 ├────────────────►│
 │                    │                    │                 │                 │
 │ 3. "Buy coffee"    │                    │                 │                 │
 ├───────────────────►│                    │                 │                 │
 │                    │                    │                 │                 │
 │                    │ 4. Read policy     │                 │                 │
 │                    ├───────────────────────────────────► │                 │
 │                    │◄───────────────────────────────────┤                 │
 │                    │  (budget, allowlist, deadline)      │                 │
 │                    │                    │                 │                 │
 │                    │ 5. Generate proposal                │                 │
 │                    ├───────────────────►│                 │                 │
 │                    │◄───────────────────┤                 │                 │
 │                    │  {merchant, amount, description}    │                 │
 │                    │                    │                 │                 │
 │                    │ 6. proposeOrPay()  │                 │                 │
 │                    ├───────────────────────────────────► │                 │
 │                    │                    │                 │                 │
 │                    │                    │    7. Check budget                │
 │                    │                    │                 ├─┐               │
 │                    │                    │                 │ │ spent + amount│
 │                    │                    │                 │ │ + fee ≤ budget?
 │                    │                    │                 │◄┘               │
 │                    │                    │                 │                 │
 │                    │                    │    8. Check allowlist             │
 │                    │                    │                 ├─┐               │
 │                    │                    │                 │ │ merchant in   │
 │                    │                    │                 │ │ allowlist?    │
 │                    │                    │                 │◄┘               │
 │                    │                    │                 │                 │
 │                    │                    │    9. Check deadline              │
 │                    │                    │                 ├─┐               │
 │                    │                    │                 │ │ now ≤        │
 │                    │                    │                 │ │ deadline?     │
 │                    │                    │                 │◄┘               │
 │                    │                    │                 │                 │
 │                    │                    │   10. Decision  │                 │
 │                    │                    │                 │                 │
 │                    │                    │   ┌─────────────┴─────────────┐   │
 │                    │                    │   │ All checks pass?          │   │
 │                    │                    │   └─────────────┬─────────────┘   │
 │                    │                    │                 │                 │
 │                    │                    │          ┌──────┴──────┐          │
 │                    │                    │          │             │          │
 │                    │                    │         YES           NO          │
 │                    │                    │          │             │          │
 │                    │                    │          ▼             ▼          │
 │                    │                    │   ┌──────────┐  ┌─────────────┐  │
 │                    │                    │   │ Execute  │  │ Emit        │  │
 │                    │                    │   │ payment  │  │ PaymentDenied│ │
 │                    │                    │   └──────────┘  └─────────────┘  │
 │                    │                    │          │             │          │
 │                    │                    │          ▼             │          │
 │                    │                    │   ┌──────────┐         │          │
 │                    │                    │   │ Emit     │         │          │
 │                    │                    │   │ PaymentExecuted    │          │
 │                    │                    │   └──────────┘         │          │
 │                    │                    │          │             │          │
 │                    │                    │          └──────┬──────┘          │
 │                    │                    │                 │                 │
 │                    │                    │    11. Write event                │
 │                    │                    │                 ├────────────────►│
 │                    │                    │                 │                 │
 │                    │ 12. Transaction receipt              │                 │
 │                    │◄───────────────────────────────────┤                 │
 │                    │                    │                 │                 │
 │                    │ 13. Explain outcome│                 │                 │
 │                    ├───────────────────►│                 │                 │
 │                    │◄───────────────────┤                 │                 │
 │                    │  Human explanation  │                 │                 │
 │                    │                    │                 │                 │
 │ 14. Receipt        │                    │                 │                 │
 │◄───────────────────┤                    │                 │                 │
 │  ✅ "Payment successful" OR ❌ "Payment denied: reason"   │                 │
 │                    │                    │                 │                 │
```

## State Machine

```
┌─────────────────────────────────────────────────────────────┐
│                    SESSION LIFECYCLE                        │
└─────────────────────────────────────────────────────────────┘

         ┌──────────┐
         │ NO       │
         │ SESSION  │
         └──────────┘
              │
              │ grantSession(budget, merchants, deadline)
              │
              ▼
         ┌──────────┐
         │ ACTIVE   │◄─────────────┐
         │ SESSION  │              │
         └──────────┘              │
              │                    │
       ┌──────┼──────┬─────────────┤
       │      │      │             │
       │      │      │             │
       ▼      ▼      ▼             │
   Budget  Merchant Deadline       │
   OK?     allowed? not expired?   │
       │      │      │             │
       └──────┴──────┘             │
              │                    │
         All checks?               │
              │                    │
       ┌──────┴──────┐             │
       │             │             │
      YES           NO             │
       │             │             │
       ▼             ▼             │
   Execute        Deny             │
   Payment       (record)          │
       │             │             │
       └─────────────┴─────────────┘
                     │
                     │ owner.freeze()
                     ▼
              ┌──────────┐
              │ FROZEN   │
              │ SESSION  │
              └──────────┘
                     │
                     │ owner.closeSession()
                     ▼
              ┌──────────┐
              │ CLOSED   │
              │ SESSION  │
              └──────────┘
```

## Data Model

```
┌─────────────────────────────────────────────────────────────┐
│                    Session Storage                          │
├─────────────────────────────────────────────────────────────┤
│ struct Session {                                            │
│   address owner              // Who controls this session   │
│   uint256 budget             // Max wei spendable           │
│   uint256 spent              // Already spent (incl. fees)  │
│   uint256 deadline           // Unix timestamp expiry       │
│   address[] merchantAllowlist // Approved recipients        │
│   bool frozen                // Emergency stop flag         │
│   bool active                // Session open/closed         │
│ }                                                           │
└─────────────────────────────────────────────────────────────┘
                              │
                              │
           ┌──────────────────┼──────────────────┐
           │                  │                  │
           ▼                  ▼                  ▼
    ┌──────────┐      ┌──────────┐      ┌──────────┐
    │ Session  │      │ Session  │      │ Session  │
    │    #0    │      │    #1    │      │    #2    │
    ├──────────┤      ├──────────┤      ├──────────┤
    │ Budget:  │      │ Budget:  │      │ Budget:  │
    │  1 ETH   │      │  0.5 ETH │      │  2 ETH   │
    │ Spent:   │      │ Spent:   │      │ Spent:   │
    │  0.1 ETH │      │  0.3 ETH │      │  0 ETH   │
    │ Active:  │      │ Active:  │      │ Active:  │
    │  true    │      │  false   │      │  true    │
    │ Frozen:  │      │ Frozen:  │      │ Frozen:  │
    │  false   │      │  false   │      │  true    │
    └──────────┘      └──────────┘      └──────────┘
```

## Event Timeline

```
Block 1000 ──────────────────────────────────────────────────►
    │
    │ SessionGranted(
    │   sessionId=0,
    │   owner=0xALICE,
    │   budget=1 ETH,
    │   deadline=timestamp+3600,
    │   merchants=[0xBOB, 0xCAROL]
    │ )
    │
Block 1005 ──────────────────────────────────────────────────►
    │
    │ PaymentProposed(
    │   sessionId=0,
    │   merchant=0xBOB,
    │   amount=0.05 ETH,
    │   description="Coffee"
    │ )
    │
    │ PaymentExecuted(
    │   sessionId=0,
    │   merchant=0xBOB,
    │   amount=0.05 ETH,
    │   fee=0.001 ETH,
    │   txHash=0xABC...
    │ )
    │
Block 1010 ──────────────────────────────────────────────────►
    │
    │ PaymentProposed(
    │   sessionId=0,
    │   merchant=0xDAVE,  ← NOT IN ALLOWLIST
    │   amount=0.1 ETH,
    │   description="Unauthorized"
    │ )
    │
    │ PaymentDenied(
    │   sessionId=0,
    │   merchant=0xDAVE,
    │   amount=0.1 ETH,
    │   reason="Merchant not allowed"
    │ )
    │
Block 1015 ──────────────────────────────────────────────────►
    │
    │ SessionFrozen(
    │   sessionId=0,
    │   by=0xALICE
    │ )
    │
Block 1020 ──────────────────────────────────────────────────►
    │
    │ SessionClosed(
    │   sessionId=0
    │ )
    │
    ▼
```

## Security Boundaries

```
┌─────────────────────────────────────────────────────────────┐
│                        ATTACK SURFACE                       │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  Attack: Agent proposes payment above budget                │
│  ────────────────────────────────────────────────────────  │
│  Defense: Contract checks spent + amount + fee ≤ budget     │
│  Outcome: PaymentDenied("Insufficient budget")              │
│                                                             │
│  Attack: Agent proposes to unlisted merchant                │
│  ────────────────────────────────────────────────────────  │
│  Defense: Contract checks merchant in allowlist             │
│  Outcome: PaymentDenied("Merchant not allowed")             │
│                                                             │
│  Attack: Agent waits until after deadline                   │
│  ────────────────────────────────────────────────────────  │
│  Defense: Contract checks block.timestamp ≤ deadline        │
│  Outcome: PaymentDenied("Deadline expired")                 │
│                                                             │
│  Attack: Agent tries to unfreeze session                    │
│  ────────────────────────────────────────────────────────  │
│  Defense: Only owner can call freeze()                      │
│  Outcome: Transaction reverts (onlySessionOwner)            │
│                                                             │
│  Attack: Agent forges payment event                         │
│  ────────────────────────────────────────────────────────  │
│  Defense: Only contract can emit events                     │
│  Outcome: Impossible (blockchain consensus)                 │
│                                                             │
│  Attack: Agent modifies contract code                       │
│  ────────────────────────────────────────────────────────  │
│  Defense: Immutable deployment (no upgrades)                │
│  Outcome: Impossible (requires deploying new contract)      │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

## Kiln NPU Integration

```
┌─────────────────────────────────────────────────────────────┐
│                    KILN NPU PIPELINE                        │
└─────────────────────────────────────────────────────────────┘

Agent                              Kiln API
  │                                   │
  │ 1. Build prompt                   │
  │    - Session policy context       │
  │    - User intent                  │
  │                                   │
  │ 2. POST /chat/completions         │
  ├──────────────────────────────────►│
  │   {                               │
  │     "model": "gpt-oss-120b",      │
  │     "messages": [...],            │
  │     "temperature": 0.7,           │
  │     "max_tokens": 500             │
  │   }                               │
  │                                   │
  │                           ┌───────┴───────┐
  │                           │ NPU Inference  │
  │                           │ ~150ms         │
  │                           └───────┬───────┘
  │                                   │
  │ 3. Response                       │
  │◄──────────────────────────────────┤
  │   {                               │
  │     "choices": [{                 │
  │       "message": {                │
  │         "content": "{            │
  │           \"merchant\": \"0x...\",│
  │           \"amount\": \"0.05\",   │
  │           \"description\": \"...\",│
  │           \"reasoning\": \"...\"  │
  │         }"                        │
  │       }                           │
  │     }],                           │
  │     "usage": {                    │
  │       "prompt_tokens": 450,      │
  │       "completion_tokens": 85,   │
  │       "total_tokens": 535        │
  │     }                             │
  │   }                               │
  │                                   │
  │ 4. Parse JSON                     │
  ├─┐                                 │
  │ │ Extract merchant, amount        │
  │◄┘                                 │
  │                                   │
  │ 5. Submit to contract             │
  │    (proposal NOT executed by LLM) │
  │                                   │
  ▼                                   │
```

## Performance Characteristics

```
┌─────────────────────────────────────────────────────────────┐
│                    LATENCY BREAKDOWN                        │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  User intent → Receipt                                      │
│  ════════════════════════════════════════════════════════  │
│                                                             │
│  ┌──────────────────┐  ~150ms  (Kiln NPU inference)        │
│  │ 1. LLM Proposal  │                                       │
│  └──────────────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐  ~50ms   (read contract state)       │
│  │ 2. Policy Read   │                                       │
│  └──────────────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐  ~100ms  (sign + broadcast)          │
│  │ 3. TX Submission │                                       │
│  └──────────────────┘                                       │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐  ~12s    (block confirmation)        │
│  │ 4. Confirmation  │          (can be faster with fast    │
│  └──────────────────┘           confirmations)             │
│           │                                                 │
│           ▼                                                 │
│  ┌──────────────────┐  ~150ms  (Kiln NPU inference)        │
│  │ 5. Explanation   │                                       │
│  └──────────────────┘                                       │
│                                                             │
│  Total: ~2s (with fast confirmation)                        │
│         ~13s (with standard block time)                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

**See also**:
- [ARCHITECTURE.md](../ARCHITECTURE.md) - Technical deep dive
- [QUICKSTART.md](../QUICKSTART.md) - Setup guide
- [README.md](../README.md) - Project overview
