import type { Request } from 'express';
import type { ChangedEntity } from '../../../shared/types.js';
import { publishToUser } from './eventService.js';

/** Who is acting, passed from routes into services (keeps services free of Express). */
export interface Ctx {
  userId: string;
  /** Per-tab id from the X-Client-Id header; echoed in events so tabs skip their own changes. */
  clientId?: string;
}

export function ctxOf(req: Request): Ctx {
  const header = req.get('x-client-id');
  return {
    userId: req.user!.id,
    clientId: header && /^[\w-]{1,64}$/.test(header) ? header : undefined,
  };
}

export function notifyChange(ctx: Ctx, entity: ChangedEntity, id?: string): void {
  publishToUser(ctx.userId, { type: 'changed', entity, id, origin: ctx.clientId });
}
