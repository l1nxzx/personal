import { Redis } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from './logger.js';

// Redis is optional: with REDIS_URL unset everything falls back to in-process state,
// which is only correct for a single instance.
let client: Redis | null | undefined;

function connect(): Redis | null {
  if (!env.REDIS_URL) return null;
  const r = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
  r.on('error', (err) => logger.error({ err }, 'redis error'));
  return r;
}

export function getRedis(): Redis | null {
  if (client === undefined) client = connect();
  return client;
}

/** Pub/sub needs its own connection. */
export function createSubscriber(): Redis | null {
  return getRedis()?.duplicate() ?? null;
}

export async function closeRedis() {
  if (client) await client.quit();
}
