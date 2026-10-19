import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import * as bookService from '../services/bookService.js';
import { ctxOf } from '../services/context.js';
import { idParams, localDate } from './schemas.js';

const status = z.enum(['want', 'reading', 'finished', 'paused']);
const title = z.string().trim().min(1).max(300);
const author = z.string().trim().max(200);

const createBody = z.object({ title, author: author.optional(), status: status.optional() });

const updateBody = z
  .object({
    title: title.optional(),
    author: author.optional(),
    status: status.optional(),
    rating: z.number().int().min(1).max(5).nullable().optional(),
    startedOn: localDate.nullable().optional(),
    finishedOn: localDate.nullable().optional(),
    notes: z.string().max(200_000).optional(),
    quotes: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          text: z.string().trim().min(1).max(10_000),
          page: z.string().trim().max(20).nullable(),
          note: z.string().max(10_000),
        }),
      )
      .max(1000)
      .optional(),
  })
  .strict();

const listQuery = z.object({ status: status.default('reading') });
const quoteParams = idParams.extend({ quoteId: z.string().min(1).max(64) });

export const bookRoutes = Router();
bookRoutes.use(authenticate, requirePermission('content:manage-own'));

bookRoutes.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { status: s } = req.query as unknown as z.infer<typeof listQuery>;
    res.json({ items: await bookService.listBooks(ctxOf(req), s) });
  }),
);

bookRoutes.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ book: await bookService.createBook(ctxOf(req), req.body) });
  }),
);

bookRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ book: await bookService.getBook(ctxOf(req), req.params.id!) });
  }),
);

bookRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ book: await bookService.updateBook(ctxOf(req), req.params.id!, req.body) });
  }),
);

bookRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await bookService.deleteBook(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

/** Saves a quote as a note in Ideas & Knowledge, linked to the book. */
bookRoutes.post(
  '/:id/quotes/:quoteId/note',
  validate({ params: quoteParams }),
  asyncHandler(async (req, res) => {
    res.status(201).json({
      entry: await bookService.quoteToNote(ctxOf(req), req.params.id!, req.params.quoteId!),
    });
  }),
);
