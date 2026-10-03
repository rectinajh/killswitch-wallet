# USDG / ERC-20 settlement roadmap (P1+)

Arbitrum Open House judging gives **extra consideration** to projects integrating **Paxos USDG**. KillSwitch qualifies today with **native ETH** on Arbitrum Sepolia; this doc is the planned upgrade path — not a blocker for submission.

## Goal

Session budget, spent, fees, and merchant payout denominated in **USDG** (or USDC as interim), with the same Guard semantics:

- allowlist merchant  
- budget ≥ amount + fee  
- deadline / freeze  
- `PaymentDenied` recorded  

## Design sketch

1. `grantSession` takes `token` + `budget` and pulls tokens via `transferFrom` (or owner pre-funds the contract).  
2. `proposeOrPay` uses `IERC20.transfer` instead of `call{value:}`.  
3. `closeSession` refunds remaining token balance to owner.  
4. Console catalog quotes in USDG; credential adds `token` + `decimals`.  
5. Env: `USDG_TOKEN_ADDRESS`, `PAYMENT_TOKEN=usdg`.  

## Env placeholders (already in `.env.example`)

```bash
# USDG_TOKEN_ADDRESS=
# PAYMENT_TOKEN=native|usdg
```

## Interim demo (no contract change)

Narrate “stablecoin settlement next” and keep ETH micropayments on Arb Sepolia for the video. Prefer shipping verified on-chain denies over an unfinished ERC-20 branch before the deadline.

## References

- HackQuest Resources / Paxos USDG notes on the Buildathon page  
- Circle USDC faucet (Arb Sepolia) if using USDC as a stand-in: https://faucet.circle.com/  
