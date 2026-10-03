# Vercel production env (Arbitrum Sepolia)

Set these in the Vercel project — never commit keys. Redeploy after saving.

```
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARB_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_LABEL=arbitrum-sepolia
CONTRACT_ADDRESS=0x9Cbe0de60e325347bfCE7517410B8728eA78b3cA
CONTRACT_DEPLOY_BLOCK=315248101
PAYMENT_TOKEN=USDG
USDG_TOKEN_ADDRESS=0x07215B977D8636A273b0Cb3eCc5915329A3534f0
OWNER_PRIVATE_KEY=          # funded throwaway
AGENT_PRIVATE_KEY=          # funded throwaway
LLM_PROVIDER=kimi           # optional
KIMI_API_KEY=               # optional
```

Without `PAYMENT_TOKEN` + `USDG_TOKEN_ADDRESS`, the Console still quotes native ETH (including the “Buy coffee…” intent).

For Circle USDC instead of MockUSDG:

```
PAYMENT_TOKEN=USDC
USDC_TOKEN_ADDRESS=0x75faf114eafb1BDbe2F0316DF893fd58CE46AA4d
```

Local Anvil URLs must not be used on Vercel.
