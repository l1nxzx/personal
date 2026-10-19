import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as taskService from '../services/taskService.js';
import { idParams, localDate } from './schemas.js';

const title = z.string().trim().min(1).max(300);
const priority = z.enum(['none', 'low', 'high']);

const createBody = z.object({
  title,
  notes: z.string().max(20_000).optional(),
  dueDate: localDate.nullable().optional(),
  plannedDate: localDate.nullable().optional(),
  priority: priority.optional(),
  projectId: z.string().max(128).nullable().optional(),
});

const updateBody = z
  .object({
    title: title.optional(),
    notes: z.string().max(20_000).optional(),
    dueDate: localDate.nullable().optional(),
    plannedDate: localDate.nullable().optional(),
    priority: priority.optional(),
    status: z.enum(['open', 'done']).optional(),
    projectId: z.string().max(128).nullable().optional(),
    subtasks: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: z.string().trim().min(1).max(300),
          done: z.boolean(),
        }),
      )
      .max(100)
      .optional(),
  })
  .strict();

const doneQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().max(64).optional(),
});
type DoneQuery = z.infer<typeof doneQuery>;

export const taskRoutes = Router();
taskRoutes.use(authenticate, requirePermission('content:manage-own'));

taskRoutes.get(
  '/open',
  asyncHandler(async (req, res) => {
    res.json({ items: await taskService.listOpen(ctxOf(req)) });
  }),
);

taskRoutes.get(
  '/done',
  validate({ query: doneQuery }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as DoneQuery;
    res.json(await taskService.listDone(ctxOf(req), limit, cursor));
  }),
);

taskRoutes.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ task: await taskService.createTask(ctxOf(req), req.body) });
  }),
);

taskRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ task: await taskService.getTask(ctxOf(req), req.params.id!) });
  }),
);

taskRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ task: await taskService.updateTask(ctxOf(req), req.params.id!, req.body) });
  }),
);

taskRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await taskService.deleteTask(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);
