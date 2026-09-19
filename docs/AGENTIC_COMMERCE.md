# Agentic Commerce on KillSwitch

Handbook “智能体商业” = Agent **discovers** a service, **agrees a quote**, **pays under policy**, and leaves a **verifiable credential**.

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

## Why this is deeper than “AI paid once”

| Layer | KillSwitch demo |
|-------|-----------------|
| Discovery | `/api/commerce/catalog` named merchants (coffee / API billing) |
| Negotiation | Fixed quote per SKU (hackathon-simple; real world = RFQ) |
| Payment | Session-bound propose; fee-aware budget |
| Settlement proof | `CommercePaymentCredential` from `PaymentExecuted` |
| Dispute / abuse | Off-catalog checkout → `PaymentDenied` |
| Exit | Freeze / Close refund |

## Not required for Furiosa demo

Full ERC-4337 paymasters, open marketplace search, or mainnet — those extend the **same** credential + Guard story (`docs/AA_SESSION_KEY.md`).
