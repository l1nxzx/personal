import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as momentService from '../services/momentService.js';
import * as reviewService from '../services/reviewService.js';
import { idParams, localDate } from './schemas.js';

/** Weekly reviews and the life timeline. */

const answer = z.string().max(20_000).optional();
const reviewBody = z
  .object({ happened: answer, learned: answer, accomplished: answer, work: answer, focus: answer })
  .strict();
const weekParams = z.object({ week: localDate });

export const reviewRoutes = Router();
reviewRoutes.use(authenticate, requirePermission('content:manage-own'));

reviewRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await reviewService.listReviews(ctxOf(req)) });
  }),
);

/** The review for the week starting on `week` (a Monday), plus what the app knows about it. */
reviewRoutes.get(
  '/:week',
  validate({ params: weekParams }),
  asyncHandler(async (req, res) => {
    res.json(await reviewService.getReview(ctxOf(req), req.params.week!));
  }),
);

reviewRoutes.put(
  '/:week',
  validate({ params: weekParams, body: reviewBody }),
  asyncHandler(async (req, res) => {
    res.json({ review: await reviewService.saveReview(ctxOf(req), req.params.week!, req.body) });
  }),
);

const refSchema = z.object({
  type: z.enum([
    'journal',
    'writing',
    'note',
    'book',
    'project',
    'document',
    'folder',
    'task',
    'moneyIdea',
  ]),
  id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/),
});
const momentFields = {
  date: localDate,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(20_000).optional(),
  ref: refSchema.nullable().optional(),
};

export const momentRoutes = Router();
momentRoutes.use(authenticate, requirePermission('content:manage-own'));

momentRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await momentService.listMoments(ctxOf(req)) });
  }),
);

momentRoutes.post(
  '/',
  validate({ body: z.object(momentFields) }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ moment: await momentService.addMoment(ctxOf(req), req.body) });
  }),
);

momentRoutes.patch(
  '/:id',
  validate({
    params: idParams,
    body: z
      .object({ ...momentFields, date: localDate.optional(), title: momentFields.title.optional() })
      .strict(),
  }),
  asyncHandler(async (req, res) => {
    res.json({ moment: await momentService.updateMoment(ctxOf(req), req.params.id!, req.body) });
  }),
);

momentRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await momentService.deleteMoment(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);
