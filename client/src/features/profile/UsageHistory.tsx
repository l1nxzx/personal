import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { ActivityStats, UsageDay, UsageSection } from '../../../../shared/types';
import { ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { addDays, parseLocalDate, toLocalDate, today } from '../../lib/dates';
import { SECTIONS } from '../../lib/sections';
import { readJSON, writeJSON } from '../../lib/storage';
import { useUsage } from './api';
import { formatDuration, formatNumber, formatTick, plural } from './format';
import {
  ACTION_ORDER,
  ACTIONS,
  allTimeTotals,
  change,
  dailySeries,
  PERIOD_KEYS,
  PERIOD_LABELS,
  periodOf,
  recordedThroughout,
  totalsOf,
  usageWindow,
  WEEKS,
  weekSeries,
  type Period,
  type PeriodKey,
  type Totals,
} from './usage';

const fmtDay = new Intl.DateTimeFormat(undefined, {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
});
const fmtDayLong = new Intl.DateTimeFormat(undefined, {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
});
const fmtShort = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'short' });
const fmtMonthLong = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });

const dayLabel = (d: string) => fmtDay.format(parseLocalDate(d));
const monthDate = (m: string) => parseLocalDate(`${m}-01`);
const PERIOD_KEY = 'profile:period';

/** A "nice" ceiling for a time axis: whole quarter hours, hours, or 2/5/10 hours. */
function niceMax(seconds: number): number {
  for (const s of [15, 30, 60, 120, 180, 240, 360, 480, 600, 900, 1200, 1800].map((m) => m * 60))
    if (s >= seconds) return s;
  const hours = Math.ceil(seconds / 3600 / 10) * 10;
  return hours * 3600;
}

/**
 * Where the time on this site goes, for a chosen period: the total, day by day, per section, and
 * what was done. Everything below the period buttons follows them. Figures are plain sums of
 * what was recorded; a comparison is shown only when the earlier period was recorded in full.
 */
export function UsageHistory({ activity }: { activity: ActivityStats }) {
  const now = today();
  const [key, setKey] = useState<PeriodKey>(() => {
    const saved = readJSON<PeriodKey>(PERIOD_KEY);
    return saved && PERIOD_KEYS.includes(saved) ? saved : 'last7';
  });
  const choose = (k: PeriodKey) => {
    setKey(k);
    writeJSON(PERIOD_KEY, k);
  };
  const range = useMemo(() => usageWindow(now), [now]);
  const usage = useUsage(range.from, range.to);
  const period = periodOf(key, now);

  return (
    <>
      <section aria-labelledby="profile-usage" className="mt-12">
        <h2 id="profile-usage" className="section-label mb-4">
          Usage over time
        </h2>
        <div
          className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          role="group"
          aria-label="Period"
        >
          {PERIOD_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              aria-pressed={key === k}
              onClick={() => choose(k)}
              className={cn(
                'h-9 shrink-0 rounded px-3 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8125rem]',
                key === k ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
              )}
            >
              {PERIOD_LABELS[k]}
            </button>
          ))}
        </div>

        {key !== 'all' && usage.isError ? (
          <ErrorNote onRetry={() => void usage.refetch()}>{errorMessage(usage.error)}</ErrorNote>
        ) : key !== 'all' && !usage.data ? (
          <UsageSkeleton />
        ) : (
          <PeriodView
            period={period}
            activity={activity}
            days={usage.data?.days ?? []}
            now={now}
            stale={usage.isPlaceholderData}
          />
        )}
      </section>
      {usage.data && <WeekByWeek days={usage.data.days} activity={activity} now={now} />}
    </>
  );
}

