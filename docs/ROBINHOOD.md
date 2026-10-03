# Robinhood Chain (P2 — reserved Overall prize seat)

Overall prizes reserve at least one slot for a **Robinhood Chain** project. KillSwitch can dual-deploy the same `SessionPolicy`.

## Not done until you fund a Robinhood testnet key

1. Faucet: https://faucet.testnet.chain.robinhood.com/  
2. Docs: https://docs.arbitrum.io (custom Orbit / HackQuest Robinhood quickstart)  
3. Set in `.env`:
   ```
   RPC_URL=<robinhood testnet rpc>
   CHAIN_LABEL=robinhood-testnet
   EXPLORER_TX_URL_PREFIX=<explorer>/tx
   ```
4. `./demos/setup.sh` then paste the new address next to the Arb Sepolia row in README.

`agent/src/payment-proposer.ts` already maps `CHAIN_IDS.robinhoodTestnet` (confirm chainId against current Robinhood docs before relying on it).
