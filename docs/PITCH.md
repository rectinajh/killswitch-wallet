# KillSwitch — 90-second judge pitch (Arbitrum Open House)

**Problem:** An LLM that can pay will overspend or pay the wrong merchant. Prompts are not a control plane.

**Solution:** Session Key on Arbitrum — budget, allowlist, deadline. Agent proposes; `SessionPolicy` guards. `PaymentDenied` is success. User Freeze / Close+refund. Settlement in **native ETH or ERC-20 (USDG / USDC)**.

**Proof (Arbitrum Sepolia — USDG):**
- SessionPolicy: https://sepolia.arbiscan.io/address/0x9Cbe0de60e325347bfCE7517410B8728eA78b3cA
- MockUSDG: https://sepolia.arbiscan.io/address/0x07215B977D8636A273b0Cb3eCc5915329A3534f0
- Executed (0.5 USDG): https://sepolia.arbiscan.io/tx/0x8e65896892a13db06ca148a88161ce3810c13bb719035d29d5edd91b340b01bb
- Denied (merchant): https://sepolia.arbiscan.io/tx/0x8b0c1eb81c6a7d20b4bb875741b156842c624b2c17cdd8913bde597fdb14098c

**Why Arbitrum:** Cheap session micropayments; same EVM SessionPolicy maps to ERC-4337 / ZeroDev Smart Sessions later.

**Ask / next:** Swap MockUSDG for Paxos USDG or Circle USDC on mainnet; optional Robinhood Chain dual-deploy (reserved prize pool).
