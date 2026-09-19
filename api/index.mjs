/**
 * Vercel Node serverless entry — re-exports the console HTTP handler
 * so rewrites can send `/`, `/index.html`, and `/api/*` here.
 */
export { default, handler } from '../apps/console/server.mjs';

/** Allow long propose / LLM calls (Hobby max is lower; Pro supports 60s). */
export const config = {
  maxDuration: 60,
};
