import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import * as userService from '../services/userService.js';

const listQuery = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(25),
  cursor: z.string().optional(),
});
type ListQuery = z.infer<typeof listQuery>;

const idParams = z.object({ id: z.string().min(1).max(128) });
const updateBody = z
  .object({
    role: z.enum(['user', 'admin', 'superadmin']).optional(),
    disabled: z.boolean().optional(),
  })
  .strict()
  .refine((v) => v.role !== undefined || v.disabled !== undefined, 'Nothing to update');

export const userRoutes = Router();
userRoutes.use(authenticate);

userRoutes.get(
  '/',
  requirePermission('users:read'),
  validate({ query: listQuery }),
  asyncHandler(async (req, res) => {
    const { limit, cursor } = req.query as unknown as ListQuery;
    res.json(await userService.listUsers(limit, cursor));
  }),
);

userRoutes.patch(
  '/:id',
  requirePermission('users:update'),
  validate({ params: idParams, body: updateBody }),
  asyncHandler(async (req, res) => {
    res.json({ user: await userService.updateUser(req.user!, req.params.id!, req.body) });
  }),
);
