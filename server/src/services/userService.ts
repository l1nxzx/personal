import type { PublicUser, UpdateUserRequest } from '../../../shared/types.js';
import * as refreshTokens from '../data/refreshTokenRepo.js';
import * as users from '../data/userRepo.js';
import { forbidden, notFound } from '../lib/errors.js';
import { canModifyUser, type AuthUser } from '../permissions.js';

export const toPublicUser = (u: users.UserRecord): PublicUser => ({
  id: u.id,
  email: u.email,
  displayName: u.displayName,
  role: u.role,
  disabled: u.disabled,
  createdAt: u.createdAt,
});

export async function listUsers(limit: number, cursor?: string) {
  const page = await users.list(limit, cursor);
  return { items: page.items.map(toPublicUser), nextCursor: page.nextCursor };
}

export async function updateUser(
  actor: AuthUser,
  targetId: string,
  change: UpdateUserRequest,
): Promise<PublicUser> {
  const target = await users.findById(targetId);
  if (!target) throw notFound('User not found');
  if (!canModifyUser(actor, target, change)) throw forbidden();

  await users.update(targetId, change);
  // Disabling takes effect immediately for refresh; access tokens expire within their short TTL.
  if (change.disabled) await refreshTokens.revokeAllForUser(targetId);

  return toPublicUser({ ...target, ...change });
}
