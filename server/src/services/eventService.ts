import { EventEmitter } from 'node:events';
import type { ServerEvent } from '../../../shared/types.js';
import { logger } from '../lib/logger.js';
import { createSubscriber, getRedis } from '../lib/redis.js';

/**
 * Per-user realtime event bus feeding SSE connections.
 * Single instance: a local EventEmitter. With REDIS_URL set, events go through Redis pub/sub so a
 * connection held by instance A receives events produced by instance B.
 */
const CHANNEL = 'events';
const local = new EventEmitter();
local.setMaxListeners(0);

type Envelope = { userId: string; event: ServerEvent };
let subscribed = false;

function ensureRedisSubscription() {
  if (subscribed) return;
  const sub = createSubscriber();
  if (!sub) return;
  subscribed = true;
  sub.subscribe(CHANNEL).catch((err) => logger.error({ err }, 'redis subscribe failed'));
  sub.on('message', (_channel, message) => {
    try {
      const { userId, event } = JSON.parse(message) as Envelope;
      local.emit(userId, event);
    } catch (err) {
      logger.warn({ err }, 'bad event message');
    }
  });
}

export function publishToUser(userId: string, event: ServerEvent): void {
  const redis = getRedis();
  if (redis) {
    redis
      .publish(CHANNEL, JSON.stringify({ userId, event } satisfies Envelope))
      .catch((err) => logger.error({ err }, 'redis publish failed'));
  } else {
    local.emit(userId, event);
  }
}

/** Returns an unsubscribe function. */
export function subscribeToUser(
  userId: string,
  listener: (event: ServerEvent) => void,
): () => void {
  ensureRedisSubscription();
  local.on(userId, listener);
  return () => local.off(userId, listener);
}
