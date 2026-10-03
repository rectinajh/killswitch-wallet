# HackQuest submission media

Assets for **Arbitrum Open House Singapore: Online Buildathon**.

## Images (upload order → HackQuest Images 0/4 … 4/4)

| # | File | Use as |
|---|------|--------|
| 1 | `ks-01-hero.jpg` | Cover / hero |
| 2 | `ks-02-flow.jpg` | Architecture / flow |
| 3 | `ks-03-deny-success.jpg` | Deny = success |
| 4 | `ks-04-arbiscan.jpg` | Deployed on Arbitrum Sepolia |

Optional extras (not counting toward the 4 slots, useful in pitch deck):

- `demo-01-console-hero.png` — live Policy session on Arb
- `demo-02-policy-session.png` — Production / AA tab
- `demo-03-deny-outcome.png` — Agent boundary controls

## Video

| File | Length | Notes |
|------|--------|--------|
| `killswitch-arbitrum-demo.mp4` | ~90s | Captioned slideshow (no mic). Prefer a live Console recording if you can. Pitch: [`docs/PITCH.md`](../PITCH.md) |

HackQuest often wants **≤ 3 minutes**. This file is under that limit. For a stronger entry, re-record with voiceover using the script below (or screen-record `http://127.0.0.1:8787` while clicking Grant → checkout → Shadow deny → Freeze).

### English voiceover (~60–90s)

1. KillSwitch is agent spend controls on Arbitrum.  
2. You grant a Session Key: budget, merchant allowlist, deadline — not your master key.  
3. The AI agent only proposes. SessionPolicy guards on-chain.  
4. In-limit checkout becomes PaymentExecuted with an Arbiscan link.  
5. Off-allowlist or over-budget becomes PaymentDenied — deny is success.  
6. You can Freeze or Close and refund anytime.  
7. Contract live on Arbitrum Sepolia: `0x5A035E67d5b5A895e71e14B6C9201952C81350df`.

### On-chain links to show in a live recording

- Contract: https://sepolia.arbiscan.io/address/0x5A035E67d5b5A895e71e14B6C9201952C81350df  
- Executed: https://sepolia.arbiscan.io/tx/0xb77a6145d27ba39875f24ddc4a6e1192cae8583a4e824ed6b7ae404df9dc629a  
- Denied: https://sepolia.arbiscan.io/tx/0x99deb3f987d68d178310228a45510bddc43d64bd6296a3f46ea6cc61332126ac  

## Regenerate video

```bash
cd docs/submission
# (same ffmpeg command used to build killswitch-arbitrum-demo.mp4)
```
