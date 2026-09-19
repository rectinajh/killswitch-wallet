import { ethers } from 'ethers';
import { config } from 'dotenv';
import { KilnClient } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { PaymentProposer } from './payment-proposer.js';

config({ override: true });

export { KilnClient } from './kiln-client.js';
export { PolicyReader } from './policy-reader.js';
export {
  PaymentProposer,
  buildCommercePaymentCredential,
  resolveChainLabel,
  explorerUrlForTx,
} from './payment-proposer.js';
export { feeWei, totalCostWei, feePercentLabel, FEE_PERCENT } from './fees.js';
export { buildAgentSystemPrompt, buildAgentContextPreview } from './agent-context.js';
export type {
  ProposePaymentOptions,
  PaymentResult,
  CommercePaymentCredential,
} from './payment-proposer.js';

/** Anvil #0 — owner (grant/freeze/close) */
export const ANVIL_OWNER_KEY =
  '0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80';
/** Anvil #1 — agent (proposeOrPay) */
export const ANVIL_AGENT_KEY =
  '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d';

function resolveLlmConfig() {
  const provider = (process.env.LLM_PROVIDER || 'kiln').toLowerCase();

  if (provider === 'kimi') {
    const apiKey = process.env.KIMI_API_KEY || '';
    return {
      provider,
      apiKey,
      baseUrl: process.env.KIMI_API_BASE_URL || 'https://api.moonshot.cn/v1',
      model: process.env.KIMI_MODEL || 'moonshot-v1-8k',
      mockMode: !apiKey || apiKey === 'your_kimi_key_here',
    };
  }

  const apiKey = process.env.KILN_API_KEY || '';
  return {
    provider: 'kiln',
    apiKey,
    baseUrl: process.env.KILN_API_BASE_URL || 'https://api.kilnapi.com/v1',
    model: process.env.KILN_MODEL || 'gpt-oss-120b',
    mockMode: !apiKey || apiKey === 'your_key_here',
  };
}

export function resolveOwnerPrivateKey(): string {
  return (
    process.env.OWNER_PRIVATE_KEY ||
    process.env.PRIVATE_KEY_OWNER ||
    ANVIL_OWNER_KEY
  );
}

export function resolveAgentPrivateKey(): string {
  return (
    process.env.AGENT_PRIVATE_KEY ||
    process.env.PRIVATE_KEY ||
    ANVIL_AGENT_KEY
  );
}

export async function initializeAgent() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const contractAddress = process.env.CONTRACT_ADDRESS;

  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS environment variable required');
  }

  const agentKey = resolveAgentPrivateKey();
  const ownerKey = resolveOwnerPrivateKey();

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(agentKey, provider);
  const ownerSigner = new ethers.Wallet(ownerKey, provider);

  const llm = resolveLlmConfig();
  console.log(`[Agent] LLM provider=${llm.provider} model=${llm.model} mock=${llm.mockMode}`);
  console.log(`[Agent] owner=${ownerSigner.address} agent=${signer.address}`);

  const kilnClient = new KilnClient({
    apiKey: llm.apiKey,
    baseUrl: llm.baseUrl,
    model: llm.model,
    mockMode: llm.mockMode,
  });
  const policyReader = new PolicyReader(contractAddress, provider);
  const paymentProposer = new PaymentProposer(
    contractAddress,
    signer,
    kilnClient,
    policyReader
  );

  return {
    provider,
    signer,
    ownerSigner,
    kilnClient,
    policyReader,
    paymentProposer,
    contractAddress,
    llm,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const sessionId = parseInt(process.env.SESSION_ID || '0');
  const userIntent = process.env.USER_INTENT || 'Buy coffee for $5';

  initializeAgent()
    .then(async ({ paymentProposer }) => {
      console.log('KillSwitch Wallet Agent initialized');
      console.log(`Session ID: ${sessionId}`);
      console.log(`User Intent: ${userIntent}`);
      console.log('');

      const result = await paymentProposer.proposePayment(sessionId, userIntent);

      console.log('\n=== RESULT ===');
      console.log(JSON.stringify(result, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2));

      if (result.explanation) {
        console.log('\n=== EXPLANATION ===');
        console.log(result.explanation);
      }
    })
    .catch(console.error);
}
