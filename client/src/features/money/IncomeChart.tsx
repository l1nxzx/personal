import { useState } from 'react';
import type { IncomeSummary } from '../../../../shared/types';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { cn } from '../../lib/cn';
import { formatMoney, monthLabel, monthTotals, shiftMonth } from './money';

/** A "nice" ceiling for the y-axis: 1, 2, 2.5 or 5 × 10^n. */
function niceMax(v: number): number {
  if (v <= 0) return 1;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

/**
 * Last 12 months of income in one currency: received (solid) with pending stacked above
 * (second step of the same hue, 2px gap). One axis, thin bars, tooltip per month, table view.
 */
export function IncomeChart({
  summary,
  currency,
  current,
}: {
  summary: IncomeSummary | undefined;
  currency: string;
  current: string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const months = Array.from({ length: 12 }, (_, i) => shiftMonth(current, i - 11));
  const data = months.map((m) => ({ month: m, ...monthTotals(summary, m, currency) }));
  const hasPending = data.some((d) => d.pending > 0);
  const max = niceMax(Math.max(...data.map((d) => d.received + d.pending)));
  const ticks = [max, max / 2, 0];
  const money = (v: number) => formatMoney(v, currency, { compact: v >= 100_000 });
  const activeData = active !== null ? data[active] : null;

  return (
    <figure aria-label={`Income by month, last 12 months, ${currency}`}>
      <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-ink-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-[2px] bg-chart-1" /> Received
        </span>
        {hasPending && (
          <span className="inline-flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-[2px] bg-chart-2" /> Pending
          </span>
        )}
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
          className="ml-auto h-8 rounded px-2 text-ink-faint hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-6"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>

      {asTable ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-wider text-ink-faint">
              <th className="py-1.5 font-medium">Month</th>
              <th className="py-1.5 text-right font-medium">Received</th>
              <th className="py-1.5 text-right font-medium">Pending</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70">
            {[...data].reverse().map((d) => (
              <tr key={d.month}>
                <td className="py-1.5 text-ink-muted">{monthLabel(d.month, 'long')}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">
                  {d.received ? formatMoney(d.received, currency) : '—'}
                </td>
                <td className="py-1.5 text-right tabular-nums text-ink-muted">
                  {d.pending ? formatMoney(d.pending, currency) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative pl-12">
          {/* y-axis labels and recessive gridlines */}
          <div className="pointer-events-none absolute inset-y-0 left-0 right-0 bottom-6">
            {ticks.map((t, i) => (
              <div
                key={t}
                className="absolute left-0 right-0 flex items-center"
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              >
                <span className="w-11 -translate-y-1/2 pr-2 text-right text-2xs tabular-nums text-ink-faint">
                  {money(t)}
                </span>
                <span
                  className={cn(
                    'h-px flex-1 -translate-y-1/2',
                    t === 0 ? 'bg-line-strong' : 'bg-line/60',
                  )}
                />
              </div>
            ))}
          </div>

          <div
            className="relative flex h-44 items-end gap-1 sm:gap-2"
            onMouseLeave={() => setActive(null)}
          >
            {data.map((d, i) => {
              const recH = (d.received / max) * 100;
              const penH = (d.pending / max) * 100;
              return (
                <button
                  key={d.month}
                  type="button"
                  aria-label={`${monthLabel(d.month, 'long')}: ${formatMoney(d.received, currency)} received${d.pending ? `, ${formatMoney(d.pending, currency)} pending` : ''}`}
                  onMouseEnter={() => setActive(i)}
                  onFocus={() => setActive(i)}
                  onClick={() => setActive(active === i ? null : i)}
                  className="group relative flex h-full flex-1 flex-col items-center justify-end focus-visible:outline-offset-0"
                >
                  <span className="flex h-full w-full max-w-[1.5rem] flex-col justify-end">
                    {d.pending > 0 && (
                      <span
                        className="mb-[2px] w-full rounded-t-[4px] bg-chart-2"
                        style={{ height: `${penH}%` }}
                      />
                    )}
                    {d.received > 0 && (
                      <span
                        className={cn('w-full bg-chart-1', d.pending > 0 ? '' : 'rounded-t-[4px]')}
                        style={{ height: `${recH}%` }}
                      />
                    )}
                  </span>
                  {active === i && (
                    <span
                      className="absolute inset-0 -z-10 rounded-sm bg-surface-2/70"
                      aria-hidden
                    />
                  )}
                </button>
              );
            })}
            {activeData && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded border border-line bg-raised px-3 py-2 text-[0.8125rem] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.5)]"
                style={{
                  left: `${((active + 0.5) / 12) * 100}%`,
                  transform: `translateX(${active < 3 ? '-15%' : active > 8 ? '-85%' : '-50%'})`,
                }}
              >
                <div className="font-medium text-ink">{monthLabel(activeData.month, 'long')}</div>
                <div className="mt-0.5 tabular-nums text-ink-muted">
                  {formatMoney(activeData.received, currency)} received
                </div>
                {activeData.pending > 0 && (
                  <div className="tabular-nums text-ink-muted">
                    {formatMoney(activeData.pending, currency)} pending
                  </div>
                )}
              </div>
            )}
          </div>
          <div className="mt-1.5 flex gap-1 sm:gap-2">
            {data.map((d, i) => (
              <span
                key={d.month}
                className={cn(
                  'flex-1 text-center text-2xs',
                  d.month === current ? 'text-ink-muted' : 'text-ink-faint',
                  // On narrow screens label every other month.
                  i % 2 === 1 && i !== 11 && 'max-sm:invisible',
                )}
              >
                {monthLabel(d.month)}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

/** Bar heights for the loading chart: an even, unremarkable shape that reads as "bars". */
const SKELETON_BARS = [38, 52, 30, 64, 46, 58, 34, 70, 50, 42, 60, 48];

/** The chart's frame while the summary loads: legend row, twelve faint bars, month labels. */
export function IncomeChartSkeleton() {
  return (
    <Skeleton>
      <div className="mb-3 flex h-8 items-center sm:h-6">
        <SkeletonText className="text-2xs" width="4.5rem" />
      </div>
      <div className="pl-12">
        <div className="flex h-44 items-end gap-1 border-b border-line-strong sm:gap-2">
          {SKELETON_BARS.map((h, i) => (
            <span key={i} className="flex h-full flex-1 items-end justify-center">
              <SkeletonBlock
                className="w-full max-w-[1.5rem] rounded-b-none"
                style={{ height: `${h}%` }}
              />
            </span>
          ))}
        </div>
        <div className="mt-1.5 h-4" />
      </div>
    </Skeleton>
  );
}

/** Received by source: one hue, sorted, labeled directly. Long tails fold into "Other". */
export function SourceBars({
  rows,
  currency,
}: {
  rows: { key: string; label: string; amount: number }[];
  currency: string;
}) {
  const top = rows.slice(0, 7);
  const rest = rows.slice(7).reduce((s, r) => s + r.amount, 0);
  const all = rest ? [...top, { key: '__other', label: 'Other', amount: rest }] : top;
  const total = all.reduce((s, r) => s + r.amount, 0);
  const max = Math.max(...all.map((r) => r.amount), 1);
  return (
    <ul className="space-y-3">
      {all.map((r) => (
        <li key={r.key}>
          <div className="flex items-baseline gap-3 text-sm">
            <span className="min-w-0 flex-1 truncate text-ink">{r.label}</span>
            <span className="shrink-0 tabular-nums text-ink">
              {formatMoney(r.amount, currency)}
            </span>
            <span className="w-10 shrink-0 text-right text-2xs tabular-nums text-ink-faint">
              {Math.round((r.amount / total) * 100)}%
            </span>
          </div>
          <div
            className="mt-1 h-1.5 rounded-r-[4px] bg-chart-1"
            style={{ width: `${Math.max(1, (r.amount / max) * 100)}%` }}
          />
        </li>
      ))}
    </ul>
  );
}