function PeriodView({
  period,
  activity,
  days,
  now,
  stale,
}: {
  period: Period;
  activity: ActivityStats;
  days: UsageDay[];
  now: string;
  stale: boolean;
}) {
  const all = period.key === 'all';
  const totals = all ? allTimeTotals(activity) : totalsOf(days, period.from!, period.to!);
  const prev = period.prev ? totalsOf(days, period.prev.from, period.prev.to) : null;
  // Time, and per section (sections and actions began being recorded together).
  const timeComparable =
    !!prev && period.comparable && recordedThroughout(period.prev!.from, activity.firstActiveAt);
  const sectionsComparable =
    !!prev && period.comparable && recordedThroughout(period.prev!.from, activity.sectionsSince);
  return (
    <div className={cn('transition-opacity', stale && 'opacity-60')}>
      <Summary
        period={period}
        totals={totals}
        prev={prev}
        comparable={timeComparable}
        days={days}
      />
      {all ? (
        activity.months.length > 1 && <MonthChart activity={activity} />
      ) : period.from !== period.to ? (
        <DayChart days={days} from={period.from!} to={period.to!} now={now} />
      ) : null}

      <WhereTimeGoes
        totals={totals}
        prev={sectionsComparable ? prev : null}
        activity={activity}
        days={days}
        now={now}
      />
      <WhatYouDid
        period={period}
        totals={totals}
        prev={sectionsComparable ? prev : null}
        activity={activity}
      />
    </div>
  );
}

function Summary({
  period,
  totals,
  prev,
  comparable,
  days,
}: {
  period: Period;
  totals: Totals;
  prev: Totals | null;
  comparable: boolean;
  days: UsageDay[];
}) {
  const multiDay = period.from !== period.to;
  const busiest =
    multiDay && period.from
      ? days
          .filter((d) => d.date >= period.from! && d.date <= period.to! && d.seconds > 0)
          .sort((a, b) => b.seconds - a.seconds)[0]
      : undefined;
  const diff = comparable && prev ? change(totals.seconds, prev.seconds) : null;
  return (
    <div className="mt-6">
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Figure large label={period.key === 'today' ? 'Today so far' : 'Time here'}>
          {formatDuration(totals.seconds)}
        </Figure>
        <Figure label={multiDay || period.key === 'all' ? 'Active days' : 'Sessions'}>
          {formatNumber(multiDay || period.key === 'all' ? totals.activeDays : totals.sessions)}
        </Figure>
        <Figure label="Section visits">{formatNumber(totals.visits)}</Figure>
      </div>
      <p className="mt-5 text-sm text-ink-muted">
        {[
          prev &&
            period.prev &&
            (comparable || period.key === 'today') &&
            `${period.key === 'today' ? 'Yesterday' : `Compared with ${period.prev.label}`}: ${formatDuration(prev.seconds)}${diff ? ` (${diff})` : ''}`,
          busiest &&
            `busiest day ${fmtDayLong.format(parseLocalDate(busiest.date))}, ${formatDuration(busiest.seconds)}`,
        ]
          .filter(Boolean)
          .join(' · ')
          .replace(/^./, (c) => c.toUpperCase())}
      </p>
    </div>
  );
}

function Figure({
  label,
  children,
  large,
}: {
  label: string;
  children: ReactNode;
  large?: boolean;
}) {
  return (
    <div className={large ? 'col-span-2 sm:col-span-1' : undefined}>
      <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      {large ? (
        <div
          className="mt-1 font-serif text-[2rem] leading-none text-ink"
          style={{ fontVariationSettings: "'opsz' 48" }}
        >
          {children}
        </div>
      ) : (
        <div className="mt-1 text-lg tabular-nums text-ink">{children}</div>
      )}
    </div>
  );
}

function UsageSkeleton() {
  return (
    <Skeleton>
      <div className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <div className="col-span-2 sm:col-span-1">
          <SkeletonText className="text-2xs" width="5rem" />
          <SkeletonText className="mt-1 text-[2rem] leading-none" width="7rem" />
        </div>
        <div>
          <SkeletonText className="text-2xs" width="5rem" />
          <SkeletonText className="mt-1 text-lg" width="2.5rem" />
        </div>
        <div>
          <SkeletonText className="text-2xs" width="5rem" />
          <SkeletonText className="mt-1 text-lg" width="2.5rem" />
        </div>
      </div>
      <SkeletonBlock className="mt-8 h-40 w-full" />
    </Skeleton>
  );
}

