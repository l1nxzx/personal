import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as expenseService from '../services/expenseService.js';
import { idParams, localDate } from './schemas.js';

const amountMinor = z.number().int().positive('Enter an amount').max(1e13);
const currency = z.string().regex(/^[A-Z]{3}$/, 'Use a 3-letter currency code');
const ref = z.string().max(128).nullable();

const expenseFields = {
  date: localDate,
  amountMinor,
  currency,
  category: z.string().max(80).optional(),
  description: z.string().max(2000).optional(),
  moneyIdeaId: ref.optional(),
  projectId: ref.optional(),
  subscriptionId: ref.optional(),
};
const createExpense = z.object(expenseFields);
const updateExpense = z
  .object({
    ...expenseFields,
    date: localDate.optional(),
    amountMinor: amountMinor.optional(),
    currency: currency.optional(),
  })
  .strict();

const frequency = z.enum(['weekly', 'monthly', 'quarterly', 'yearly']);
const createSub = z.object({
  name: z.string().trim().min(1).max(120),
  amountMinor,
  currency,
  frequency,
  nextRenewal: localDate.nullable().optional(),
  category: z.string().max(80).optional(),
  notes: z.string().max(5000).optional(),
  moneyIdeaId: ref.optional(),
  projectId: ref.optional(),
});
const updateSub = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    amountMinor: amountMinor.optional(),
    currency: currency.optional(),
    frequency: frequency.optional(),
    nextRenewal: localDate.nullable().optional(),
    category: z.string().max(80).optional(),
    notes: z.string().max(5000).optional(),
    active: z.boolean().optional(),
    moneyIdeaId: ref.optional(),
    projectId: ref.optional(),
  })
  .strict();

const listQuery = z.object({
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().max(200).optional(),
  moneyIdeaId: z.string().max(128).optional(),
  projectId: z.string().max(128).optional(),
});
type ListQuery = z.infer<typeof listQuery>;

export const expenseRoutes = Router();
expenseRoutes.use(authenticate, requirePermission('content:manage-own'));

expenseRoutes.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    res.json(await expenseService.listExpenses(ctxOf(req), req.query as unknown as ListQuery));
  }),
);

expenseRoutes.get(
  '/summary',
  asyncHandler(async (req, res) => {
    res.json({ summary: await expenseService.expenseSummary(ctxOf(req)) });
  }),
);

expenseRoutes.post(
  '/',
  validate({ body: createExpense }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ expense: await expenseService.addExpense(ctxOf(req), req.body) });
  }),
);

expenseRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateExpense }),
  asyncHandler(async (req, res) => {
    res.json({ expense: await expenseService.updateExpense(ctxOf(req), req.params.id!, req.body) });
  }),
);

expenseRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await expenseService.deleteExpense(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

export const subscriptionRoutes = Router();
subscriptionRoutes.use(authenticate, requirePermission('content:manage-own'));

subscriptionRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await expenseService.listSubscriptions(ctxOf(req)) });
  }),
);

subscriptionRoutes.post(
  '/',
  validate({ body: createSub }),
  asyncHandler(async (req, res) => {
    res
      .status(201)
      .json({ subscription: await expenseService.addSubscription(ctxOf(req), req.body) });
  }),
);

subscriptionRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateSub }),
  asyncHandler(async (req, res) => {
    res.json({
      subscription: await expenseService.updateSubscription(ctxOf(req), req.params.id!, req.body),
    });
  }),
);

subscriptionRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await expenseService.deleteSubscription(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

/** A renewal was paid: record it as a real expense and move the next renewal date on. */
subscriptionRoutes.post(
  '/:id/payments',
  validate({
    params: idParams,
    body: z.object({ date: localDate, amountMinor: amountMinor.optional() }),
  }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await expenseService.recordPayment(ctxOf(req), req.params.id!, req.body));
  }),
);
