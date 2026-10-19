import { randomUUID } from 'node:crypto';
import type { LoginRequest, PublicUser, RegisterRequest } from '../../../shared/types.js';
import { env } from '../config/env.js';
import * as refreshTokens from '../data/refreshTokenRepo.js';
import * as users from '../data/userRepo.js';
import { forbidden, notFound, unauthorized } from '../lib/errors.js';
import { DUMMY_HASH, hashPassword, verifyPassword } from '../lib/password.js';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../lib/tokens.js';
import { toPublicUser } from './userService.js';

export interface Session {
  user: PublicUser;
  accessToken: string;
  refreshToken: string;
}

async function startSession(user: users.UserRecord): Promise<Session> {
  const jti = randomUUID();
  await refreshTokens.save(
    jti,
    user.id,
    new Date(Date.now() + env.REFRESH_TOKEN_TTL_SECONDS * 1000),
  );
  return {
    user: toPublicUser(user),
    accessToken: signAccessToken(user),
    refreshToken: signRefreshToken(user.id, jti),
  };
}

export async function register(input: RegisterRequest): Promise<Session> {
  if (!env.ALLOW_REGISTRATION) throw forbidden('Registration is closed', 'REGISTRATION_CLOSED');
  const user = await users.create({
    email: input.email,
    displayName: input.displayName,
    passwordHash: await hashPassword(input.password),
    role: 'user',
    disabled: false,
    createdAt: new Date().toISOString(),
  });
  return startSession(user);
}

export async function login(input: LoginRequest): Promise<Session> {
  const user = await users.findByEmail(input.email);
  const passwordOk = await verifyPassword(input.password, user?.passwordHash ?? DUMMY_HASH);
  if (!user || !passwordOk) throw unauthorized('Invalid email or password', 'INVALID_CREDENTIALS');
  if (user.disabled) throw forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
  return startSession(user);
}

/** Rotates the refresh token: the presented one is consumed and a new pair is issued. */
export async function refresh(refreshToken: string): Promise<Session> {
  const { userId, jti } = verifyRefreshToken(refreshToken);
  const consumed = await refreshTokens.consume(jti);
  if (!consumed || consumed.userId !== userId) {
    throw unauthorized('Session expired', 'REFRESH_INVALID');
  }

  const user = await users.findById(userId);
  if (!user) throw unauthorized('Session expired', 'REFRESH_INVALID');
  if (user.disabled) {
    await refreshTokens.revokeAllForUser(userId);
    throw forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
  }
  // Role comes from the database here, so role changes propagate at the next refresh.
  return startSession(user);
}

export async function logout(refreshToken: string | undefined): Promise<void> {
  if (!refreshToken) return;
  try {
    await refreshTokens.consume(verifyRefreshToken(refreshToken).jti);
  } catch {
    // Already invalid: nothing to revoke.
  }
}

export async function updateProfile(userId: string, displayName: string): Promise<PublicUser> {
  const user = await users.findById(userId);
  if (!user) throw notFound('User not found');
  await users.update(userId, { displayName });
  return toPublicUser({ ...user, displayName });
}

/** Changes the password and signs out every other session. Returns a fresh session for this one. */
export async function changePassword(
  userId: string,
  currentPassword: string,
  newPassword: string,
): Promise<Session> {
  const user = await users.findById(userId);
  if (!user) throw notFound('User not found');
  if (!(await verifyPassword(currentPassword, user.passwordHash))) {
    throw unauthorized('Current password is incorrect', 'INVALID_CREDENTIALS');
  }
  const passwordHash = await hashPassword(newPassword);
  await users.update(userId, { passwordHash });
  await refreshTokens.revokeAllForUser(userId);
  return startSession({ ...user, passwordHash });
}

export async function getMe(userId: string): Promise<PublicUser> {
  const user = await users.findById(userId);
  if (!user) throw notFound('User not found');
  if (user.disabled) throw forbidden('This account has been disabled', 'ACCOUNT_DISABLED');
  return toPublicUser(user);
}
