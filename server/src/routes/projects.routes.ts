import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import * as projectService from '../services/projectService.js';
import * as taskService from '../services/taskService.js';
import { idParams, localDate } from './schemas.js';

const status = z.enum(['active', 'paused', 'done']);
const name = z.string().trim().min(1).max(200);
const description = z.string().max(100_000);
const goal = z.string().trim().max(300);

const createBody = z.object({
  name,
  goal: goal.optional(),
  description: description.optional(),
  status: status.optional(),
  targetDate: localDate.nullable().optional(),
});

const updateBody = z
  .object({
    name: name.optional(),
    goal: goal.optional(),
    description: description.optional(),
    status: status.optional(),
    targetDate: localDate.nullable().optional(),
    milestones: z
      .array(
        z.object({
          id: z.string().min(1).max(64),
          title: z.string().trim().min(1).max(300),
          date: localDate.nullable(),
          done: z.boolean(),
        }),
      )
      .max(100)
      .optional(),
  })
  .strict();

export const projectRoutes = Router();
projectRoutes.use(authenticate, requirePermission('content:manage-own'));

projectRoutes.get(
  '/',
  asyncHandler(async (req, res) => {
    res.json({ items: await projectService.listProjects(ctxOf(req)) });
  }),
);

/** Task totals per active or paused project, for progress. */
projectRoutes.get(
  '/task-counts',
  asyncHandler(async (req, res) => {
    res.json({ counts: await projectService.taskCounts(ctxOf(req)) });
  }),
);

projectRoutes.post(
  '/',
  validate({ body: createBody }),
  asyncHandler(async (req, res) => {
    res.status(201).json({ project: await projectService.createProject(ctxOf(req), req.body) });
  }),
);

projectRoutes.get(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ project: await projectService.getProject(ctxOf(req), req.params.id!) });
  }),
);

/** The project's tasks, open and done. */
projectRoutes.get(
  '/:id/tasks',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    res.json({ items: await taskService.listByProject(ctxOf(req), req.params.id!) });
  }),
);

projectRoutes.patch(
  '/:id',
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ project: await projectService.updateProject(ctxOf(req), req.params.id!, req.body) });
  }),
);

projectRoutes.delete(
  '/:id',
  validate({ params: idParams }),
  asyncHandler(async (req, res) => {
    await projectService.deleteProject(ctxOf(req), req.params.id!);
    res.status(204).end();
  }),
);
