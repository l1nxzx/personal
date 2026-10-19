import { createApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './lib/logger.js';
import { closeRedis } from './lib/redis.js';

const server = createApp().listen(env.PORT, () => {
  logger.info(`API listening on :${env.PORT} (${env.NODE_ENV})`);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  server.close(() => {
    closeRedis().finally(() => process.exit(0));
  });
  server.closeAllConnections(); // ends long-lived SSE streams so close() can finish
  setTimeout(() => process.exit(1), 10_000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('unhandledRejection', (err) => logger.error({ err }, 'unhandled rejection'));
