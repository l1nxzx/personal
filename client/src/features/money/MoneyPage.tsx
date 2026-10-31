import { useId, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { IncomeEntry, IncomeStatus } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { controlClass } from '../../components/ui/Field';
import { Empty, ErrorNote, Loading, Segmented } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatRelativeDay, today } from '../../lib/dates';
import { usePrefs } from '../me/api';
import {
  useAddIncome,
  useDeleteIncome,
  useIncomeList,
  useIncomeSummary,
  useUpdateIncome,
} from './api';
import { IncomeChart, IncomeChartSkeleton, SourceBars } from './IncomeChart';
import { HistorySkeleton, Pending } from './MoneySkeletons';
import { MoneyTabs } from './MoneyTabs';
import {
  amountInput,
  bySource,
  COMMON_CURRENCIES,
  currenciesUsed,
  formatMoney,
  monthKey,
  monthLabel,
  monthTotals,
  parseAmount,
  percentChange,
  rangeTotals,
  shiftMonth,
} from './money';

export default function MoneyPage() {
  const prefs = usePrefs();
  const summary = useIncomeSummary();
  const base = prefs.data?.baseCurrency ?? 'EUR';
  const [currency, setCurrency] = useState<string | null>(null);
  const cur = currency ?? base;
  const used = currenciesUsed(summary.data, base);
  const [params, setParams] = useSearchParams();
  const editId = params.get('entry');

  const now = monthKey(new Date());
  const [period, setPeriod] = useState<OverviewPeriod>('all');
  const tiles = overviewTiles(summary.data, period, now, cur);
  const hasData = Object.keys(summary.data?.months ?? {}).length > 0;
  // The figures depend on the base currency too; showing them before both arrive would flash
  // zeros, or totals in the wrong currency.
  const loading = summary.isLoading || prefs.isLoading;
  // Couldn't load: no figures rather than zeros (the error and retry show below the form).
  const failed = !summary.data && summary.isError;
  const figure = (amount: number, width: string) =>
    loading ? <Pending width={width} /> : failed ? '—' : formatMoney(amount, cur);

  return (
    <Page width="default">
      <PageHeader title="Money & Work">
        <MoneyTabs />
      </PageHeader>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'all', label: 'All time' },
            { value: 'year', label: 'This year' },
            { value: 'month', label: 'This month' },
          ]}
        />
        {used.length > 1 && (
          <Segmented
            label="Currency"
            value={cur}
            onChange={setCurrency}
            options={used.map((c) => ({ value: c, label: c }))}
          />
        )}
      </div>

      {/* Summary: plain figures from recorded entries only. */}
      <section
        aria-label="Overview"
        className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3"
      >
        <div className="col-span-2 sm:col-span-1">
          <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">
            {tiles.main.label}
          </div>
          <div
            className="mt-1 font-serif text-[2rem] leading-none tabular-nums text-ink"
            style={{ fontVariationSettings: "'opsz' 48" }}
          >
            {figure(tiles.main.totals.received, '8rem')}
          </div>
          <div className="mt-1.5 text-sm text-ink-muted">
            received
            {!loading && tiles.main.totals.pending > 0 && (
              <> · {formatMoney(tiles.main.totals.pending, cur)} pending</>
            )}
          </div>
        </div>
        {tiles.others.map((t) => (
          <div key={t.label}>
            <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">{t.label}</div>
            <div className="mt-1 text-lg tabular-nums text-ink">
              {figure(t.totals.received, '5.5rem')}
            </div>
            {!loading && t.note && <div className="text-2xs text-ink-faint">{t.note}</div>}
          </div>
        ))}
      </section>

      <section aria-labelledby="add-income" className="mt-10">
        <h2 id="add-income" className="section-label mb-3">
          Record income
        </h2>
        <IncomeForm
          sourceLabels={Object.values(summary.data?.sourceLabels ?? {})}
          defaultCurrency={base}
        />
      </section>

      {summary.isError && (
        <ErrorNote onRetry={() => void summary.refetch()}>{errorMessage(summary.error)}</ErrorNote>
      )}

      {loading && (
        <section aria-labelledby="by-month" className="mt-12">
          <h2 id="by-month" className="section-label mb-4">
            By month
          </h2>
          <IncomeChartSkeleton />
        </section>
      )}

      {!loading && hasData && (
        <>
          <section aria-labelledby="by-month" className="mt-12">
            <h2 id="by-month" className="section-label mb-4">
              By month
            </h2>
            <IncomeChart summary={summary.data} currency={cur} current={now} />
          </section>
          <SourcesSection summaryCurrency={cur} now={now} summary={summary.data} />
          <YearsSection summary={summary.data} currency={cur} />
        </>
      )}

      <History onEdit={(id) => setParams({ entry: id })} />

      <EditIncome
        id={editId}
        onClose={() => setParams({}, { replace: true })}
        sourceLabels={Object.values(summary.data?.sourceLabels ?? {})}
      />
    </Page>
  );
}

