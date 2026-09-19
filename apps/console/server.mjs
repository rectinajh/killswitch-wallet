import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import { initializeAgent, feeWei, totalCostWei, feePercentLabel } from '../../agent/dist/index.js';
import { buildAgentContextPreview } from '../../agent/dist/agent-context.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(root, '.env') });

const PORT = Number(process.env.CONSOLE_PORT || 8787);
const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi.json'), 'utf8'));

function refreshEnv() {
  loadEnv({ path: path.join(root, '.env'), override: true });
}
function env() {
  refreshEnv();
  return {
    rpcUrl: process.env.RPC_URL || 'http://127.0.0.1:8545',
    privateKey: process.env.PRIVATE_KEY,
    contractAddress: process.env.CONTRACT_ADDRESS,
  };
}

const MERCHANT_OK = '0x70997970C51812dc3A010C7d01b50e0d17dc79C8';
const MERCHANT_BAD = '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC';

/** In-memory list of session ids granted via this console */
const grantedSessions = [];

function send(res, code, obj) {
  const body = JSON.stringify(obj, (_, v) => (typeof v === 'bigint' ? v.toString() : v), 2);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function getContract(signerOrProvider, contractAddress) {
  const addr = contractAddress || env().contractAddress;
  if (!addr) throw new Error('CONTRACT_ADDRESS missing in .env — run demos/setup.sh or demos/demo-up.sh');
  return new ethers.Contract(addr, abi, signerOrProvider);
}

function llmMeta() {
  const llmProvider = (process.env.LLM_PROVIDER || 'kimi').toLowerCase();
  const mockMode =
    llmProvider === 'kimi'
      ? !process.env.KIMI_API_KEY || process.env.KIMI_API_KEY === 'your_kimi_key_here'
      : !process.env.KILN_API_KEY || process.env.KILN_API_KEY === 'your_key_here';
  return {
    provider: llmProvider,
    model:
      llmProvider === 'kimi'
        ? process.env.KIMI_MODEL || 'kimi-k2.6'
        : process.env.KILN_MODEL || 'gpt-oss-120b',
    mockMode,
    furiosaOfficial: 'kiln gpt-oss-120b',
          kilnKeyConfigured: Boolean(process.env.KILN_API_KEY && process.env.KILN_API_KEY !== 'your_key_here'),
          officialPathReady: llmProvider === 'kiln' && Boolean(process.env.KILN_API_KEY && process.env.KILN_API_KEY !== 'your_key_here'),
  };
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

function enrichEvent(e) {
  const amountWei = BigInt(e.amount?.toString?.() ?? e.amount ?? 0);
  const fee =
    e.fee !== undefined && e.fee !== null
      ? BigInt(e.fee.toString())
      : feeWei(amountWei);
  return {
    type: e.type,
    sessionId: e.sessionId,
    merchant: e.merchant,
    amount: amountWei.toString(),
    amountEth: ethers.formatEther(amountWei),
    fee: fee.toString(),
    feeEth: ethers.formatEther(fee),
    totalCost: totalCostWei(amountWei).toString(),
    totalCostEth: ethers.formatEther(totalCostWei(amountWei)),
    feePercent: feePercentLabel(),
    reason: e.reason,
    description: e.description,
    receiptHash: e.txHash,
    transactionHash: e.transactionHash,
    blockNumber: e.blockNumber,
  };
}

async function rpcReachable() {
  try {
    const provider = new ethers.JsonRpcProvider(env().rpcUrl);
    await provider.getBlockNumber();
    return true;
  } catch {
    return false;
  }
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
    const { rpcUrl: RPC_URL, privateKey: PRIVATE_KEY, contractAddress: CONTRACT_ADDRESS } = env();
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
      });
      return res.end();
    }

    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = fs.readFileSync(path.join(__dirname, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      return res.end(html);
    }


    if (req.method === 'GET' && url.pathname === '/api/agent-context') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const intent = url.searchParams.get('intent') || 'Buy coffee for 0.02 ETH';
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const c = getContract(provider);
      const pol = await c.getSessionPolicy(sessionId);
      const budget = pol[1];
      const spent = pol[2];
      const remaining = budget - spent;
      const preview = buildAgentContextPreview({
        sessionId,
        budgetEth: ethers.formatEther(budget),
        spentEth: ethers.formatEther(spent),
        remainingEth: ethers.formatEther(remaining),
        merchants: pol[4],
        deadlineIso: new Date(Number(pol[3]) * 1000).toISOString(),
        frozen: pol[5],
        active: pol[6],
      }, intent);
      return send(res, 200, {
        ...preview,
        chainAware: true,
        note: 'This is the ONLY policy context the LLM receives for propose — Chain-aware + Privacy-minimized',
      });
    }


    if (req.method === 'GET' && url.pathname === '/api/security-summary') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const { policyReader } = await initializeAgent();
      const events = await policyReader.getPaymentHistory(sessionId, 0);
      const enriched = events.map(enrichEvent);
      const denied = enriched.filter((e) => e.type === 'denied');
      const executed = enriched.filter((e) => e.type === 'executed');
      const proposed = enriched.filter((e) => e.type === 'proposed');
      const reasons = {};
      for (const d of denied) {
        const r = d.reason || 'unknown';
        reasons[r] = (reasons[r] || 0) + 1;
      }
      return send(res, 200, {
        sessionId,
        counts: {
          proposed: proposed.length,
          executed: executed.length,
          denied: denied.length,
        },
        denyReasons: reasons,
        securityThesis: 'Even if the LLM is induced to overspend or leave the allowlist, Guard emits PaymentDenied — deny is a success outcome.',
        lastDenied: denied.length ? denied[denied.length - 1] : null,
        lastExecuted: executed.length ? executed[executed.length - 1] : null,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/health') {
      const rpcOk = await rpcReachable();
      const llm = llmMeta();
      const e = env();
      return send(res, 200, {
        ok: rpcOk && Boolean(e.contractAddress),
        rpcOk,
        rpcUrl: e.rpcUrl,
        contractAddress: e.contractAddress || null,
        contractConfigured: Boolean(e.contractAddress),
        feeModel: `amount + ${feePercentLabel()} (budget checks totalCost)`,
        feeFormula: '(amount * 2) / 100',
        llm,
        furiosaPath: {
          officialLlm: 'LLM_PROVIDER=kiln + KILN_MODEL=gpt-oss-120b',
          aaRoadmap: 'docs/AA_SESSION_KEY.md',
          interface: 'contracts/src/interfaces/ISessionCapability.sol',
          checkScript: 'scripts/check-furiosa-path.sh',
        },
        time: new Date().toISOString(),
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/sessions') {
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const c = getContract(provider);
      const next = Number(await c.nextSessionId());
      const ids = [];
      for (let i = next - 1; i >= 0 && ids.length < 30; i--) ids.push(i);
      const merged = [...new Set([...grantedSessions, ...ids])].sort((a, b) => b - a);
      return send(res, 200, { nextSessionId: next, sessions: merged, grantedViaConsole: grantedSessions });
    }

    if (req.method === 'GET' && url.pathname === '/api/policy') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const c = getContract(provider);
      const p = await c.getSessionPolicy(sessionId);
      const budget = p[1];
      const spent = p[2];
      const remaining = budget - spent;
      const llm = llmMeta();
      const now = Math.floor(Date.now() / 1000);
      const deadline = Number(p[3]);
      return send(res, 200, {
        rpcUrl: RPC_URL,
        contractAddress: CONTRACT_ADDRESS,
        feeModel: `Budget check uses amount + ${feePercentLabel()} fee`,
        feeFormula: '(amount * 2) / 100',
        ...llm,
        policy: {
          owner: p[0],
          budgetWei: budget.toString(),
          spentWei: spent.toString(),
          remainingWei: remaining.toString(),
          budgetEth: ethers.formatEther(budget),
          spentEth: ethers.formatEther(spent),
          remainingEth: ethers.formatEther(remaining),
          spentPct: budget > 0n ? Number((spent * 10000n) / budget) / 100 : 0,
          remainingPct: budget > 0n ? Number((remaining * 10000n) / budget) / 100 : 0,
          deadline,
          deadlineIso: new Date(deadline * 1000).toISOString(),
          secondsLeft: Math.max(0, deadline - now),
          merchants: p[4],
          frozen: p[5],
          active: p[6],
        },
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/grant') {
      const body = await readBody(req);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const c = getContract(wallet);
      const budgetWei = ethers.parseEther(String(body.budgetEth || '1'));
      const duration = Number(body.durationSec || 3600);
      const merchants = body.merchants || [];
      const tx = await c.grantSession(budgetWei, duration, merchants, { value: budgetWei });
      const receipt = await tx.wait();
      const next = await c.nextSessionId();
      const sessionId = Number(next) - 1;
      if (!grantedSessions.includes(sessionId)) grantedSessions.unshift(sessionId);
      return send(res, 200, {
        transactionHash: receipt.hash,
        sessionId,
        note: `Budget check will use amount + ${feePercentLabel()} fee`,
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/freeze') {
      const body = await readBody(req);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const c = getContract(wallet);
      const tx = await c.freeze(Number(body.sessionId || 0));
      const receipt = await tx.wait();
      return send(res, 200, { transactionHash: receipt.hash, frozen: true });
    }


    if (req.method === 'POST' && url.pathname === '/api/close') {
      const body = await readBody(req);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const c = getContract(wallet);
      const sessionId = Number(body.sessionId || 0);
      const before = await c.getSessionPolicy(sessionId);
      const remainingWei = before[1] - before[2]; // budget - spent
      const tx = await c.closeSession(sessionId);
      const receipt = await tx.wait();
      return send(res, 200, {
        transactionHash: receipt.hash,
        closed: true,
        refundedEth: ethers.formatEther(remainingWei > 0n ? remainingWei : 0n),
        note: 'Session closed; remaining budget refunded to owner (AI Sovereignty)',
      });
    }

    if (req.method === 'POST' && url.pathname === '/api/propose') {
      const body = await readBody(req);
      const { paymentProposer } = await initializeAgent();
      const opts = {};
      if (body.forceAmountEth !== undefined) opts.forceAmountEth = String(body.forceAmountEth);
      if (body.forceMerchant !== undefined) opts.forceMerchant = String(body.forceMerchant);
      if (body.allowOffAllowlist) opts.allowOffAllowlist = true;
      if (body.skipLlm) opts.skipLlm = true;
      const result = await paymentProposer.proposePayment(
        Number(body.sessionId || 0),
        body.intent || 'Buy coffee for 0.03 ETH',
        opts
      );
      return send(res, 200, result);
    }

    if (req.method === 'POST' && url.pathname === '/api/demo/boundary') {
      const body = await readBody(req);
      const which = (body.case || 'budget').toLowerCase();
      const { paymentProposer, signer } = await initializeAgent();
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
      const c = getContract(wallet);

      let budgetEth;
      let merchants;
      let forceAmountEth;
      let forceMerchant;
      let allowOffAllowlist;
      let intent;

      if (which === 'merchant') {
        budgetEth = '1';
        merchants = [MERCHANT_OK];
        forceAmountEth = '0.01';
        forceMerchant = MERCHANT_BAD;
        allowOffAllowlist = true;
        intent = 'Boundary demo: off-allowlist merchant';
      } else {
        // budget: 0.1 ETH; 0.099 + 2% = 0.10098 > 0.1
        budgetEth = '0.1';
        merchants = [MERCHANT_OK];
        forceAmountEth = '0.099';
        forceMerchant = MERCHANT_OK;
        allowOffAllowlist = false;
        intent = 'Boundary demo: over-budget (amount + 2% fee)';
      }

      const budgetWei = ethers.parseEther(budgetEth);
      const tx = await c.grantSession(budgetWei, 3600, merchants, { value: budgetWei });
      await tx.wait();
      const next = await c.nextSessionId();
      const sessionId = Number(next) - 1;
      if (!grantedSessions.includes(sessionId)) grantedSessions.unshift(sessionId);

      const amountWei = ethers.parseEther(forceAmountEth);
      const result = await paymentProposer.proposePayment(sessionId, intent, {
        forceAmountEth,
        forceMerchant,
        allowOffAllowlist,
        skipLlm: true,
      });

      return send(res, 200, {
        case: which,
        sessionId,
        feePreview: {
          amountEth: forceAmountEth,
          feeEth: ethers.formatEther(feeWei(amountWei)),
          totalCostEth: ethers.formatEther(totalCostWei(amountWei)),
          feePercent: feePercentLabel(),
          note: 'Deny is a success outcome — contract enforced the boundary',
        },
        result,
      });
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const { policyReader } = await initializeAgent();
      const events = await policyReader.getPaymentHistory(sessionId, 0);
      return send(res, 200, {
        feeModel: `amount + ${feePercentLabel()}`,
        events: events.map(enrichEvent),
      });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  const e = env();
  console.log(`KillSwitch console http://127.0.0.1:${PORT}`);
  console.log(`Contract ${e.contractAddress || '(unset)'}`);
  console.log(`Fee model: amount + ${feePercentLabel()} (budget checks totalCost)`);
});
