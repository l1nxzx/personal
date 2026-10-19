import jwt from 'jsonwebtoken';
import type { Role } from '../../../shared/types.js';
import { env } from '../config/env.js';
import { unauthorized } from './errors.js';

const ALG = 'HS256';

export interface AccessClaims {
  id: string;
  role: Role;
}
export interface RefreshClaims {
  userId: string;
  jti: string;
}

export function signAccessToken(user: AccessClaims): string {
  return jwt.sign({ role: user.role }, env.JWT_ACCESS_SECRET, {
    algorithm: ALG,
    subject: user.id,
    expiresIn: env.ACCESS_TOKEN_TTL_SECONDS,
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  try {
    const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, { algorithms: [ALG] });
    if (typeof payload === 'string' || !payload.sub) throw new Error('bad payload');
    return { id: payload.sub, role: payload.role as Role };
  } catch {
    throw unauthorized('Invalid or expired token', 'TOKEN_INVALID');
  }
}

export function signRefreshToken(userId: string, jti: string): string {
  return jwt.sign({}, env.JWT_REFRESH_SECRET, {
    algorithm: ALG,
    subject: userId,
    jwtid: jti,
    expiresIn: env.REFRESH_TOKEN_TTL_SECONDS,
  });
}

export function verifyRefreshToken(token: string): RefreshClaims {
  try {
    const payload = jwt.verify(token, env.JWT_REFRESH_SECRET, { algorithms: [ALG] });
    if (typeof payload === 'string' || !payload.sub || !payload.jti) throw new Error('bad payload');
    return { userId: payload.sub, jti: payload.jti };
  } catch {
    throw unauthorized('Invalid or expired refresh token', 'REFRESH_INVALID');
  }
}
