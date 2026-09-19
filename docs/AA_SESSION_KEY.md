# From SessionPolicy → ERC-4337 Session Key

KillSwitch’s Furiosa demo proves the **capability rules** on a simple escrow contract.
This document is the **production evolution** aligned with AI × Web3 Handbook
(Account Abstraction · Agent Wallet · Session Key).

## What stays identical

| Rule | Demo (`SessionPolicy`) | AA Smart Session |
|------|------------------------|------------------|
| Budget (+ fee) | `amount + 2%` vs remaining | Spending limit module |
| Merchant allowlist | `isMerchantAllowed` | Target / selector allowlist |
| Deadline | `block.timestamp > deadline` | ValidUntil / validAfter |
| Freeze | `freeze()` by owner | Revoke session key |
| Close / refund | `closeSession()` | Disable module + withdraw |
| Deny = success | `PaymentDenied` event | UserOp validation fail + audit log |

**Session Key ≠ master key** in both worlds: the agent never holds the owner EOA/Smart Account root key.

## Mapping

```
User Smart Account (ERC-4337)
  └─ Session Key / Validator module
       ├─ permissions: merchants[], maxSpend, validUntil
       ├─ Agent UserOp → EntryPoint → validateUserOp()
       └─ on violation: validation fails (Guard) — same story as PaymentDenied
```

Demo today compresses “validate + execute + escrow” into `SessionPolicy.proposeOrPay`.
AA splits validation (session module) from execution (account), but the **judge story is unchanged**.

## Why we ship the demo this way

1. Anvil + Foundry + one contract = reproducible 90s path (`JUDGE.md`)
2. Real LLM propose path already hits on-chain Guard
3. AA wiring needs EntryPoint, paymaster, and a Smart Account factory — orthogonal to proving spend control

## Next engineering milestones (post-hackathon)

1. Implement `ISessionCapability` as a Kernel / Safe / Rhinestone session module
2. Agent submits UserOps instead of EOA `proposeOrPay`
3. Index `UserOperationEvent` + custom deny logs into the same console receipts UI
4. Optional paymaster for gas abstraction (Machine Payment UX)

## Console

Bridge Lab → **Production** tab shows Kiln official LLM path readiness and this AA roadmap checklist.
