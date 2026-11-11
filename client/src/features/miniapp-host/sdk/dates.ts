import { useEffect, useState } from 'react';

/** `YYYY-MM-DD` for a local date. */
const ymd = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/**
 * The day a moment belongs to, as `YYYY-MM-DD`, where a day starts at `startHour` (e.g. 3 means
 * 00:00–02:59 still counts as the day before).
 */
export function dayKey(date: Date = new Date(), startHour = 0): string {
  return ymd(new Date(date.getTime() - startHour * 3_600_000));
}

/** `YYYY-MM-DD` plus or minus whole days. */
export function addDays(key: string, days: number): string {
  const [y, m, d] = key.split('-').map(Number);
  return ymd(new Date(y!, m! - 1, d! + days));
}

/** The date of a `YYYY-MM-DD` key (local midnight). */
export function dateOf(key: string): Date {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

/** The current time, updated every `everyMs` (default: each minute) and when the app returns. */
export function useNow(everyMs = 60_000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const tick = () => setNow(new Date());
    const t = setInterval(tick, everyMs);
    document.addEventListener('visibilitychange', tick);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', tick);
    };
  }, [everyMs]);
  return now;
}
