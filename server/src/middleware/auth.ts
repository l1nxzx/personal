import type { NextFunction, Request, Response } from 'express';
import { ACCESS_COOKIE } from '../lib/cookies.js';
import { unauthorized } from '../lib/errors.js';
import { verifyAccessToken } from '../lib/tokens.js';

/** Authentication only (who are you?). Authorization lives in permissions.ts. */
export function authenticate(req: Request, _res: Response, next: NextFunction) {
  const token = req.cookies?.[ACCESS_COOKIE] as string | undefined;
  if (!token) return next(unauthorized());
  try {
    req.user = verifyAccessToken(token);
    next();
  } catch (err) {
    next(err);
  }
}