type OverviewPeriod = 'all' | 'year' | 'month';

interface Tile {
  label: string;
  totals: { received: number; pending: number };
  note?: string | null;
}

/**
 * The three overview figures for a period. Comparisons are always like for like
 * (a full period against the same span before it), never a part-month against a full month.
 */
function overviewTiles(
  summary: Parameters<typeof rangeTotals>[0],
  period: OverviewPeriod,
  now: string,
  cur: string,
) {
  const year = now.slice(0, 4);
  const ytd = rangeTotals(summary, `${year}-01`, now, cur);
  const lastYtd = rangeTotals(summary, `${Number(year) - 1}-01`, shiftMonth(now, -12), cur);
  const ytdNote = percentChange(ytd.received, lastYtd.received)
    ? `vs same period ${Number(year) - 1}: ${percentChange(ytd.received, lastYtd.received)}`
    : null;

  if (period === 'all') {
    const last12 = rangeTotals(summary, shiftMonth(now, -11), now, cur);
    const prev12 = rangeTotals(summary, shiftMonth(now, -23), shiftMonth(now, -12), cur);
    const change = percentChange(last12.received, prev12.received);
    return {
      main: { label: 'All time', totals: rangeTotals(summary, '0000-00', '9999-99', cur) } as Tile,
      others: [
        { label: 'Last 12 months', totals: last12, note: change && `vs the 12 before: ${change}` },
        { label: `${year} so far`, totals: ytd, note: ytdNote },
      ] as Tile[],
    };
  }
  if (period === 'year') {
    return {
      main: { label: `${year} so far`, totals: ytd } as Tile,
      others: [
        { label: `Same period ${Number(year) - 1}`, totals: lastYtd, note: ytdNote },
        { label: monthLabel(now, 'long'), totals: monthTotals(summary, now, cur) },
      ] as Tile[],
    };
  }
  const lastMonth = monthTotals(summary, shiftMonth(now, -1), cur);
  return {
    main: { label: monthLabel(now, 'long'), totals: monthTotals(summary, now, cur) } as Tile,
    others: [
      {
        label: monthLabel(shiftMonth(now, -1), 'long'),
        totals: lastMonth,
        note: lastMonth.pending > 0 ? `${formatMoney(lastMonth.pending, cur)} still pending` : null,
      },
      { label: `${year} so far`, totals: ytd, note: ytdNote },
    ] as Tile[],
  };
}

function SourcesSection({
  summary,
  summaryCurrency,
  now,
}: {
  summary: Parameters<typeof bySource>[0];
  summaryCurrency: string;
  now: string;
}) {
  const [period, setPeriod] = useState<'month' | 'last' | 'year' | 'all'>('all');
  const ranges = {
    month: [now, now],
    last: [shiftMonth(now, -1), shiftMonth(now, -1)],
    year: [`${now.slice(0, 4)}-01`, now],
    all: ['0000-00', '9999-99'],
  } as const;
  const rows = bySource(summary, ranges[period][0], ranges[period][1], summaryCurrency);
  return (
    <section aria-labelledby="by-source" className="mt-12">
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <h2 id="by-source" className="section-label flex-1">
          Where it came from
        </h2>
        <Segmented
          label="Period"
          value={period}
          onChange={setPeriod}
          options={[
            { value: 'month', label: 'This month' },
            { value: 'last', label: 'Last month' },
            { value: 'year', label: 'This year' },
            { value: 'all', label: 'All' },
          ]}
        />
      </div>
      {rows.length ? (
        <SourceBars rows={rows} currency={summaryCurrency} />
      ) : (
        <p className="text-sm text-ink-faint">Nothing received in this period.</p>
      )}
    </section>
  );
}

