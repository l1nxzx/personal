/**
 * The single home for authorization logic. Routes and services ask this module
 * "can this actor do X?"; nothing else compares roles directly.
 */
import type { NextFunction, Request, Response } from 'express';
import type { Role } from '../../shared/types.js';
import { forbidden, unauthorized } from './lib/errors.js';

export interface AuthUser {
  id: string;
  role: Role;
}

/**
 * `content:manage-own` covers everything in a person's own space (journal, writing, tasks, inbox,
 * search, prefs). Content is stored under users/{uid}, so nobody, admins included, can reach
 * another user's content through the API.
 */
export type Permission = 'content:manage-own' | 'users:read' | 'users:update';

const ROLE_RANK: Record<Role, number> = { user: 0, admin: 1, superadmin: 2 };

const ROLE_PERMISSIONS: Record<Role, readonly Permission[]> = {
  user: ['content:manage-own'],
  admin: ['content:manage-own', 'users:read', 'users:update'],
  superadmin: ['content:manage-own', 'users:read', 'users:update'],
};

export const isRole = (value: unknown): value is Role =>
  typeof value === 'string' && value in ROLE_RANK;

export function can(actor: Pick<AuthUser, 'role'>, permission: Permission): boolean {
  return ROLE_PERMISSIONS[actor.role]?.includes(permission) ?? false;
}

/**
 * Rules for changing another user's role / disabled flag:
 * - needs `users:update`
 * - never your own account (prevents locking yourself or the last super admin out)
 * - superadmins may change anyone; others only users ranked strictly below them,
 *   and may only grant roles ranked strictly below their own.
 */
export function canModifyUser(
  actor: AuthUser,
  target: { id: string; role: Role },
  change: { role?: Role; disabled?: boolean },
): boolean {
  if (!can(actor, 'users:update')) return false;
  if (actor.id === target.id) return false;
  if (actor.role === 'superadmin') return true;
  if (ROLE_RANK[target.role] >= ROLE_RANK[actor.role]) return false;
  if (change.role !== undefined && ROLE_RANK[change.role] >= ROLE_RANK[actor.role]) return false;
  return true;
}

/** Route guard. Must run after `authenticate`. */
export const requirePermission =
  (permission: Permission) => (req: Request, _res: Response, next: NextFunction) => {
    if (!req.user) return next(unauthorized());
    if (!can(req.user, permission)) return next(forbidden());
    next();
  };
