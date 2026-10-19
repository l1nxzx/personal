import { rateLimit } from 'express-rate-limit';
import { RedisStore, type RedisReply } from 'rate-limit-redis';
import { isTest } from '../config/env.js';
import { getRedis } from '../lib/redis.js';

interface LimiterOptions {
  name: string;
  windowMs: number;
  max: number;
}

/** Counters live in Redis when configured (shared across instances), else in process memory. */
export function createLimiter({ name, windowMs, max }: LimiterOptions) {
  const redis = getRedis();
  return rateLimit({
    windowMs,
    limit: max,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    skip: () => isTest,
    message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, slow down' } },
    ...(redis && {
      store: new RedisStore({
        prefix: `rl:${name}:`,
        sendCommand: (command: string, ...args: string[]) =>
          redis.call(command, ...args) as Promise<RedisReply>,
      }),
    }),
  });
}
