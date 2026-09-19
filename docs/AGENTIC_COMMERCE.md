# Agentic Commerce — KillSwitch core thesis

> This is the **product idea**, not a side demo. Session Key / Policy / Guard are how we implement it.

Handbook **智能体商业 (Agentic Commerce)** = an Agent **discovers** a service, **agrees a quote**, **pays under policy**, and leaves a **verifiable credential** — while the user keeps a kill switch.

## One sentence

**KillSwitch Wallet makes Agentic Commerce safe enough to ship:** the model may checkout; the contract decides; denial is recorded success; the user can Freeze or Close+refund.

## Why this helps judging (Furiosa B)

| Without Agentic Commerce framing | With it |
|----------------------------------|---------|
| “We built a session policy contract” | “Agent buys coffee / pays API under a grant; Shadow Shop is denied with proof” |
| Abstract Session Key talk | Concrete catalog → checkout → credential |
| Deny looks like failure | Deny = Guard success in a commerce abuse case |
| Hard to remember after 90s | Story sticks: whitelist shop vs shadow shop |

Wallet & Permission remains the **Handbook track**; Agentic Commerce is the **scene that proves the track**.

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
| Negotiation | Fixed quote per SKU (hackathon-simple; real world = RFQ) |
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

## Not required for Furiosa demo

Full ERC-4337 paymasters, open marketplace search, or mainnet — those extend the **same** credential + Guard story ([`AA_SESSION_KEY.md`](AA_SESSION_KEY.md)).
