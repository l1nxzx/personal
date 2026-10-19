import { Router } from 'express';
import { authenticate } from '../middleware/auth.js';
import { subscribeToUser } from '../services/eventService.js';

const HEARTBEAT_MS = 25_000; // keeps idle connections alive through proxies

export const eventRoutes = Router();

// Server-Sent Events stream for the signed-in user.
eventRoutes.get('/', authenticate, (req, res) => {
  res.set({
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });
  res.flushHeaders();
  res.write('retry: 5000\n\n');

  const unsubscribe = subscribeToUser(req.user!.id, (event) => {
    res.write(`data: ${JSON.stringify(event)}\n\n`);
  });
  const heartbeat = setInterval(() => res.write(': ping\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
});
