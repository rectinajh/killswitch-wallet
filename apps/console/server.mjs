/**
 * Console entry (Vercel + local). `vercel-build` / `npm run assemble-console` runs
 * assemble-server.sh which cats server.part1.mjs.txt + server.part2.mjs.txt →
 * server.assembled.mjs. This file re-exports that handler.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const assembled = path.join(__dirname, 'server.assembled.mjs');
const p1 = path.join(__dirname, 'server.part1.mjs.txt');
const p2 = path.join(__dirname, 'server.part2.mjs.txt');

if (!fs.existsSync(assembled) || process.env.FORCE_ASSEMBLE === '1') {
  if (!fs.existsSync(p1) || !fs.existsSync(p2)) {
    throw new Error('Missing server.part1/part2 — run bash apps/console/assemble-server.sh');
  }
  fs.writeFileSync(assembled, fs.readFileSync(p1, 'utf8') + fs.readFileSync(p2, 'utf8'));
}

const mod = await import(pathToFileURL(assembled).href);
export const handler = mod.handler;
export default mod.default ?? mod.handler;
