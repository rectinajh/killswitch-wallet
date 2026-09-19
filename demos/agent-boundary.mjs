#!/usr/bin/env node
/**
 * Agent-boundary demos: force adversarial proposes through the TypeScript agent
 * so the contract (not the model) denies over-budget and off-allowlist payments.
 * Also includes one success path that uses the real LLM when a Kiln key is present.
 *
 * Usage:
 *   node demos/agent-boundary.mjs all
 *   node demos/agent-boundary.mjs budget
 *   node demos/agent-boundary.mjs merchant
 *   node demos/agent-boundary.mjs success
 *
 * Requires: anvil up, CONTRACT_ADDRESS in .env, agent built (npm run build).
 */
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const agentRequire = createRequire(path.join(root, 'agent/package.json'));

const { config: loadEnv } = agentRequire('dotenv');
const { ethers } = agentRequire('ethers');
loadEnv({ path: path.join(root, '.env') });

const { initializeAgent, feeWei, totalCostWei } = await import(
  pathToFileURL(path.join(root, 'agent/dist/index.js')).href
);

const MERCHANT_OK = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const MERCHANT_BAD = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

async function grantTightSession(ownerSigner, agentAddress, contractAddress, budgetEth, merchants) {
  const abi = [
    'function grantSession(uint256 budget, uint256 duration, address agent, address[] merchants) payable returns (uint256)',
    'function nextSessionId() view returns (uint256)',
  ];
  const c = new ethers.Contract(contractAddress, abi, ownerSigner);
  const budgetWei = ethers.parseEther(budgetEth);
  const tx = await c.grantSession(budgetWei, 3600, agentAddress, merchants, { value: budgetWei });
  await tx.wait();
  const next = await c.nextSessionId();
  return Number(next) - 1;
}

async function caseSuccess({ paymentProposer, ownerSigner, signer, contractAddress, llm }) {
  console.log('\n=== CASE: success path (LLM when key present) ===');
  const sessionId = await grantTightSession(
    ownerSigner,
    signer.address,
    contractAddress,
    '1',
    [MERCHANT_OK]
  );
  console.log(`sessionId=${sessionId} mock=${llm.mockMode}`);

  const result = await paymentProposer.proposePayment(
    sessionId,
    'Buy coffee for 0.03 ETH',
    {
      // Happy path: do NOT skip LLM
      skipLlm: false,
      explain: true,
    }
  );

  console.log(JSON.stringify(result, null, 2));
  const executed = result.events?.find((e) => e.type === 'executed');
  assert(result.success && executed, 'Expected PaymentExecuted event');
  assert(result.transactionHash, 'Expected ethers transactionHash');
  assert(result.credential?.transactionHash === result.transactionHash, 'Credential must use tx hash');
  assert(result.explanation, 'Expected explainReceipt explanation');
  if (!llm.mockMode) {
    assert(result.usage?.propose && !result.usage.propose.mock, 'Expected real propose usage');
  } else {
    console.log('NOTE: mock mode (no Kiln key) — usage labeled mock');
  }
  console.log('PASS success path');
  return { sessionId, result };
}

async function caseBudget({ paymentProposer, ownerSigner, signer, contractAddress }) {
  console.log('\n=== CASE: over-budget (amount + 2% fee) ===');
  const sessionId = await grantTightSession(
    ownerSigner,
    signer.address,
    contractAddress,
    '0.1',
    [MERCHANT_OK]
  );
  const amountEth = '0.099';
  const amountWei = ethers.parseEther(amountEth);
  console.log(`sessionId=${sessionId}`);
  console.log(
    `amount=${amountEth} ETH fee=${ethers.formatEther(feeWei(amountWei))} total=${ethers.formatEther(totalCostWei(amountWei))}`
  );

  const result = await paymentProposer.proposePayment(
    sessionId,
    'Adversarial: attempt over-budget coffee',
    {
      forceAmountEth: amountEth,
      forceMerchant: MERCHANT_OK,
      allowOffAllowlist: false,
      skipLlm: true,
      explain: true,
    }
  );

  console.log(JSON.stringify(result, null, 2));
  const denied = result.events?.find((e) => e.type === 'denied');
  assert(result.success && denied, 'Expected PaymentDenied event');
  assert(
    String(denied.reason || '').toLowerCase().includes('budget'),
    `Expected budget denial, got: ${denied.reason}`
  );
  assert(result.explanation, 'Expected explainReceipt after deny');
  console.log('PASS budget boundary — deny is a success outcome');
  return { sessionId, result };
}

async function caseMerchant({ paymentProposer, ownerSigner, signer, contractAddress }) {
  console.log('\n=== CASE: off-allowlist merchant ===');
  const sessionId = await grantTightSession(
    ownerSigner,
    signer.address,
    contractAddress,
    '1',
    [MERCHANT_OK]
  );
  console.log(`sessionId=${sessionId} forceMerchant=${MERCHANT_BAD}`);

  const result = await paymentProposer.proposePayment(
    sessionId,
    'Adversarial: pay unauthorized merchant',
    {
      forceAmountEth: '0.01',
      forceMerchant: MERCHANT_BAD,
      allowOffAllowlist: true,
      skipLlm: true,
      explain: true,
    }
  );

  console.log(JSON.stringify(result, null, 2));
  const denied = result.events?.find((e) => e.type === 'denied');
  assert(result.success && denied, 'Expected PaymentDenied event');
  assert(
    String(denied.reason || '').toLowerCase().includes('merchant'),
    `Expected merchant denial, got: ${denied.reason}`
  );
  assert(result.explanation, 'Expected explainReceipt after deny');
  console.log('PASS merchant boundary — deny is a success outcome');
  return { sessionId, result };
}

async function main() {
  const which = (process.argv[2] || 'all').toLowerCase();
  const { paymentProposer, signer, ownerSigner, contractAddress, llm } =
    await initializeAgent();
  const ctx = { paymentProposer, signer, ownerSigner, contractAddress, llm };

  if (which === 'success' || which === 'all') await caseSuccess(ctx);
  if (which === 'budget' || which === 'all') await caseBudget(ctx);
  if (which === 'merchant' || which === 'all') await caseMerchant(ctx);

  console.log('\nALL AGENT-BOUNDARY CASES PASS');
}

main().catch((err) => {
  console.error('FAIL', err);
  process.exit(1);
});
