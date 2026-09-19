import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import { initializeAgent } from '../../agent/dist/index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
loadEnv({ path: path.join(root, '.env') });

const PORT = Number(process.env.CONSOLE_PORT || 8787);
const RPC_URL = process.env.RPC_URL || 'http://127.0.0.1:8545';
const PRIVATE_KEY = process.env.PRIVATE_KEY;
const CONTRACT_ADDRESS = process.env.CONTRACT_ADDRESS;
const abi = JSON.parse(fs.readFileSync(path.join(__dirname, 'abi.json'), 'utf8'));

function send(res, code, obj) {
  const body = JSON.stringify(obj, (_, v) => typeof v === 'bigint' ? v.toString() : v, 2);
  res.writeHead(code, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(body);
}

function getContract(signerOrProvider) {
  if (!CONTRACT_ADDRESS) throw new Error('CONTRACT_ADDRESS missing in .env');
  return new ethers.Contract(CONTRACT_ADDRESS, abi, signerOrProvider);
}

async function readBody(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://127.0.0.1:${PORT}`);
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

    if (req.method === 'GET' && url.pathname === '/api/policy') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const provider = new ethers.JsonRpcProvider(RPC_URL);
      const c = getContract(provider);
      const p = await c.getSessionPolicy(sessionId);
      const llmProvider = (process.env.LLM_PROVIDER || 'kimi').toLowerCase();
      const mockMode = llmProvider === 'kimi'
        ? (!process.env.KIMI_API_KEY || process.env.KIMI_API_KEY === 'your_kimi_key_here')
        : (!process.env.KILN_API_KEY || process.env.KILN_API_KEY === 'your_key_here');
      return send(res, 200, {
        rpcUrl: RPC_URL,
        contractAddress: CONTRACT_ADDRESS,
        provider: llmProvider,
        model: llmProvider === 'kimi' ? (process.env.KIMI_MODEL || 'kimi-k2.6') : (process.env.KILN_MODEL || 'gpt-oss-120b'),
        mockMode,
        policy: {
          owner: p[0],
          budgetWei: p[1].toString(),
          spentWei: p[2].toString(),
          budgetEth: ethers.formatEther(p[1]),
          spentEth: ethers.formatEther(p[2]),
          remainingEth: ethers.formatEther(p[1] - p[2]),
          deadline: Number(p[3]),
          deadlineIso: new Date(Number(p[3]) * 1000).toISOString(),
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
      return send(res, 200, {
        transactionHash: receipt.hash,
        sessionId: Number(next) - 1,
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

    if (req.method === 'POST' && url.pathname === '/api/propose') {
      const body = await readBody(req);
      const { paymentProposer } = await initializeAgent();
      const result = await paymentProposer.proposePayment(
        Number(body.sessionId || 0),
        body.intent || 'Buy coffee for 0.03 ETH'
      );
      return send(res, 200, result);
    }

    if (req.method === 'GET' && url.pathname === '/api/events') {
      const sessionId = Number(url.searchParams.get('sessionId') || 0);
      const { policyReader } = await initializeAgent();
      const events = await policyReader.getPaymentHistory(sessionId, 0);
      return send(res, 200, {
        events: events.map((e) => ({
          type: e.type,
          sessionId: e.sessionId,
          merchant: e.merchant,
          amount: e.amount?.toString?.() ?? String(e.amount),
          fee: e.fee?.toString?.(),
          reason: e.reason,
          transactionHash: e.transactionHash,
          blockNumber: e.blockNumber,
        })),
      });
    }

    send(res, 404, { error: 'not found' });
  } catch (err) {
    send(res, 500, { error: err.message || String(err) });
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`KillSwitch console http://127.0.0.1:${PORT}`);
  console.log(`Contract ${CONTRACT_ADDRESS || '(unset)'}`);
});
