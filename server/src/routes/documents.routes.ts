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
import * as folderService from '../services/folderService.js';
import { idParams, tagList } from './schemas.js';

const id = z.string().regex(/^[A-Za-z0-9_-]{1,128}$/);

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(64).optional(),
  /** A folder id, or `root` for the top level. */
  folderId: id.optional(),
  q: z.string().max(200).optional(),
  favorite: z.enum(['true', 'false']).optional(),
  tag: z.string().max(64).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const uploadBody = z.object({ folderId: id.optional() });

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    folderId: id.nullable().optional(),
    tags: tagList.optional(),
    favorite: z.boolean().optional(),
  })
  .strict();

const folderName = z.string().trim().min(1).max(100);

const createFolderBody = z
  .object({ name: folderName, parentId: id.nullable().default(null) })
  .strict();

const updateFolderBody = z
  .object({ name: folderName.optional(), parentId: id.nullable().optional() })
  .strict();

const selection = z
  .object({
    fileIds: z.array(id).max(500).default([]),
    folderIds: z.array(id).max(200).default([]),
  })
  .strict();

const moveBody = selection.extend({ targetId: id.nullable() }).strict();

const usageBody = z.object({ ids: z.array(id).min(1).max(200) }).strict();

const deleteFolderQuery = z.object({ contents: z.enum(['move', 'delete']).optional() });

const fileQuery = z.object({ download: z.enum(['1']).optional() });

const uploadLimiter = createLimiter({ name: 'upload', windowMs: 60 * 60 * 1000, max: 200 });

/** `bytes=start-` or `bytes=start-end`; anything else (suffix, multi-range) gets the whole file. */
function parseRange(header: string | undefined): { start: number; end?: number } | undefined {
  const m = header?.match(/^bytes=(\d+)-(\d*)$/);
  if (!m) return undefined;
  const start = Number(m[1]);
  const end = m[2] ? Number(m[2]) : undefined;
  return end === undefined || end >= start ? { start, end } : undefined;
}

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

// ---------------------------------------------------------------- folders

documentRoutes.get(
  '/folders',
  asyncHandler(async (req, res) => {
    res.json({ items: await folderService.listFolders(ctxOf(req)) });
  }),
);

documentRoutes.post(
  '/folders',
  validate({ body: createFolderBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ folder: await folderService.createFolder(ctxOf(req), req.body) });
  }),
);

/** Counts what's inside some folders, so the client can say what a delete would remove. */
documentRoutes.post(
  '/folders/usage',
  validate({ body: usageBody }),
  asyncHandler(async (req, res) => {
    res.json(await folderService.folderUsage(ctxOf(req), req.body.ids));
  }),
);

documentRoutes.patch(
  '/folders/:id',
  validate({ params: idParams, body: updateFolderBody }),
  asyncHandler(async (req, res) => {
    res.json({
      folder: await folderService.updateFolder(ctxOf(req), req.params.id!, req.body),
    });
  }),
);

/** Refuses a non-empty folder (409 FOLDER_NOT_EMPTY) unless `contents` says what to do. */
documentRoutes.delete(
  '/folders/:id',
  validate({ params: idParams, query: deleteFolderQuery }),
  asyncHandler(async (req, res) => {
    const { contents } = req.query as z.infer<typeof deleteFolderQuery>;
    await folderService.deleteFolder(ctxOf(req), req.params.id!, contents);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- bulk actions

documentRoutes.post(
  '/move',
  validate({ body: moveBody }),
  asyncHandler(async (req, res) => {
    res.json(await folderService.moveItems(ctxOf(req), req.body));
  }),
);

/** Deletes files, and folders together with everything inside them. */
documentRoutes.post(
  '/delete',
  validate({ body: selection }),
  asyncHandler(async (req, res) => {
    await folderService.deleteItems(ctxOf(req), req.body);
    res.status(204).end();
  }),
);

// ---------------------------------------------------------------- files

/** multipart/form-data: file field `file`, optional text field `folderId`. */
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
 * else (HTML, SVG, scripts…) is always a download so it can't run on this origin. Byte ranges
 * are honoured so audio and video can seek (iOS won't play video without them).
 */
for (const which of ['file', 'thumb'] as const) {
  documentRoutes.get(
    `/:id/${which}`,
    validate({ params: idParams, query: fileQuery }),
    asyncHandler(async (req, res) => {
      const f = await documentService.openDocument(
        ctxOf(req),
        req.params.id!,
        which,
        parseRange(req.get('range')),
      );
      const download = req.query.download === '1' || !f.inline;
      res.set({
        'Content-Type': f.mime,
        'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        'Cache-Control': 'private, max-age=3600',
        'X-Content-Type-Options': 'nosniff',
        'Accept-Ranges': 'bytes',
        ...(f.mime === 'text/plain' && { 'Content-Security-Policy': 'sandbox' }),
      });
      if (f.range) {
        res.status(206).set({
          'Content-Range': `bytes ${f.range.start}-${f.range.end}/${f.size}`,
          'Content-Length': String(f.range.end - f.range.start + 1),
        });
      }
      await pipeline(f.stream, res);
    }),
  );
}
