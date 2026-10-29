import { Router } from 'express';
import type { ActivityBeat } from '../../../shared/types.js';
import { z } from 'zod';
import { asyncHandler } from '../lib/asyncHandler.js';
import { authenticate } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { requirePermission } from '../permissions.js';
import {
  MAX_RANGE_DAYS,
  recordActivity,
  USAGE_SECTIONS,
  usageRange,
} from '../services/activityService.js';
import { ctxOf } from '../services/context.js';
import { getHome } from '../services/homeService.js';
import { getPrefs, updatePrefs } from '../services/prefsService.js';
import { getProfile, recount } from '../services/profileService.js';
import { search } from '../services/searchService.js';
import { localDate } from './schemas.js';

/**
 * Personal, cross-feature endpoints: home overview, preferences, universal search, the profile
 * with lifetime statistics, and active-time beats from open tabs.
 */

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
            'folder',
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

meRoutes.get(
  '/profile',
  asyncHandler(async (req, res) => {
    res.json({ profile: await getProfile(ctxOf(req)) });
  }),
);

/** Recounts stored text and rebuilds activity totals from the daily records (reconciliation). */
meRoutes.post(
  '/profile/recount',
  asyncHandler(async (req, res) => {
    res.json({ profile: await recount(ctxOf(req)) });
  }),
);

// A tab sends a stretch at most every ~65 s of visible time; anything longer is malformed.
// Moving between sections makes shorter stretches, so a minute can bring several.
const activityBody = z
  .object({
    beats: z
      .array(
        z
          .object({
            id: z.string().regex(/^[\w-]{8,64}$/),
            seconds: z.number().int().min(1).max(120),
            ago: z
              .number()
              .int()
              .min(0)
              .max(7 * 24 * 60 * 60),
            date: localDate,
            // 'vault' only from tabs of an earlier version; that time is dropped.
            section: z.enum([...USAGE_SECTIONS, 'vault']).optional(),
            visit: z.boolean().optional(),
          })
          .strict(),
      )
      .min(1)
      .max(60),
  })
  .strict();

const usageQuery = z
  .object({ from: localDate, to: localDate })
  .refine((q) => q.from <= q.to, 'from must not be after to')
  .refine(
    (q) => Date.parse(q.to) - Date.parse(q.from) <= (MAX_RANGE_DAYS - 1) * 24 * 60 * 60 * 1000,
    `At most ${MAX_RANGE_DAYS} days at a time`,
  );

meRoutes.post(
  '/activity',
  validate({ body: activityBody }),
  asyncHandler(async (req, res) => {
    const beats = (req.body.beats as { section?: string }[]).filter((b) => b.section !== 'vault');
    res.json(await recordActivity(ctxOf(req), beats as ActivityBeat[]));
  }),
);

/** Recorded time and actions per local day, for the usage history on the profile. */
meRoutes.get(
  '/usage',
  validate({ query: usageQuery }),
  asyncHandler(async (req, res) => {
    const { from, to } = req.query as unknown as { from: string; to: string };
    res.json({ usage: await usageRange(ctxOf(req), from, to) });
  }),
);
