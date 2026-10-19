import { Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import { ctxOf } from '../services/context.js';
import { getHome } from '../services/homeService.js';
import { getPrefs, updatePrefs } from '../services/prefsService.js';
import { search } from '../services/searchService.js';
import { localDate } from './schemas.js';

/** Personal, cross-feature endpoints: home overview, preferences and universal search. */

const prefsBody = z
  .object({
    focusLine: z.string().trim().max(200).optional(),
    showPrompts: z.boolean().optional(),
    promptDismissedOn: localDate.nullable().optional(),
    writingFont: z.enum(['serif', 'sans']).optional(),
    baseCurrency: z
      .string()
      .regex(/^[A-Z]{3}$/)
      .optional(),
    showOnThisDay: z.boolean().optional(),
  })
  .strict();

const searchQuery = z.object({
  q: z.string().trim().max(200).default(''),
  types: z
    .string()
    .optional()
    .transform((s) => (s ? s.split(',') : undefined))
    .pipe(
      z
        .array(
          z.enum([
            'journal',
            'writing',
            'note',
            'task',
            'capture',
            'book',
            'project',
            'document',
            'income',
            'expense',
            'moneyIdea',
            'moment',
          ]),
        )
        .optional(),
    ),
});
type SearchQuery = z.infer<typeof searchQuery>;

export const meRoutes = Router();
meRoutes.use(authenticate, requirePermission('content:manage-own'));

meRoutes.get(
  '/home',
  validate({ query: z.object({ date: localDate.optional() }) }),
  asyncHandler(async (req, res) => {
    // `date` is the owner's local "today" (for On this day and decisions to revisit).
    res.json(await getHome(ctxOf(req), req.query.date as string | undefined));
  }),
);

meRoutes.get(
  '/prefs',
  asyncHandler(async (req, res) => {
    res.json({ prefs: await getPrefs(ctxOf(req)) });
  }),
);

meRoutes.patch(
  '/prefs',
  validate({ body: prefsBody }),
  asyncHandler(async (req, res) => {
    res.json({ prefs: await updatePrefs(ctxOf(req), req.body) });
  }),
);

meRoutes.get(
  '/search',
  validate({ query: searchQuery }),
  asyncHandler(async (req, res) => {
    const { q, types } = req.query as unknown as SearchQuery;
    res.json({ items: await search(ctxOf(req), q, types) });
  }),
);
