# Agentic Commerce — KillSwitch core thesis

> This is the **product idea**, not a side demo. Session Key / Policy / Guard are how we implement it.

Handbook **智能体商业 (Agentic Commerce)** = an Agent **discovers** a service, **agrees a quote**, **pays under policy**, and leaves a **verifiable credential** — while the user keeps a kill switch.

## One sentence

**KillSwitch Wallet makes Agentic Commerce safe enough to ship:** the model may checkout; the contract decides; denial is recorded success; the user can Freeze or Close+refund.

## Why this framing

| Generic agent-wallet pitch | Agentic Commerce pitch |
|----------------------------------|---------|
| “We built a session policy contract” | “Agent buys coffee / pays an API bill under a grant; Shadow Shop is denied with proof” |
| Abstract Session Key talk | Concrete catalog → checkout → credential |
| Deny looks like failure | Deny = Guard success in a commerce abuse case |
| Hard to remember after 90s | Story sticks: whitelist shop vs shadow shop |

Wallet / Session Key / Guard are the **mechanism**; Agentic Commerce is the **product scene**.

## Loop (what judges should see)

```
Discover (catalog / allowlist shop)
   → Quote (sku + amountEth)
   → Authorize Session Key (budget · merchants · deadline)   [human]
   → Agent Propose / Checkout                                [auto]
   → Guard: Executed | Denied                                [contract]
   → CommercePaymentCredential (tx-backed receipt)           [evidence]
   → Freeze or Close+refund                                  [human]
```

## Layers (deeper than “AI paid once”)

| Layer | KillSwitch demo |
|-------|-----------------|
| Discovery | `/api/commerce/catalog` named merchants (coffee / API billing) |
| Negotiation | Fixed quote per SKU (demo-simple; production = RFQ) |
| Payment | Session-bound propose; fee-aware budget (`amount + 2%`) |
| Settlement proof | `CommercePaymentCredential` from `PaymentExecuted` |
| Dispute / abuse | Off-catalog / Shadow Shop → `PaymentDenied` |
| Exit | Freeze / Close refund |

## Console proof points

- **情景** funnel: Coffee Lane checkout → paid credential; Shadow Shop → denied  
- Dual pane: LLM proposal vs chain events  
- Bridge Lab: Context cards, Security scoreboard, Sovereignty Freeze vs Close  
- Auto **60s demo** for Grant → Propose → Deny → Freeze when time is tight  

Scripts: [`JUDGE.md`](../JUDGE.md) · [`DEMO_SCRIPT.md`](../DEMO_SCRIPT.md)

## Not required for the core demo

Full ERC-4337 paymasters, open marketplace search, or mainnet — those extend the **same** credential + Guard story ([`AA_SESSION_KEY.md`](AA_SESSION_KEY.md)).
