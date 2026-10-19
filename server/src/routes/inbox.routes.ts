import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import * as captureService from '../services/captureService.js';
import { ctxOf } from '../services/context.js';
import { idParams, localDate, localTime } from './schemas.js';

const captureBody = z.object({
  text: z.string().trim().min(1, 'Nothing to save').max(20_000),
  kind: z.enum(['note', 'idea', 'task', 'journal']).optional(),
  localDate,
  localTime,
});

const convertBody = z.object({
  to: z.enum(['task', 'journal', 'writing', 'note']),
  localDate,
  localTime,
});

export const inboxRoutes = Router();
inboxRoutes.use(authenticate, requirePermission('content:manage-own'));

/** Quick Capture. */
inboxRoutes.post(
  '/capture',
  validate({ body: captureBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await captureService.capture(ctxOf(req), req.body));
  }),
);

inboxRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await captureService.listInbox(ctxOf(req)) });
  }),
);

inboxRoutes.post(
  '/:id/convert',
  validate({ params: idParams, body: convertBody }),
  asyncHandler(async (req, res) => {
    res.json(await captureService.convertCapture(ctxOf(req), req.params.id!, req.body));
  }),
);

inboxRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await captureService.deleteCapture(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);
