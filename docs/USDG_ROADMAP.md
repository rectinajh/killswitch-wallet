# USDG / ERC-20 settlement (live)

Arbitrum Open House judging gives **extra consideration** to projects integrating **Paxos USDG**. KillSwitch now settles **ERC-20** (Mock USDG on Arb Sepolia today; Circle USDC or Paxos USDG when available) with the same Guard semantics as ETH.

## Live on Arbitrum Sepolia

| | |
|--|--|
| SessionPolicy (ERC-20 capable) | [`0x9Cbe0de60e325347bfCE7517410B8728eA78b3cA`](https://sepolia.arbiscan.io/address/0x9Cbe0de60e325347bfCE7517410B8728eA78b3cA) |
| MockUSDG (6 decimals) | [`0x07215B977D8636A273b0Cb3eCc5915329A3534f0`](https://sepolia.arbiscan.io/address/0x07215B977D8636A273b0Cb3eCc5915329A3534f0) |
| Deploy block (approx) | `315248101` |
| Grant (session 1, 2 USDG) | [`0x7b60…43bf`](https://sepolia.arbiscan.io/tx/0x7b608ce14236c8281050ea7826cad2ca180bc752729460d39a8fb4bc9f5143bf) |
| PaymentExecuted (0.5 USDG coffee) | [`0x8e65…01bb`](https://sepolia.arbiscan.io/tx/0x8e65896892a13db06ca148a88161ce3810c13bb719035d29d5edd91b340b01bb) |
| PaymentDenied (Shadow Shop) | [`0x8b0c…098c`](https://sepolia.arbiscan.io/tx/0x8b0c1eb81c6a7d20b4bb875741b156842c624b2c17cdd8913bde597fdb14098c) |

Native-ETH SessionPolicy remains at `0x5A035E67…50df` for the earlier qualification demos.

## Guard rules (unchanged)

- allowlist merchant  
- budget ≥ amount + 2% fee  
- deadline / freeze  
- `PaymentDenied` recorded (no merchant settlement)

## How it works

1. `grantSessionToken(token, budget, …)` — owner `approve`s then escrows ERC-20 into the Guard.  
2. `proposeOrPay` — agent proposes; Guard `transfer`s token to merchant on execute.  
3. `closeSession` — refunds leftover token (unused budget + accrued fees) to owner.  
4. Console / credentials include `token`, `tokenAddress`, `decimals`.  
5. Env:

```bash
PAYMENT_TOKEN=USDG
USDG_TOKEN_ADDRESS=0x07215B977D8636A273b0Cb3eCc5915329A3534f0
# Or Circle USDC stand-in:
# PAYMENT_TOKEN=USDC
# USDC_TOKEN_ADDRESS=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

## Circle USDC on Arbitrum Sepolia

`0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d`  
Faucet: https://faucet.circle.com/

Set `PAYMENT_TOKEN=USDC` (and optionally `USDC_TOKEN_ADDRESS`) to grant/settle in Circle USDC instead of MockUSDG.

## Local / Anvil

`forge test` covers ERC-20 via `MockUSDG` (`contracts/test/SessionPolicy.erc20.t.sol`).  
`grantSession` (ETH) still works when `PAYMENT_TOKEN` is unset / `ETH`.

## References

- HackQuest Resources / Paxos USDG notes on the Buildathon page  
- Circle USDC faucet (Arb Sepolia): https://faucet.circle.com/  
