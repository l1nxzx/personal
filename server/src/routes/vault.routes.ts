import express, { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as vaultService from '../services/vaultService.js';
import { idParams } from './schemas.js';

/**
 * Private Vault API. Request bodies are ciphertext and key material produced in the browser;
 * nothing here is ever logged (pino-http logs method, URL and status, not bodies).
 */

const b64 = (max: number) =>
  z
    .string()
    .regex(/^[A-Za-z0-9+/=]+$/, 'Expected base64')
    .max(max);

const metaInput = z
  .object({
    salt: b64(64),
    iterations: z.number().int().min(100_000).max(10_000_000),
    wrappedKey: b64(256),
    wrapIv: b64(32),
  })
  .strict();

const itemInput = z
  .object({
    iv: b64(32),
    // ~1 MB Firestore document limit, base64 overhead included.
    data: b64(900_000),
    expectedUpdatedAt: z.string().max(40).optional(),
  })
  .strict();

const password = z.object({ password: z.string().min(1).max(72) });

const sensitiveLimiter = createLimiter({ name: 'vault-auth', windowMs: 15 * 60 * 1000, max: 20 });

export const vaultRoutes = Router();
vaultRoutes.use(authenticate, requirePermission('content:manage-own'));

vaultRoutes.get(
  '/meta',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ meta: await vaultService.getMeta(ctxOf(req)) });
  }),
);

vaultRoutes.post(
  '/meta',
  validate({ body: metaInput }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ meta: await vaultService.setupVault(ctxOf(req), req.body) });
  }),
);

/** New passphrase (the vault key re-wrapped in the browser); needs the account password too. */
vaultRoutes.put(
  '/meta',
  sensitiveLimiter,
  validate({ body: metaInput.extend(password.shape) }),
  asyncHandler(async (req, res) => {
    const { password: pw, ...meta } = req.body;
    res.json({ meta: await vaultService.changePassphrase(ctxOf(req), meta, pw) });
  }),
);

/** Wipe the vault (a forgotten passphrase can't be recovered). Needs the account password. */
vaultRoutes.post(
  '/reset',
  sensitiveLimiter,
  validate({ body: password }),
  asyncHandler(async (req, res) => {
    await vaultService.resetVault(ctxOf(req), req.body.password);
    res.status(204).end();
  }),
);

vaultRoutes.get(
  '/items',
  asyncHandler(async (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ items: await vaultService.listItems(ctxOf(req)) });
  }),
);

vaultRoutes.post(
  '/items',
  express.json({ limit: '2mb' }),
  validate({ body: itemInput }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ item: await vaultService.createItem(ctxOf(req), req.body) });
  }),
);

vaultRoutes.put(
  '/items/:id',
  express.json({ limit: '2mb' }),
  validate({ params: idParams, body: itemInput }),
  asyncHandler(async (req, res) => {
    res.json({ item: await vaultService.updateItem(ctxOf(req), req.params.id!, req.body) });
  }),
);

vaultRoutes.delete(
  '/items/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await vaultService.deleteItem(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

/** Encrypted file bytes for a vault document item (raw body, application/octet-stream). */
vaultRoutes.put(
  '/files/:id',
  express.raw({ type: 'application/octet-stream', limit: '36mb' }),
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    if (!Buffer.isBuffer(req.body) || !req.body.length) {
      res
        .status(400)
        .json({ error: { code: 'BAD_REQUEST', message: 'Expected encrypted file bytes' } });
      return;
    }
    await vaultService.putFile(ctxOf(req), req.params.id!, req.body);
    res.status(204).end();
  }),
);

vaultRoutes.get(
  '/files/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    const stream = await vaultService.openFile(ctxOf(req), req.params.id!);
    res.set({ 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    await pipeline(stream, res);
  }),
);
