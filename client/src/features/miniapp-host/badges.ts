import { useQueries } from '@tanstack/react-query';
import { appDataQuery } from './sdk/data';
import { useNow } from './sdk/dates';
import type { MiniappDefinition } from './sdk/types';

export type Badge = number | true;

/**
 * Badges of the given apps, by id (apps without one, or with nothing to show, are left out).
 * Reads each app's data through the same cache the app itself uses.
 */
export function useBadges(apps: MiniappDefinition[]): Record<string, Badge> {
  const withBadge = apps.filter((a) => a.badge);
  const now = useNow();
  const results = useQueries({ queries: withBadge.map((a) => appDataQuery(a)) });
  const out: Record<string, Badge> = {};
  withBadge.forEach((a, i) => {
    const r = results[i];
    if (!r?.isSuccess) return;
    try {
      const v = a.badge!(r.data.data ?? a.initialData, now);
      if (v === true || (typeof v === 'number' && v > 0)) out[a.id] = v;
    } catch {
      // A broken badge never breaks the screen.
    }
  });
  return out;
}

/** Several badges as one (a folder's): their total, or a dot if any is only a dot. */
export function sumBadges(badges: (Badge | undefined)[]): Badge | undefined {
  const present = badges.filter((b): b is Badge => b !== undefined);
  if (!present.length) return undefined;
  const n = present.reduce<number>((s, b) => s + (b === true ? 0 : b), 0);
  return n > 0 ? n : true;
}
