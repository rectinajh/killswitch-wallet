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
| `killswitch-arbitrum-demo.mp4` | 90s | Live Console + Arbiscan stills from session 4, English TTS voiceover. Pitch: [`docs/PITCH.md`](../PITCH.md) |

HackQuest often wants **≤ 3 minutes**. This file is 90s with audio.

### English voiceover (~90s)

Script used in the mp4: [`demo-voiceover.txt`](demo-voiceover.txt).

### On-chain links in this recording (session 4)

- Contract: https://sepolia.arbiscan.io/address/0x5A035E67d5b5A895e71e14B6C9201952C81350df  
- Grant: https://sepolia.arbiscan.io/tx/0xde3ef396d1b7fc0cb04c170df4841d0f672c6dce04429e545bd8fbe9f2ee4303  
- Executed (coffee checkout): https://sepolia.arbiscan.io/tx/0x1fbe7e9d4f8060b7ab3fc91bd831cfdc9f383fd65bea1dc07426c9295aed7d0c  
- Denied (Shadow Shop): https://sepolia.arbiscan.io/tx/0x609919e0fb25c503af5b9ab7632669ae07be0ffca0a1d547fd34f3b3d1383ff6  
- Freeze: https://sepolia.arbiscan.io/tx/0x0bff1b859133bceddc4c836bf2c81684c4eae13bff91b21edd6ad205e22d74bf  

## Regenerate video

```bash
cd docs/submission
# (same ffmpeg command used to build killswitch-arbitrum-demo.mp4)
```
