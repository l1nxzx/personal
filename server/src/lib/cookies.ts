import type { CookieOptions, Response } from 'express';
import { env, isProd } from '../config/env.js';

export const ACCESS_COOKIE = 'access_token';
export const REFRESH_COOKIE = 'refresh_token';

const base: CookieOptions = {
  httpOnly: true,
  secure: isProd,
  sameSite: env.COOKIE_SAMESITE,
};
// The refresh cookie is only ever sent to the auth endpoints.
const accessOpts: CookieOptions = { ...base, path: '/' };
const refreshOpts: CookieOptions = { ...base, path: '/api/auth' };

export function setAuthCookies(
  res: Response,
  tokens: { accessToken: string; refreshToken: string },
) {
  res.cookie(ACCESS_COOKIE, tokens.accessToken, {
    ...accessOpts,
    maxAge: env.ACCESS_TOKEN_TTL_SECONDS * 1000,
  });
  res.cookie(REFRESH_COOKIE, tokens.refreshToken, {
    ...refreshOpts,
    maxAge: env.REFRESH_TOKEN_TTL_SECONDS * 1000,
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie(ACCESS_COOKIE, accessOpts);
  res.clearCookie(REFRESH_COOKIE, refreshOpts);
}
