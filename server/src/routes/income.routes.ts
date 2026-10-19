import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as incomeService from '../services/incomeService.js';
import { idParams, localDate } from './schemas.js';

const fields = {
  date: localDate,
  source: z.string().trim().min(1, 'Where did it come from?').max(80),
  amountMinor: z.number().int().positive('Enter an amount').max(1e13),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code'),
  description: z.string().max(2000).optional(),
  status: z.enum(['received', 'pending']).optional(),
};

const createBody = z.object(fields);
const updateBody = z
  .object({
    date: fields.date.optional(),
    source: fields.source.optional(),
    amountMinor: fields.amountMinor.optional(),
    currency: fields.currency.optional(),
    description: fields.description,
    status: fields.status,
  })
  .strict();

const listQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

export const incomeRoutes = Router();
incomeRoutes.use(authenticate, requirePermission('content:manage-own'));

incomeRoutes.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    res.json(await incomeService.listIncome(ctxOf(req), req.query as unknown as ListQuery));
  }),
);

/** Monthly totals by currency and source, from the running summary (one read). */
incomeRoutes.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ summary: await incomeService.incomeSummary(ctxOf(req)) });
  }),
);

incomeRoutes.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ entry: await incomeService.addIncome(ctxOf(req), req.body) });
  }),
);

incomeRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ entry: await incomeService.updateIncome(ctxOf(req), req.params.id!, req.body) });
  }),
);

incomeRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await incomeService.deleteIncome(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);
