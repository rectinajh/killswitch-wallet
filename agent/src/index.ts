import { ethers } from 'ethers';
import { config } from 'dotenv';
import { KilnClient } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { PaymentProposer } from './payment-proposer.js';

config();

export { KilnClient } from './kiln-client.js';
export { PolicyReader } from './policy-reader.js';
export { PaymentProposer } from './payment-proposer.js';
export { feeWei, totalCostWei, feePercentLabel, FEE_PERCENT } from './fees.js';
export type { ProposePaymentOptions, PaymentResult } from './payment-proposer.js';

function resolveLlmConfig() {
  const provider = (process.env.LLM_PROVIDER || 'kimi').toLowerCase();

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

  // Default / Furiosa official path
  const apiKey = process.env.KILN_API_KEY || '';
  return {
    provider: 'kiln',
    apiKey,
    baseUrl: process.env.KILN_API_BASE_URL || 'https://api.kilnapi.com/v1',
    model: process.env.KILN_MODEL || 'gpt-oss-120b',
    mockMode: !apiKey || apiKey === 'your_key_here',
  };
}

/**
 * Initialize KillSwitch Wallet agent components
 */
export async function initializeAgent() {
  const rpcUrl = process.env.RPC_URL || 'http://127.0.0.1:8545';
  const contractAddress = process.env.CONTRACT_ADDRESS;
  const privateKey = process.env.PRIVATE_KEY;

  if (!contractAddress) {
    throw new Error('CONTRACT_ADDRESS environment variable required');
  }

  if (!privateKey) {
    throw new Error('PRIVATE_KEY environment variable required');
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);

  const llm = resolveLlmConfig();
  console.log(`[Agent] LLM provider=${llm.provider} model=${llm.model} mock=${llm.mockMode}`);

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
    kilnClient,
    policyReader,
    paymentProposer,
    contractAddress,
    llm,
  };
}

/**
 * Example usage (for testing)
 */
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
      console.log(JSON.stringify(result, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2));

      if (result.success) {
        const explanation = await paymentProposer.explainResult(result);
        console.log('\n=== EXPLANATION ===');
        console.log(explanation);
      }
    })
    .catch(console.error);
}
