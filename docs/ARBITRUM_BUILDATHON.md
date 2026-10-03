# Arbitrum Open House Buildathon — KillSwitch path

**Track:** [Arbitrum Open House Singapore: Online Buildathon](https://www.hackquest.io/hackathons/Arbitrum-Open-House-Singapore-Online-Buildathon)

**Hard gate:** deploy on an Arbitrum chain (Arbitrum Sepolia `421614`, Arbitrum One, Robinhood Chain, etc.). Local Anvil alone does **not** qualify.

## Pitch (one breath)

KillSwitch is **agent spend controls on Arbitrum**: the user grants a Session Key (budget · merchant allowlist · deadline); the AI agent only *proposes*; `SessionPolicy` Guards; `PaymentDenied` is a recorded success; the user can Freeze or Close+refund. Low fees on Arbitrum make session-bounded micropayments practical.

### Judging map

| Criterion | What we show |
|-----------|----------------|
| Smart contract quality | Agent-bound `proposeOrPay`, fee-aware budget, recorded denies, Foundry tests |
| Product-Market Fit | Offline / meeting → agent pays coffee or API bills without vault risk |
| Innovation | Deny-as-success + dual evidence (LLM proposal vs chain) |
| Real problem | Prompts are not a control plane; policy must be on-chain |
| Extra (USDG) | **Live** ERC-20 settlement via `grantSessionToken` — [`USDG_ROADMAP.md`](USDG_ROADMAP.md) |

## P0 bring-up (Arbitrum Sepolia)

1. Create two throwaway keys (owner + agent); fund both with Arb Sepolia ETH  
   Faucets: https://arbitrum.faucet.dev/ · https://faucet.quicknode.com/arbitrum/sepolia · https://www.l2faucet.com/arbitrum  
2. Configure `.env` (see checklist below)  
3. Deploy:
   ```bash
   ./scripts/deploy-arbitrum-sepolia.sh
   # then either paste CONTRACT_* into .env, or:
   SKIP_DEPLOY=1 ./demos/setup.sh   # grants faucet-sized session on existing contract
   ```
   Or one-shot redeploy+grant: set `RPC_URL` to Arb Sepolia and run `./demos/setup.sh`  
4. Verify: `./scripts/check-arbitrum-path.sh` → expect `ARB_PATH_OK`  
5. Demo: console Grant → Coffee checkout → Shadow Shop deny → Freeze; copy Arbiscan links into README / video  

## Config checklist (what you must set)

| Variable | Required | Notes |
|----------|----------|--------|
| `RPC_URL` | **Yes** | Arbitrum Sepolia JSON-RPC (public or Alchemy/Infura/Ankr) |
| `ARB_SEPOLIA_RPC_URL` | Recommended | Used by `deploy-arbitrum-sepolia.sh` / Foundry |
| `OWNER_PRIVATE_KEY` | **Yes** | Funded; grant / freeze / close |
| `AGENT_PRIVATE_KEY` | **Yes** | Funded; proposeOrPay (can differ from owner) |
| `CONTRACT_ADDRESS` | **Yes** after deploy | From forge / setup |
| `CONTRACT_DEPLOY_BLOCK` | **Yes** on public RPC | Avoid eth_getLogs from genesis |
| `CHAIN_LABEL` | Recommended | `arbitrum-sepolia` |
| `ARBISCAN_API_KEY` | Optional | Contract verify on Arbiscan |
| `LLM_PROVIDER` + API key | Optional | Live propose/explain; mock OK for chain-only demo |
| Vercel: same as above | If hosting console | Never point prod at `127.0.0.1` |

## Submission pack

- Public GitHub repo  
- Demo video ≤ 3 minutes showing **Arbiscan** Executed + Denied  
- Pitch deck (use this doc’s pitch table)  
- HackQuest registration / submit before the published deadline  

## P1 / P2 (optional)

- **P1:** ERC-20 / USDG settlement **done** ([`USDG_ROADMAP.md`](USDG_ROADMAP.md)); ZeroDev/AA story ([`AA_SESSION_KEY.md`](AA_SESSION_KEY.md))  
- **P2:** Robinhood Chain second deploy, Stylus sidecar — not required for a solid Overall/Promising entry  

## Legacy

GWDC / Furiosa Kiln path scripts remain under `scripts/check-furiosa-path.sh` and `KILN_SETUP.md` — not the Arbitrum qualification path.
