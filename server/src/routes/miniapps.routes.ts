import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { imageUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as service from '../services/miniappService.js';

/** Miniapps: install state, per-app data and the screen's wallpaper (see client/miniapps/). */
const appId = z.string().regex(/^[a-z][a-z0-9-]{1,39}$/, 'Not a miniapp id');
const appParams = z.object({ appId });
const uploadLimiter = createLimiter({
  name: 'miniapp-wallpaper',
  windowMs: 60 * 60 * 1000,
  max: 30,
});

export const miniappRoutes = Router();
miniappRoutes.use(authenticate, requirePermission('content:manage-own'));

miniappRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ state: await service.getState(ctxOf(req)) });
  }),
);

miniappRoutes.put(
  '/apps/:appId',
  validate({
    params: appParams,
    body: z.object({ enabled: z.boolean().optional(), onHome: z.boolean().optional() }).strict(),
  }),
  asyncHandler(async (req, res) => {
    await service.setInstall(ctxOf(req), req.params.appId!, req.body);
    res.json({ state: await service.getState(ctxOf(req)) });
  }),
);

miniappRoutes.put(
  '/order',
  validate({ body: z.object({ order: z.array(appId).max(200) }).strict() }),
  asyncHandler(async (req, res) => {
    await service.setOrder(ctxOf(req), req.body.order);
    res.status(204).end();
  }),
);

const tile = z.string().regex(/^(widget:)?[a-z][a-z0-9-]{1,39}$/, 'Not a tile');
miniappRoutes.put(
  '/layout',
  validate({ body: z.object({ layout: z.array(tile).max(300) }).strict() }),
  asyncHandler(async (req, res) => {
    await service.setLayout(ctxOf(req), req.body.layout);
    res.json({ state: await service.getState(ctxOf(req)) });
  }),
);

miniappRoutes.get(
  '/apps/:appId/data',
  validate({ params: appParams }),
  asyncHandler(async (req, res) => {
    res.json(await service.getData(ctxOf(req), req.params.appId!));
  }),
);

miniappRoutes.put(
  '/apps/:appId/data',
  validate({
    params: appParams,
    body: z
      .object({ data: z.unknown(), rev: z.number().int().min(0).nullable().optional() })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    res.json(
      await service.putData(ctxOf(req), req.params.appId!, req.body.data, req.body.rev ?? null),
    );
  }),
);

miniappRoutes.delete(
  '/apps/:appId/data',
  validate({ params: appParams }),
  asyncHandler(async (req, res) => {
    await service.deleteData(ctxOf(req), req.params.appId!);
    res.status(204).end();
  }),
);

miniappRoutes.put(
  '/wallpaper',
  validate({ body: z.object({ template: z.string().regex(/^[a-z][a-z0-9-]{1,30}$/) }).strict() }),
  asyncHandler(async (req, res) => {
    res.json({ settings: await service.setTemplateWallpaper(ctxOf(req), req.body.template) });
  }),
);

miniappRoutes.post(
  '/wallpaper',
  uploadLimiter,
  imageUpload,
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Choose a picture');
    res.json({ settings: await service.uploadWallpaper(ctxOf(req), req.file.buffer) });
  }),
);

/** The picture never changes for a version (a new upload gets a new one): cache it for good. */
miniappRoutes.get(
  '/wallpaper/:version',
  validate({ params: z.object({ version: z.string().regex(/^[0-9a-f]{16}$/) }) }),
  asyncHandler(async (req, res) => {
    const f = await service.openWallpaper(ctxOf(req), req.params.version!);
    res.set({
      'Content-Type': f.contentType,
      'Cache-Control': 'private, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    });
    await pipeline(f.stream, res);
  }),
);
