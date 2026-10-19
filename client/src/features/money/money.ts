import type { IncomeSummary } from '../../../../shared/types';

export const COMMON_CURRENCIES = ['EUR', 'USD', 'GBP', 'CZK', 'CHF', 'PLN', 'HUF', 'CAD', 'AUD'];

const fractionDigits = new Map<string, number>();
export function minorDigits(currency: string): number {
  let d = fractionDigits.get(currency);
  if (d === undefined) {
    try {
      d =
        new Intl.NumberFormat('en', { style: 'currency', currency }).resolvedOptions()
          .maximumFractionDigits ?? 2;
    } catch {
      d = 2;
    }
    fractionDigits.set(currency, d);
  }
  return d;
}

/** 123456 (minor units) → "€1,234.56" in the reader's locale. */
export function formatMoney(
  minor: number,
  currency: string,
  opts: { compact?: boolean } = {},
): string {
  const major = minor / 10 ** minorDigits(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      ...(opts.compact && { notation: 'compact', maximumFractionDigits: 1 }),
    }).format(major);
  } catch {
    return `${major.toFixed(2)} ${currency}`;
  }
}

/**
 * Parses what people type: "1 234,50", "1,234.50", "12.5", "€40". Returns minor units, or null.
 * The last "," or "." followed by 1–2 digits is the decimal separator; others are grouping.
 */
export function parseAmount(input: string, currency: string): number | null {
  const s = input.replace(/[^\d.,-]/g, '');
  if (!s || /-/.test(s)) return null;
  const m = /^(.*?)[.,](\d{1,2})$/.exec(s);
  const whole = (m ? m[1]! : s).replace(/[.,]/g, '');
  const frac = m ? m[2]! : '';
  if (!/^\d*$/.test(whole) || (!whole && !frac)) return null;
  const digits = minorDigits(currency);
  const minor =
    Number(whole || '0') * 10 ** digits + Number(frac.padEnd(digits, '0').slice(0, digits) || '0');
  return Number.isFinite(minor) && minor > 0 ? Math.round(minor) : null;
}

export function amountInput(minor: number, currency: string): string {
  const digits = minorDigits(currency);
  return (minor / 10 ** digits).toFixed(digits);
}

export const monthKey = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;

export function shiftMonth(key: string, delta: number): string {
  const [y, m] = key.split('-').map(Number);
  return monthKey(new Date(y!, m! - 1 + delta, 1));
}

export function monthLabel(key: string, style: 'short' | 'long' = 'short'): string {
  const [y, m] = key.split('-').map(Number);
  return new Intl.DateTimeFormat(
    undefined,
    style === 'short' ? { month: 'short' } : { month: 'long', year: 'numeric' },
  ).format(new Date(y!, m! - 1, 1));
}

export interface Totals {
  received: number;
  pending: number;
}

export function monthTotals(
  summary: IncomeSummary | undefined,
  month: string,
  currency: string,
): Totals {
  const t = summary?.months[month]?.[currency];
  return { received: t?.received ?? 0, pending: t?.pending ?? 0 };
}

/** Sum of received amounts for the months in [from, to] (inclusive `YYYY-MM`). */
export function rangeTotals(
  summary: IncomeSummary | undefined,
  from: string,
  to: string,
  currency: string,
): Totals {
  const out = { received: 0, pending: 0 };
  for (const [month, byCur] of Object.entries(summary?.months ?? {})) {
    if (month < from || month > to) continue;
    out.received += byCur[currency]?.received ?? 0;
    out.pending += byCur[currency]?.pending ?? 0;
  }
  return out;
}

/** Received by source for the months in [from, to], largest first. */
export function bySource(
  summary: IncomeSummary | undefined,
  from: string,
  to: string,
  currency: string,
) {
  const totals = new Map<string, number>();
  for (const [month, byCur] of Object.entries(summary?.months ?? {})) {
    if (month < from || month > to) continue;
    for (const [key, amount] of Object.entries(byCur[currency]?.sources ?? {})) {
      totals.set(key, (totals.get(key) ?? 0) + amount);
    }
  }
  return [...totals]
    .filter(([, v]) => v > 0)
    .map(([key, amount]) => ({ key, label: summary?.sourceLabels[key] ?? key, amount }))
    .sort((a, b) => b.amount - a.amount);
}

/** Currencies that have any recorded amount, base currency first. */
export function currenciesUsed(summary: IncomeSummary | undefined, base: string): string[] {
  const set = new Set<string>();
  for (const byCur of Object.values(summary?.months ?? {})) {
    for (const [cur, t] of Object.entries(byCur)) if (t.received || t.pending) set.add(cur);
  }
  return [base, ...[...set].filter((c) => c !== base).sort()];
}

export function percentChange(now: number, before: number): string | null {
  if (!before) return null;
  const pct = Math.round(((now - before) / before) * 100);
  return `${pct > 0 ? '+' : ''}${pct}%`;
}
