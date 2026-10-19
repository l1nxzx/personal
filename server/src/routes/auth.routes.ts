import { Router } from 'express';
import { z } from 'zod';
import type { AuthResponse } from '../../../shared/types.js';
import { clearAuthCookies, REFRESH_COOKIE, setAuthCookies } from '../lib/cookies.js';
import { asyncHandler } from '../lib/asyncHandler.js';
import { unauthorized } from '../lib/errors.js';
import { authenticate } from '../middleware/auth.js';
import { createLimiter } from '../middleware/rateLimit.js';
import { validate } from '../middleware/validate.js';
import * as authService from '../services/authService.js';

const email = z.string().trim().toLowerCase().email().max(254);
// bcrypt only uses the first 72 bytes, so cap there.
const password = z.string().min(8).max(72);

const registerBody = z.object({
  email,
  password,
  displayName: z.string().trim().min(1).max(60),
});
const loginBody = z.object({ email, password: z.string().min(1).max(72) });

const authLimiter = createLimiter({ name: 'auth', windowMs: 15 * 60 * 1000, max: 20 });

export const authRoutes = Router();

authRoutes.post(
  '/register',
  authLimiter,
  validate({ body: registerBody }),
  asyncHandler(async (req, res) => {
    const { user, ...tokens } = await authService.register(req.body);
    setAuthCookies(res, tokens);
    res.status(201).json({ user } satisfies AuthResponse);
  }),
);

authRoutes.post(
  '/login',
  authLimiter,
  validate({ body: loginBody }),
  asyncHandler(async (req, res) => {
    const { user, ...tokens } = await authService.login(req.body);
    setAuthCookies(res, tokens);
    res.json({ user } satisfies AuthResponse);
  }),
);

authRoutes.post(
  '/refresh',
  asyncHandler(async (req, res) => {
    const token = req.cookies?.[REFRESH_COOKIE] as string | undefined;
    if (!token) throw unauthorized('No session', 'REFRESH_INVALID');
    try {
      const { user, ...tokens } = await authService.refresh(token);
      setAuthCookies(res, tokens);
      res.json({ user } satisfies AuthResponse);
    } catch (err) {
      clearAuthCookies(res);
      throw err;
    }
  }),
);

authRoutes.post(
  '/logout',
  asyncHandler(async (req, res) => {
    await authService.logout(req.cookies?.[REFRESH_COOKIE]);
    clearAuthCookies(res);
    res.status(204).end();
  }),
);

authRoutes.get(
  '/me',
  authenticate,
  asyncHandler(async (req, res) => {
    const user = await authService.getMe(req.user!.id);
    res.json({ user } satisfies AuthResponse);
  }),
);

authRoutes.patch(
  '/me',
  authenticate,
  validate({ body: z.object({ displayName: z.string().trim().min(1).max(60) }).strict() }),
  asyncHandler(async (req, res) => {
    const user = await authService.updateProfile(req.user!.id, req.body.displayName);
    res.json({ user } satisfies AuthResponse);
  }),
);

authRoutes.post(
  '/password',
  authLimiter,
  authenticate,
  validate({
    body: z.object({ currentPassword: z.string().min(1).max(72), newPassword: password }),
  }),
  asyncHandler(async (req, res) => {
    const { user, ...tokens } = await authService.changePassword(
      req.user!.id,
      req.body.currentPassword,
      req.body.newPassword,
    );
    setAuthCookies(res, tokens);
    res.json({ user } satisfies AuthResponse);
  }),
);
