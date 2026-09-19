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
if (!process.env.VERCEL) {
  try {
    loadEnv({ path: path.join(root, '.env') });
  } catch (_) {}
}

const PORT = Number(process.env.CONSOLE_PORT || 8787);
const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi.json'), 'utf8'));

/** Demo Agentic Commerce catalog — addresses must match Anvil allowlist merchants */
const COMMERCE_CATALOG = [
  {
    id: 'coffee-lane',
    name: 'Coffee Lane (白名单咖啡店)',
    category: 'food',
    merchant: '0x70997970C51812dc3A010C7d01b50e0d17dc79C8',
    sku: 'LATTE',
    quoteEth: '0.02',
    description: 'Iced latte for meeting break',
    service: 'In-store / pickup',
  },
  {
    id: 'api-meter',
    name: 'Metered API Billing',
    category: 'saas',
    merchant: '0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266',
    sku: 'API-1K',
    quoteEth: '0.015',
    description: 'Pay 1k inference credits invoice',
    service: 'Machine-to-machine settlement',
  },
];



function refreshEnv() {
  // On Vercel, platform env is source of truth — never override with a local .env
  if (process.env.VERCEL) return;
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


/** Local Anvil keeps large demo amounts; public testnets use faucet-sized wei. */
async function getDemoAmounts(provider) {
  try {
    const net = await provider.getNetwork();
    if (net.chainId === 31337n) {
      return {
        local: true,
        defaultGrant: '1',
        autoGrant: '0.5',
        autoProposeIntent: 'Buy coffee for 0.02 ETH',
        autoProposeAmount: '0.02',
        boundaryBudget: '0.1',
        boundaryForce: '0.099',
        merchantBudget: '1',
        merchantForce: '0.01',
        coffeeQuote: '0.02',
        apiQuote: '0.015',
        shadowQuote: '0.01',
      };
    }
  } catch (_) {}
  // Sepolia / other public RPCs — fit ~0.002 ETH faucet leftovers after gas
  return {
    local: false,
    defaultGrant: '0.0008',
    autoGrant: '0.0008',
    autoProposeIntent: 'Buy coffee for 0.0003 ETH',
    autoProposeAmount: '0.0003',
    // 0.000495 + 2% = 0.0005049 > 0.0005
    boundaryBudget: '0.0005',
    // 0.0006 + 2% = 0.000612 > 0.0005 → PaymentDenied
    boundaryForce: '0.0006',
    merchantBudget: '0.0005',
    merchantForce: '0.0001',
    coffeeQuote: '0.0003',
    apiQuote: '0.00025',
    shadowQuote: '0.0001',
  };
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

export async function handler(req, res) {
  try {
    const host = req.headers.host || `127.0.0.1:${PORT}`;
    const proto = req.headers['x-forwarded-proto'] || 'http';
    const url = new URL(req.url, `${proto}://${host}`);
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


    if (req.method === 'GET' && url.pathname === '/api/commerce/catalog') {
      const amts = await getDemoAmounts(new ethers.JsonRpcProvider(env().rpcUrl));
      const catalog = COMMERCE_CATALOG.map((item) => ({
        ...item,
        quoteEth: item.id === 'coffee-lane' ? amts.coffeeQuote : amts.apiQuote,
      }));
      return send(res, 200, { catalog, demoScale: amts.local ? 'anvil' : 'public-testnet' });
    }

    if (req.method === 'POST' && url.pathname === '/api/commerce/checkout') {
      const body = await readBody(req);
      const item = COMMERCE_CATALOG.find((c) => c.id === body.skuId) || null;
      if (!item && !body.forceOffCatalog) {
        return send(res, 400, { error: 'Unknown skuId — pick from /api/commerce/catalog' });
      }
      const sessionId = Number(body.sessionId || 0);
      const off = Boolean(body.forceOffCatalog);
      const merchant = off
        ? '0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC'
        : (item?.merchant || body.merchant);
      const amts = await getDemoAmounts(new ethers.JsonRpcProvider(RPC_URL));
      const amountEth = off ? amts.shadowQuote : String(body.amountEth || (item?.id === 'coffee-lane' ? amts.coffeeQuote : (item?.quoteEth || amts.apiQuote)));
      const intent = off
        ? 'Agentic Commerce adversarial: pay Shadow Shop (not allowlisted)'
        : `Agentic Commerce checkout: ${item.name} / ${item.sku} — ${item.description}`;
      const { paymentProposer } = await initializeAgent();
      const result = await paymentProposer.proposePayment(sessionId, intent, {
        forceMerchant: merchant,
        forceAmountEth: amountEth,
        allowOffAllowlist: off,
        skipLlm: true,
      });
      const events = result.events || [];
      const executed = events.find((e) => e.type === 'executed');
      const denied = events.find((e) => e.type === 'denied');
      const credential = executed
        ? {
            type: 'CommercePaymentCredential',
            status: 'paid',
            skuId: item?.id || 'off-catalog',
            merchant,
            amountEth,
            description: item?.description || intent,
            sessionId,
            transactionHash: result.transactionHash,
            chain: 'anvil-local',
            verify: 'Anyone can verify PaymentExecuted on SessionPolicy for this tx — merchant settlement proof',
          }
        : denied
          ? {
              type: 'CommercePaymentCredential',
              status: 'denied',
              skuId: item?.id || 'off-catalog',
              merchant,
              amountEth,
              reason: denied.reason,
              sessionId,
              transactionHash: result.transactionHash,
              note: 'Deny is a successful Guard outcome — no merchant settlement',
            }
          : { type: 'CommercePaymentCredential', status: 'unknown', result };
      return send(res, 200, {
        intent,
        item: item || { id: 'off-catalog', merchant },
        result,
        credential,
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
        demoAmounts: await getDemoAmounts(new ethers.JsonRpcProvider(RPC_URL)).catch(() => null),
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
      const amts = await getDemoAmounts(new ethers.JsonRpcProvider(RPC_URL));
      const budgetWei = ethers.parseEther(String(body.budgetEth || amts.defaultGrant));
      // Fail fast with a clear message when faucet balance is too low
      {
        const wallet = new ethers.Wallet(PRIVATE_KEY, new ethers.JsonRpcProvider(RPC_URL));
        const bal = await wallet.provider.getBalance(wallet.address);
        if (bal < budgetWei) {
          return send(res, 400, {
            error: `insufficient funds: wallet has ${ethers.formatEther(bal)} ETH but grant needs ${ethers.formatEther(budgetWei)} ETH (plus gas). Top up Sepolia or use a smaller budgetEth.`,
            balanceEth: ethers.formatEther(bal),
            neededEth: ethers.formatEther(budgetWei),
            suggestedBudgetEth: amts.autoGrant,
          });
        }
      }
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
        body.intent || (await getDemoAmounts(new ethers.JsonRpcProvider(RPC_URL))).autoProposeIntent,
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

      const amts = await getDemoAmounts(provider);
      if (which === 'merchant') {
        budgetEth = amts.merchantBudget;
        merchants = [MERCHANT_OK];
        forceAmountEth = amts.merchantForce;
        forceMerchant = MERCHANT_BAD;
        allowOffAllowlist = true;
        intent = 'Boundary demo: off-allowlist merchant';
      } else {
        // forceAmount + 2% fee must exceed budget (deny = success)
        budgetEth = amts.boundaryBudget;
        merchants = [MERCHANT_OK];
        forceAmountEth = amts.boundaryForce;
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
}

export default handler;

// Local mode only — on Vercel, export the handler and do not listen.
if (!process.env.VERCEL) {
  const server = http.createServer(handler);
  server.listen(PORT, '127.0.0.1', () => {
    const e = env();
    console.log(`KillSwitch console http://127.0.0.1:${PORT}`);
    console.log(`Contract ${e.contractAddress || '(unset)'}`);
    console.log(`Fee model: amount + ${feePercentLabel()} (budget checks totalCost)`);
  });
}
