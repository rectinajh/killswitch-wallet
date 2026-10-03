# Vercel production env (Arbitrum Sepolia)

Set these in the Vercel project — never commit keys.

```
RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
ARB_SEPOLIA_RPC_URL=https://sepolia-rollup.arbitrum.io/rpc
CHAIN_LABEL=arbitrum-sepolia
CONTRACT_ADDRESS=0x5A035E67d5b5A895e71e14B6C9201952C81350df
CONTRACT_DEPLOY_BLOCK=315227756
OWNER_PRIVATE_KEY=          # funded throwaway
AGENT_PRIVATE_KEY=          # funded throwaway
LLM_PROVIDER=kimi           # optional
KIMI_API_KEY=               # optional
```

Redeploy after saving. Local Anvil URLs must not be used on Vercel.