// ---------------------------------------------------------------- charts

interface Bar {
  key: string;
  label: string;
  /** Under the bar; empty to leave it unlabelled on narrow screens. */
  tick: string;
  seconds: number;
  detail: string;
  muted?: boolean;
}

/**
 * Columns of time, one series, one axis: thin bars from a single baseline, a tooltip per bar
 * (also on keyboard focus), and the same figures as a table.
 */
function TimeColumns({ bars, caption }: { bars: Bar[]; caption: string }) {
  const [active, setActive] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  const max = niceMax(Math.max(60, ...bars.map((b) => b.seconds)));
  const ticks = [max, max / 2, 0];
  const a = active !== null ? bars[active] : null;
  const dense = bars.length > 16;

  return (
    <figure aria-label={caption} className="mt-8">
      <div className="mb-3 flex items-center text-2xs text-ink-faint">
        <span>{caption}</span>
        <button
          type="button"
          onClick={() => setAsTable((t) => !t)}
          aria-pressed={asTable}
          className="ml-auto h-8 rounded px-2 hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-6"
        >
          {asTable ? 'Show chart' : 'Show as table'}
        </button>
      </div>
      {asTable ? (
        <table className="w-full max-w-xl text-sm">
          <tbody className="divide-y divide-line/70">
            {[...bars].reverse().map((b) => (
              <tr key={b.key}>
                <td className="py-1.5 text-ink-muted">{b.label}</td>
                <td className="py-1.5 text-right tabular-nums text-ink">
                  {b.seconds ? formatDuration(b.seconds) : '—'}
                </td>
                <td className="hidden py-1.5 pl-4 text-right text-2xs text-ink-faint sm:table-cell">
                  {b.seconds ? b.detail : ''}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative pl-12">
          <div className="pointer-events-none absolute inset-x-0 bottom-6 top-0">
            {ticks.map((t, i) => (
              <div
                key={t}
                className="absolute inset-x-0 flex items-center"
                style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
              >
                <span className="w-11 -translate-y-1/2 pr-2 text-right text-2xs tabular-nums text-ink-faint">
                  {formatTick(t)}
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
            className={cn('relative flex h-40 items-end', dense ? 'gap-[2px]' : 'gap-1 sm:gap-2')}
            onMouseLeave={() => setActive(null)}
          >
            {bars.map((b, i) => (
              <button
                key={b.key}
                type="button"
                aria-label={`${b.label}: ${b.seconds ? formatDuration(b.seconds) : 'nothing recorded'}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onBlur={() => setActive(null)}
                onClick={() => setActive(active === i ? null : i)}
                className="relative flex h-full min-w-0 flex-1 items-end justify-center focus-visible:outline-offset-0"
              >
                {active === i && (
                  <span className="absolute inset-0 rounded-sm bg-surface-2/70" aria-hidden />
                )}
                {b.seconds > 0 && (
                  <span
                    className={cn(
                      'relative w-full max-w-[1.5rem] rounded-t-[4px]',
                      b.muted ? 'bg-chart-1/50' : 'bg-chart-1',
                    )}
                    style={{ height: `${Math.max(1.5, (b.seconds / max) * 100)}%` }}
                  />
                )}
              </button>
            ))}
            {a && active !== null && (
              <div
                role="status"
                className="pointer-events-none absolute bottom-full z-10 mb-2 whitespace-nowrap rounded border border-line bg-raised px-3 py-2 text-[0.8125rem] shadow-[0_8px_24px_-8px_rgb(0_0_0/0.5)]"
                style={{
                  left: `${((active + 0.5) / bars.length) * 100}%`,
                  transform: `translateX(${active < bars.length / 4 ? '-15%' : active > (bars.length * 3) / 4 ? '-85%' : '-50%'})`,
                }}
              >
                <div className="font-medium tabular-nums text-ink">
                  {a.seconds ? formatDuration(a.seconds) : 'Nothing recorded'}
                </div>
                <div className="mt-0.5 text-ink-muted">{a.label}</div>
                {a.seconds > 0 && <div className="text-2xs text-ink-faint">{a.detail}</div>}
              </div>
            )}
          </div>
          <div className={cn('mt-1.5 flex', dense ? 'gap-[2px]' : 'gap-1 sm:gap-2')}>
            {bars.map((b, i) => (
              <span
                key={b.key}
                // The last label grows leftwards, so it never runs past the chart's edge.
                className={cn(
                  'flex min-w-0 flex-1 whitespace-nowrap text-2xs text-ink-faint',
                  i === bars.length - 1 && dense ? 'justify-end' : 'justify-center',
                )}
              >
                {b.tick}
              </span>
            ))}
          </div>
        </div>
      )}
    </figure>
  );
}

const topSection = (d: { sections: { section: UsageSection; seconds: number }[] }) =>
  d.sections[0] ? `most in ${SECTIONS[d.sections[0].section].label}` : '';

function DayChart({
  days,
  from,
  to,
  now,
}: {
  days: UsageDay[];
  from: string;
  to: string;
  now: string;
}) {
  const series = dailySeries(days, from, to);
  const dense = series.length > 16;
  const bars: Bar[] = series.map((d, i) => ({
    key: d.date,
    label: dayLabel(d.date),
    // Every day for a week; for a month, every seventh day from the end, so today is labelled.
    tick: !dense
      ? fmtDay.format(parseLocalDate(d.date)).split(/[ ,]/)[0]!
      : (series.length - 1 - i) % 7 === 0
        ? fmtShort.format(parseLocalDate(d.date))
        : '',
    seconds: d.seconds,
    detail: [plural(d.sessions, 'session'), d.day && topSection(d.day)].filter(Boolean).join(' · '),
    muted: d.date === now,
  }));
  return <TimeColumns bars={bars} caption="Time per day" />;
}

function MonthChart({ activity }: { activity: ActivityStats }) {
  const months = [...activity.months].reverse().slice(-24);
  const bars: Bar[] = months.map((m, i) => ({
    key: m.month,
    label: fmtMonthLong.format(monthDate(m.month)),
    tick:
      months.length <= 12 || (months.length - 1 - i) % 3 === 0
        ? fmtMonth.format(monthDate(m.month))
        : '',
    seconds: m.seconds,
    detail: [plural(m.days, 'day'), topSection(m)].filter(Boolean).join(' · '),
  }));
  return <TimeColumns bars={bars} caption="Time per month" />;
}

// ---------------------------------------------------------------- sections

function WhereTimeGoes({
  totals,
  prev,
  activity,
  days,
  now,
}: {
  totals: Totals;
  prev: Totals | null;
  activity: ActivityStats;
  days: UsageDay[];
  now: string;
}) {
  const weeks = weekSeries(days, now);
  const started = activity.sectionsSince && toLocalDate(new Date(activity.sectionsSince));
  const rows = [...totals.sections.entries()]
    .filter(([, t]) => t.seconds > 0)
    .sort((a, b) => b[1].seconds - a[1].seconds);
  const trendMax = Math.max(
    1,
    ...weeks.flatMap((w) => [...w.totals.sections.values()].map((t) => t.seconds)),
  );

  return (
    <div className="mt-10">
      <h3 className="mb-1 text-sm font-medium text-ink">Where the time goes</h3>
      {!rows.length ? (
        <p className="py-3 text-sm text-ink-faint">Nothing in this period.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-[0.12em] text-ink-faint">
              <th className="pb-2 font-normal">Section</th>
              <th className="pb-2 text-right font-normal">Time</th>
              <th className="pb-2 pl-3 text-right font-normal">Share</th>
              <th className="pb-2 pl-3 text-right font-normal">Visits</th>
              <th className="hidden pb-2 pl-3 text-right font-normal sm:table-cell">Per visit</th>
              {prev && (
                <th className="hidden pb-2 pl-3 text-right font-normal sm:table-cell">Change</th>
              )}
              <th className="hidden pb-2 pl-4 text-right font-normal md:table-cell">
                Last {WEEKS} weeks
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70 border-t border-line/70">
            {rows.map(([section, t]) => {
              const info = SECTIONS[section];
              const share = totals.sectionSeconds ? t.seconds / totals.sectionSeconds : 0;
              const before = prev?.sections.get(section)?.seconds ?? 0;
              return (
                <tr key={section} className="align-top">
                  <td className="py-2.5 pr-2">
                    {info.to ? (
                      <Link to={info.to} className="text-ink hover:underline">
                        {info.label}
                      </Link>
                    ) : (
                      <span className="text-ink">{info.label}</span>
                    )}
                  </td>
                  <td className="whitespace-nowrap py-2.5 text-right tabular-nums text-ink">
                    {formatDuration(t.seconds)}
                    {/* The share as a bar, in the same hue as the charts. */}
                    <div className="ml-auto mt-1.5 h-1 w-16 rounded-sm bg-line/60" aria-hidden>
                      <div
                        className="h-1 rounded-sm bg-chart-1"
                        style={{ width: `${Math.max(3, share * 100)}%` }}
                      />
                    </div>
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-ink-muted">
                    {share < 0.005 ? '<1%' : `${Math.round(share * 100)}%`}
                  </td>
                  <td className="py-2.5 pl-3 text-right tabular-nums text-ink-muted">
                    {formatNumber(t.visits)}
                  </td>
                  <td className="hidden whitespace-nowrap py-2.5 pl-3 text-right tabular-nums text-ink-muted sm:table-cell">
                    {t.visits ? formatDuration(t.seconds / t.visits) : '—'}
                  </td>
                  {prev && (
                    <td className="hidden whitespace-nowrap py-2.5 pl-3 text-right tabular-nums text-ink-muted sm:table-cell">
                      {change(t.seconds, before) ?? '—'}
                    </td>
                  )}
                  <td className="hidden py-2.5 pl-4 md:table-cell">
                    <Trend
                      label={info.label}
                      weeks={weeks.map((w) => ({
                        from: w.from,
                        seconds: w.totals.sections.get(section)?.seconds ?? 0,
                        current: w.current,
                        recorded: !!started && w.to >= started,
                      }))}
                      max={trendMax}
                    />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Twelve tiny columns, oldest to this week (lighter, as it isn't over). */
function Trend({
  label,
  weeks,
  max,
}: {
  label: string;
  weeks: { from: string; seconds: number; current: boolean; recorded: boolean }[];
  max: number;
}) {
  const shown = weeks.filter((w) => w.recorded);
  return (
    <div
      className="ml-auto flex h-6 w-[7.5rem] items-end gap-[2px]"
      role="img"
      aria-label={`${label}, week by week since recorded: ${shown.map((w) => formatDuration(w.seconds)).join(', ')}`}
    >
      {weeks.map((w) => (
        <span
          key={w.from}
          title={
            w.recorded
              ? `Week of ${fmtShort.format(parseLocalDate(w.from))}: ${formatDuration(w.seconds)}`
              : `Week of ${fmtShort.format(parseLocalDate(w.from))}: not recorded per section`
          }
          className="flex h-full flex-1 items-end"
        >
          {/* A week before time per section was recorded is left empty, not drawn as zero. */}
          {w.recorded && (
            <span
              className={cn('w-full rounded-t-[2px]', w.current ? 'bg-chart-1/50' : 'bg-chart-1')}
              style={{ height: w.seconds ? `${Math.max(8, (w.seconds / max) * 100)}%` : '1px' }}
            />
          )}
        </span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- actions

function WhatYouDid({
  period,
  totals,
  prev,
  activity,
}: {
  period: Period;
  totals: Totals;
  prev: Totals | null;
  activity: ActivityStats;
}) {
  const allTime = new Map(activity.actions.map((a) => [a.action, a.count]));
  const all = period.key === 'all';
  const used = ACTION_ORDER.filter((a) => (allTime.get(a) ?? 0) > 0);
  if (!used.length) return null;

  return (
    <div className="mt-10">
      <h3 className="mb-1 text-sm font-medium text-ink">What you did</h3>
      {!used.length ? (
        <p className="py-3 text-sm text-ink-faint">Nothing yet.</p>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-[0.12em] text-ink-faint">
              <th className="pb-2 font-normal">Action</th>
              {!all && <th className="pb-2 text-right font-normal">{period.label}</th>}
              {prev && period.prev && (
                <th className="hidden pb-2 pl-3 text-right font-normal sm:table-cell">Before</th>
              )}
              <th className="pb-2 pl-3 text-right font-normal">All time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70 border-t border-line/70">
            {used.map((a) => {
              const info = ACTIONS[a];
              const n = totals.actions.get(a) ?? 0;
              return (
                <tr key={a}>
                  <td className="py-2 pr-2">
                    <span className="text-ink-muted">{info.label}</span>
                  </td>
                  {!all && (
                    <td
                      className={cn(
                        'py-2 text-right tabular-nums',
                        n ? 'text-ink' : 'text-ink-faint',
                      )}
                    >
                      {formatNumber(n)}
                    </td>
                  )}
                  {prev && period.prev && (
                    <td className="hidden py-2 pl-3 text-right tabular-nums text-ink-faint sm:table-cell">
                      {formatNumber(prev.actions.get(a) ?? 0)}
                    </td>
                  )}
                  <td className="py-2 pl-3 text-right tabular-nums text-ink-muted">
                    {formatNumber(allTime.get(a) ?? 0)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </div>
  );
}

// ---------------------------------------------------------------- weeks

function WeekByWeek({
  days,
  activity,
  now,
}: {
  days: UsageDay[];
  activity: ActivityStats;
  now: string;
}) {
  const weeks = weekSeries(days, now).reverse();
  const started = activity.firstActiveAt ? toLocalDate(new Date(activity.firstActiveAt)) : null;
  const shown = weeks.filter((w) => started && w.to >= started);
  if (!shown.length) return null;
  const max = Math.max(1, ...shown.map((w) => w.totals.seconds));

  return (
    <section aria-labelledby="profile-weeks" className="mt-12">
      <h2 id="profile-weeks" className="section-label mb-4">
        Week by week
      </h2>
      <table className="w-full max-w-2xl text-sm">
        <tbody className="divide-y divide-line/70">
          {shown.map((w, i) => {
            const before = shown[i + 1];
            const partial = started! > w.from;
            return (
              <tr key={w.from}>
                <td className="w-[38%] py-2 pr-2">
                  <span className="text-ink-muted">
                    {w.current
                      ? 'This week'
                      : `${fmtShort.format(parseLocalDate(w.from))} – ${fmtShort.format(parseLocalDate(addDays(w.from, 6)))}`}
                  </span>
                </td>
                <td className="w-[34%] py-2 pr-4" aria-hidden>
                  <div
                    className={cn('h-1 rounded-sm', w.current ? 'bg-chart-1/50' : 'bg-chart-1/80')}
                    style={{
                      width: `${Math.max(w.totals.seconds ? 2 : 0, (w.totals.seconds / max) * 100)}%`,
                    }}
                  />
                </td>
                <td className="whitespace-nowrap py-2 text-right tabular-nums text-ink">
                  {formatDuration(w.totals.seconds)}
                </td>
                <td className="hidden whitespace-nowrap py-2 pl-4 text-right text-2xs tabular-nums text-ink-faint sm:table-cell">
                  {/* A week so far, or one only partly recorded, isn't compared. */}
                  {!w.current && !partial && before && !(started! > before.from)
                    ? (change(w.totals.seconds, before.totals.seconds) ?? '')
                    : ''}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}
