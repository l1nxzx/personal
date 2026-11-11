import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as service from '../services/entryLockService.js';
import { idParams } from './schemas.js';

/**
 * Opening encrypted entries: the entries key (encrypted with the vault key) and per-device PIN
 * records. Bodies are key material made in the browser; never logged.
 */
const b64 = (max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/=]+$/, 'Expected base64')
    .max(max);
const keyId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);
const deviceId = z.string().regex(/^[A-Za-z0-9_-]{8,64}$/);

// PIN attempts per account; the per-device limit of 5 is enforced on the record itself.
const pinLimiter = createLimiter({ name: 'entry-pin', windowMs: 15 * 60 * 1000, max: 30 });

export const entryLockRoutes = Router();
entryLockRoutes.use(authenticate, requirePermission('content:manage-own'));

entryLockRoutes.get(
  '/key',
  asyncHandler(async (req, res) => {
    res.json({ key: await service.getKey(ctxOf(req)) });
  }),
);

entryLockRoutes.post(
  '/key',
  validate({ body: z.object({ keyId, iv: b64(32), data: b64(256) }).strict() }),
  asyncHandler(async (req, res) => {
    res.json({ key: await service.createKey(ctxOf(req), req.body) });
  }),
);

entryLockRoutes.get(
  '/devices',
  asyncHandler(async (req, res) => {
    res.json({ items: await service.listDevices(ctxOf(req)) });
  }),
);

entryLockRoutes.post(
  '/devices',
  validate({
    body: z.object({ deviceId, verifier: b64(64), keyId, label: z.string().max(120) }).strict(),
  }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await service.enroll(ctxOf(req), req.body));
  }),
);

entryLockRoutes.delete(
  '/devices/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await service.removeDevice(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

entryLockRoutes.post(
  '/unlock',
  pinLimiter,
  validate({ body: z.object({ deviceId, verifier: b64(64) }).strict() }),
  asyncHandler(async (req, res) => {
    res.json(await service.unlock(ctxOf(req), req.body));
  }),
);

/** Encrypted entries still sealed with the vault key, to re-seal with the entries key. */
entryLockRoutes.get(
  '/legacy',
  validate({ query: z.object({ keyId }) }),
  asyncHandler(async (req, res) => {
    res.json({ items: await service.legacyEntries(ctxOf(req), req.query.keyId as string) });
  }),
);
