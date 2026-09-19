import { ethers } from 'ethers';
import { config } from 'dotenv';
import { KilnClient } from './kiln-client.js';
import { PolicyReader } from './policy-reader.js';
import { PaymentProposer } from './payment-proposer.js';

config();

export { KilnClient } from './kiln-client.js';
export { PolicyReader } from './policy-reader.js';
export { PaymentProposer } from './payment-proposer.js';

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

  const kilnConfig = {
    apiKey: process.env.KILN_API_KEY || 'your_key_here',
    baseUrl: process.env.KILN_API_BASE_URL || 'https://api.kilnapi.com/v1',
    model: 'gpt-oss-120b',
    mockMode: !process.env.KILN_API_KEY || process.env.KILN_API_KEY === 'your_key_here',
  };

  const kilnClient = new KilnClient(kilnConfig);
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
      console.log(JSON.stringify(result, null, 2));

      if (result.success && result.events.length > 0) {
        const explanation = await paymentProposer.explainResult(result);
        console.log('\n=== EXPLANATION ===');
        console.log(explanation);
      }
    })
    .catch(console.error);
}
