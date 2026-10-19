import { Router } from 'express';
import { pipeline } from 'node:stream/promises';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { badRequest } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { documentUpload } from '../middleware/upload.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as documentService from '../services/documentService.js';
import { idParams, tagList } from './schemas.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(64).optional(),
  folder: z.string().max(80).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  tag: z.string().max(64).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const uploadBody = z.object({ folder: z.string().max(80).optional() });

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    folder: z.string().max(80).nullable().optional(),
    tags: tagList.optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

const fileQuery = z.object({ download: z.enum(['1']).optional() });

const uploadLimiter = createLimiter({ name: 'upload', windowMs: 60 * 60 * 1000, max: 200 });

export const documentRoutes = Router();
documentRoutes.use(authenticate, requirePermission('content:manage-own'));

documentRoutes.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const q = req.query as unknown as ListQuery;
    res.json(
      await documentService.listDocuments(ctxOf(req), { ...q, favorite: q.favorite === 'true' }),
    );
  }),
);

documentRoutes.get(
  '/folders',
  asyncHandler(async (req, res) => {
    res.json({ items: await documentService.listFolders(ctxOf(req)) });
  }),
);

/** multipart/form-data: file field `file`, optional text field `folder`. */
documentRoutes.post(
  '/',
  uploadLimiter,
  documentUpload,
  validate({ body: uploadBody }),
  asyncHandler(async (req, res) => {
    if (!req.file) throw badRequest('Choose a file to upload');
    // multer decodes the filename as latin1; browsers send UTF-8.
    const originalname = Buffer.from(req.file.originalname, 'latin1').toString('utf8');
    const doc = await documentService.uploadDocument(
      ctxOf(req),
      { ...req.file, originalname },
      req.body,
    );
    res.status(201).json({ document: doc });
  }),
);

documentRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ document: await documentService.getDocument(ctxOf(req), req.params.id!) });
  }),
);

documentRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({
      document: await documentService.updateDocument(ctxOf(req), req.params.id!, req.body),
    });
  }),
);

documentRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await documentService.deleteDocument(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

/**
 * The file itself, streamed from private storage. Only safe types are shown inline; everything
 * else (HTML, SVG, scripts…) is always a download so it can't run on this origin.
 */
for (const which of ['file', 'thumb'] as const) {
  documentRoutes.get(
    `/:id/${which}`,
    validate({ params: idParams, query: fileQuery }),
    asyncHandler(async (req, res) => {
      const f = await documentService.openDocument(ctxOf(req), req.params.id!, which);
      const download = req.query.download === '1' || !f.inline;
      res.set({
        'Content-Type': f.mime,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        ...(f.mime === 'text/plain' && { 'Content-Security-Policy': 'sandbox' }),
      });
      await pipeline(f.stream, res);
    }),
  );
}
