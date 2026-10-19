import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { env } from './config/env.js';
import { errorHandler, notFoundHandler } from './middleware/errorHandler.js';
import { createLimiter } from './middleware/rateLimit.js';
import { requestLogger } from './middleware/requestLogger.js';
import { apiRoutes } from './routes/index.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', 1); // Render terminates TLS; needed for correct client IPs and secure cookies

  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: env.CLIENT_ORIGIN.split(',').map((o) => o.trim()),
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' })); // long-form writing autosaves the whole body
  app.use(cookieParser());

  app.use('/api', createLimiter({ name: 'api', windowMs: 60 * 1000, max: 300 }), apiRoutes);

  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
}
