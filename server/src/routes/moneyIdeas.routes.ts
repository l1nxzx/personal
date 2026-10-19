import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as moneyIdeaService from '../services/moneyIdeaService.js';
import { idParams, localDate } from './schemas.js';

const status = z.enum(['idea', 'testing', 'running', 'dropped']);
const currency = z.string().regex(/^[A-Z]{3}$/);
const hours = z.number().min(0).max(100_000).nullable();
const minor = z.number().int().min(0).max(1e13).nullable();
const text = (max: number) => z.string().max(max);

const experiment = z.object({
  id: z.string().min(1).max(64),
  date: localDate,
  tried: text(10_000),
  outcome: text(10_000),
  lessons: text(10_000),
  hours,
  spentMinor: minor,
  currency: currency.nullable(),
});

const createBody = z.object({ name: z.string().trim().min(1).max(200), status: status.optional() });

const updateBody = z
  .object({
    name: z.string().trim().min(1).max(200).optional(),
    description: text(20_000).optional(),
    whyItMightWork: text(20_000).optional(),
    nextStep: text(1000).optional(),
    status: status.optional(),
    notes: text(100_000).optional(),
    hours: hours.optional(),
    spentMinor: minor.optional(),
    currency: currency.nullable().optional(),
    experiments: z.array(experiment).max(500).optional(),
    projectId: z.string().max(128).nullable().optional(),
    incomeSources: z.array(z.string().max(80)).max(50).optional(),
    archived: z.boolean().optional(),
  })
  .strict();

const listQuery = z.object({ archived: z.enum(['true', 'false']).default('false') });

export const moneyIdeaRoutes = Router();
moneyIdeaRoutes.use(authenticate, requirePermission('content:manage-own'));

moneyIdeaRoutes.get(
  '/',
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    res.json({
      items: await moneyIdeaService.listIdeas(ctxOf(req), {
        archived: req.query.archived === 'true',
      }),
    });
  }),
);

moneyIdeaRoutes.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ idea: await moneyIdeaService.createIdea(ctxOf(req), req.body) });
  }),
);

moneyIdeaRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ idea: await moneyIdeaService.getIdea(ctxOf(req), req.params.id!) });
  }),
);

moneyIdeaRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ idea: await moneyIdeaService.updateIdea(ctxOf(req), req.params.id!, req.body) });
  }),
);

moneyIdeaRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await moneyIdeaService.deleteIdea(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);

/** Turn into a project that stays connected to the idea. */
moneyIdeaRoutes.post(
  '/:id/project',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.status(201).json(await moneyIdeaService.ideaToProject(ctxOf(req), req.params.id!));
  }),
);
