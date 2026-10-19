import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as linkService from '../services/linkService.js';

const ref = z.object({
  type: z.enum(['journal', 'writing', 'note', 'book', 'project', 'document', 'task', 'moneyIdea']),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});
const pair = z.object({ from: ref, to: ref });

export const linkRoutes = Router();
linkRoutes.use(authenticate, requirePermission('content:manage-own'));

/** Everything linked to one item, in either direction. */
linkRoutes.get(
  '/',
  validate({ query: ref }),
  asyncHandler(async (req, res) => {
    res.json({
      items: await linkService.listLinks(ctxOf(req), req.query as unknown as z.infer<typeof ref>),
    });
  }),
);

linkRoutes.post(
  '/',
  validate({ body: pair }),
  asyncHandler(async (req, res) => {
    await linkService.addLink(ctxOf(req), req.body.from, req.body.to);
    res.status(204).end();
  }),
);

linkRoutes.post(
  '/remove',
  validate({ body: pair }),
  asyncHandler(async (req, res) => {
    await linkService.removeLink(ctxOf(req), req.body.from, req.body.to);
    res.status(204).end();
  }),
);
