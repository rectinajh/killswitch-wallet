# KillSwitch Console

Minimal local UI for Furiosa B human-side acceptance: grant budget, propose via agent, freeze, and inspect receipts.

## Run

1. Anvil + contract already set up (`./demos/setup.sh`)
2. From repo root:

```bash
node apps/console/server.mjs
```

3. Open http://127.0.0.1:8787

Uses `.env` (`RPC_URL`, `PRIVATE_KEY`, `CONTRACT_ADDRESS`). Kiln stays in mock mode until `KILN_API_KEY` is set.