function YearsSection({
  summary,
  currency,
}: {
  summary: Parameters<typeof bySource>[0];
  currency: string;
}) {
  const years = [...new Set(Object.keys(summary?.months ?? {}).map((m) => m.slice(0, 4)))]
    .sort()
    .reverse();
  const rows = years
    .map((y) => ({ y, ...rangeTotals(summary, `${y}-01`, `${y}-12`, currency) }))
    .filter((r) => r.received || r.pending);
  if (rows.length < 1) return null;
  return (
    <section aria-labelledby="by-year" className="mt-12">
      <h2 id="by-year" className="section-label mb-2">
        By year
      </h2>
      <table className="w-full max-w-md text-sm">
        <tbody className="divide-y divide-line/70">
          {rows.map((r) => (
            <tr key={r.y}>
              <td className="py-2 text-ink-muted">{r.y}</td>
              <td className="py-2 text-right tabular-nums text-ink">
                {formatMoney(r.received, currency)}
              </td>
              <td className="py-2 pl-4 text-right text-2xs tabular-nums text-ink-faint">
                {r.pending ? `${formatMoney(r.pending, currency)} pending` : ''}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

/** Quick to fill: amount and source are all that's needed; date defaults to today. */
function IncomeForm({
  entry,
  sourceLabels,
  defaultCurrency,
  onDone,
}: {
  entry?: IncomeEntry;
  sourceLabels: string[];
  defaultCurrency: string;
  onDone?: () => void;
}) {
  const [amount, setAmount] = useState(entry ? amountInput(entry.amountMinor, entry.currency) : '');
  // Unset until picked, so a default that arrives after the form appears still applies.
  const [picked, setCurrency] = useState<string | null>(entry?.currency ?? null);
  const currency = picked ?? defaultCurrency;
  const [source, setSource] = useState(entry?.source ?? '');
  const [date, setDate] = useState(entry?.date ?? today());
  const [status, setStatus] = useState<IncomeStatus>(entry?.status ?? 'received');
  const [description, setDescription] = useState(entry?.description ?? '');
  const [showMore, setShowMore] = useState(!!entry?.description);
  const [error, setError] = useState<string | null>(null);
  const add = useAddIncome();
  const update = useUpdateIncome();
  const toast = useToast();
  const listId = useId();
  const currencies = [...new Set([currency, defaultCurrency, ...COMMON_CURRENCIES])];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountMinor = parseAmount(amount, currency);
    if (!amountMinor) return setError('Enter an amount, like 120 or 49.90.');
    if (!source.trim()) return setError('Where did it come from?');
    const body = {
      amountMinor,
      currency,
      source: source.trim(),
      date,
      status,
      description: description.trim(),
    };
    const opts = {
      onSuccess: () => {
        if (!entry) {
          setAmount('');
          setDescription('');
          setStatus('received');
          toast({
            message: `Recorded ${formatMoney(amountMinor, currency)} from ${source.trim()}`,
          });
        }
        onDone?.();
      },
      onError: (err: unknown) => setError(errorMessage(err)),
    };
    if (entry) update.mutate({ id: entry.id, patch: body }, opts);
    else add.mutate(body, opts);
  };

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[9rem_5.5rem_1fr_9.5rem]">
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount"
          autoComplete="off"
          className={cn(controlClass, 'h-10 tabular-nums sm:h-9')}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency"
          className={cn(controlClass, 'h-10 w-[5.5rem] sm:h-9')}
        >
          {currencies.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          value={source}
          onChange={(e) => setSource(e.target.value)}
          list={listId}
          placeholder="Source, e.g. Gumroad"
          aria-label="Source"
          maxLength={80}
          className={cn(controlClass, 'col-span-2 h-10 sm:col-span-1 sm:h-9')}
        />
        <datalist id={listId}>
          {sourceLabels.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && setDate(e.target.value)}
          aria-label="Date"
          className={cn(controlClass, 'col-span-2 h-10 sm:col-span-1 sm:h-9')}
        />
      </div>
      {showMore && (
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Note (optional)"
          aria-label="Note"
          maxLength={2000}
          className={cn(controlClass, 'h-10 sm:h-9')}
        />
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Segmented
          label="Status"
          value={status}
          onChange={setStatus}
          options={[
            { value: 'received', label: 'Received' },
            { value: 'pending', label: 'Pending' },
          ]}
        />
        {!showMore && (
          <button
            type="button"
            onClick={() => setShowMore(true)}
            className="text-[0.8125rem] text-ink-faint hover:text-ink-muted"
          >
            Add a note
          </button>
        )}
        <Button
          type="submit"
          variant="primary"
          className="ml-auto"
          busy={add.isPending || update.isPending}
        >
          {entry ? 'Save' : 'Record'}
        </Button>
      </div>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

function History({ onEdit }: { onEdit: (id: string) => void }) {
  const list = useIncomeList();
  const entries = list.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = new Map<string, IncomeEntry[]>();
  for (const e of entries)
    groups.set(e.date.slice(0, 7), [...(groups.get(e.date.slice(0, 7)) ?? []), e]);

  return (
    <section aria-labelledby="history" className="mt-12">
      <h2 id="history" className="section-label mb-1">
        History
      </h2>
      {list.isLoading ? (
        <HistorySkeleton />
      ) : list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorMessage(list.error)}</ErrorNote>
      ) : !entries.length ? (
        <Empty>
          Nothing recorded yet. Each payout, sale or invoice paid is one line, as small as an amount
          and where it came from.
        </Empty>
      ) : (
        [...groups].map(([month, items]) => (
          <div key={month} className="mt-4">
            <h3 className="mb-1 text-[0.8125rem] font-medium text-ink-muted">
              {monthLabel(month, 'long')}
            </h3>
            <ul className="divide-y divide-line/70 border-y border-line/70">
              {items.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => onEdit(e.id)}
                    className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded px-2 py-2.5 text-left hover:bg-surface/70 active:bg-surface"
                  >
                    <span className="w-16 shrink-0 text-2xs text-ink-faint">
                      {formatRelativeDay(e.date)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[0.9375rem] text-ink">{e.source}</span>
                      {e.description && (
                        <span className="block truncate text-2xs text-ink-faint">
                          {e.description}
                        </span>
                      )}
                    </span>
                    {e.status === 'pending' && (
                      <span className="shrink-0 text-2xs uppercase tracking-wider text-warn">
                        Pending
                      </span>
                    )}
                    <span
                      className={cn(
                        'shrink-0 tabular-nums',
                        e.status === 'pending' ? 'text-ink-muted' : 'text-ink',
                      )}
                    >
                      {formatMoney(e.amountMinor, e.currency)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))
      )}
      {list.hasNextPage && (
        <Button
          className="mt-6"
          onClick={() => void list.fetchNextPage()}
          busy={list.isFetchingNextPage}
        >
          Show earlier
        </Button>
      )}
    </section>
  );
}

function EditIncome({
  id,
  onClose,
  sourceLabels,
}: {
  id: string | null;
  onClose: () => void;
  sourceLabels: string[];
}) {
  const list = useIncomeList();
  const entry = list.data?.pages.flatMap((p) => p.items).find((e) => e.id === id);
  const del = useDeleteIncome();
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <Dialog open={!!id} onClose={onClose} title="Edit income" placement="top">
      <div className="p-4">
        {entry ? (
          <>
            <IncomeForm
              key={entry.id}
              entry={entry}
              sourceLabels={sourceLabels}
              defaultCurrency={entry.currency}
              onDone={onClose}
            />
            <button
              type="button"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: 'Delete this entry?',
                    message: `${formatMoney(entry.amountMinor, entry.currency)} from ${entry.source}`,
                    confirmLabel: 'Delete',
                    danger: true,
                  }))
                )
                  return;
                await del
                  .mutateAsync(entry.id)
                  .then(() => {
                    toast({ message: 'Deleted' });
                    onClose();
                  })
                  .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
              }}
              className="mt-4 text-[0.8125rem] text-bad hover:underline"
            >
              Delete entry
            </button>
          </>
        ) : list.isLoading ? (
          <Loading />
        ) : (
          <p className="text-sm text-ink-muted">This entry isn&apos;t in the recent history.</p>
        )}
      </div>
    </Dialog>
  );
}
