import type { Request } from 'express';
import type { ChangedEntity } from '../../../shared/types.js';
import { publishToUser } from './eventService.js';

/** Who is acting, passed from routes into services (keeps services free of Express). */
export interface Ctx {
  userId: string;
  /** Per-tab id from the X-Client-Id header; echoed in events so tabs skip their own changes. */
  clientId?: string;
  /** The browser's local date (X-Local-Date), for counting actions on the person's own day. */
  localDate?: string;
}

const HOUR_MS = 60 * 60 * 1000;

/**
 * A local date is somewhere from UTC−12 to UTC+14 around now; anything else (a wrong clock, a
 * made-up header) is ignored, and the server's UTC date is used instead.
 */
export function plausibleLocalDate(
  value: string | undefined,
  now = Date.now(),
): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const midnight = Date.parse(`${value}T00:00:00Z`);
  if (Number.isNaN(midnight)) return undefined;
  return now >= midnight - 15 * HOUR_MS && now <= midnight + 39 * HOUR_MS ? value : undefined;
}

export function ctxOf(req: Request): Ctx {
  const header = req.get('x-client-id');
  return {
    userId: req.user!.id,
    clientId: header && /^[\w-]{1,64}$/.test(header) ? header : undefined,
    localDate: plausibleLocalDate(req.get('x-local-date')),
  };
}

export function notifyChange(ctx: Ctx, entity: ChangedEntity, id?: string): void {
  publishToUser(ctx.userId, { type: 'changed', entity, id, origin: ctx.clientId });
}
