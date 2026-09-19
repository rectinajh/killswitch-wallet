import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { ethers } from 'ethers';
import {
  initializeAgent,
  feeWei,
  totalCostWei,
  feePercentLabel,
  resolveOwnerPrivateKey,
  resolveAgentPrivateKey,
  resolveChainLabel,
  explorerUrlForTx,
} from '../../agent/dist/index.js';
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

/** See /tmp/server_decoded.mjs on the agent box for full file — restore in progress */
export async function handler(req, res) {
  res.writeHead(503, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: 'server.mjs restore in progress — use local apps/console/server.mjs' }));
}
export default handler;
