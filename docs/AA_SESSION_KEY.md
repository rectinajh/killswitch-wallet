# From SessionPolicy → ERC-4337 Session Key

KillSwitch proves the **capability rules** on a simple escrow-style `SessionPolicy` contract
(deployable on **Arbitrum** today — see [`ARBITRUM_BUILDATHON.md`](ARBITRUM_BUILDATHON.md)).
This document is the **production evolution** toward Account Abstraction / Smart Sessions
(e.g. ZeroDev on Arbitrum — see HackQuest resources).

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

## Next engineering milestones

1. Wrap `ISessionCapability` as a [ZeroDev](https://docs.zerodev.app/) / Kernel session validator on **Arbitrum Sepolia** (HackQuest resource: Get started with ZeroDev).
2. Agent submits UserOps instead of EOA `proposeOrPay`; EntryPoint validation is the Guard.
3. Index `UserOperationEvent` + deny logs into the same console receipts UI.
4. Optional paymaster for gas abstraction.

Judge story today is unchanged: Session Key ≠ master key; deny is success.
