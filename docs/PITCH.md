# KillSwitch — 90-second judge pitch (Arbitrum Open House)

**Problem:** An LLM that can pay will overspend or pay the wrong merchant. Prompts are not a control plane.

**Solution:** Session Key on Arbitrum — budget, allowlist, deadline. Agent proposes; `SessionPolicy` guards. `PaymentDenied` is success. User Freeze / Close+refund.

**Proof (Arbitrum Sepolia):**
- Contract: https://sepolia.arbiscan.io/address/0x5A035E67d5b5A895e71e14B6C9201952C81350df
- Executed: https://sepolia.arbiscan.io/tx/0xb77a6145d27ba39875f24ddc4a6e1192cae8583a4e824ed6b7ae404df9dc629a
- Denied (budget): https://sepolia.arbiscan.io/tx/0x99deb3f987d68d178310228a45510bddc43d64bd6296a3f46ea6cc61332126ac
- Denied (merchant): https://sepolia.arbiscan.io/tx/0x9d33cfb55b08d9ce6fcf4dd4cf7f71105d13726a679b232a9c9ec4771188c88c

**Why Arbitrum:** Cheap session micropayments; same EVM SessionPolicy maps to ERC-4337 / ZeroDev Smart Sessions later.

**Ask / next:** USDG or USDC settlement; optional Robinhood Chain deploy (reserved prize pool).
