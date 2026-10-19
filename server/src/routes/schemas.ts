import { z } from 'zod';

/** Zod building blocks shared by several feature routes. */

export const localDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected YYYY-MM-DD')
  .refine((s) => !Number.isNaN(Date.parse(`${s}T00:00:00Z`)), 'Invalid date');

export const localTime = z.string().regex(/^\d{2}:\d{2}$/, 'Expected HH:mm');

export const idParams = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,128}$/) });

export const tagList = z.array(z.string().max(64)).max(20);
