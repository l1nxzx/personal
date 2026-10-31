import { Ellipsis, Plus } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { Expense, ExpenseSummary, Frequency, Subscription } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { controlClass } from '../../components/ui/Field';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote, Loading, Segmented } from '../../components/ui/misc';
import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatRelativeDay, today } from '../../lib/dates';
import { usePrefs } from '../me/api';
import { useProjects } from '../projects/api';
import {
  FREQUENCY_LABEL,
  monthlyEquivalent,
  useAddExpense,
  useDeleteExpense,
  useExpenseList,
  useExpenseSummary,
  useSubscriptionMutations,
  useSubscriptions,
  useUpdateExpense,
} from './expensesApi';
import { SourceBars } from './IncomeChart';
import { useMoneyIdeas } from './ideasApi';
import {
  amountInput,
  COMMON_CURRENCIES,
  formatMoney,
  monthKey,
  monthLabel,
  parseAmount,
  shiftMonth,
} from './money';
import { HistorySkeleton, Pending } from './MoneySkeletons';
import { MoneyTabs } from './MoneyTabs';
import { focusFirstFieldIn, useQuickAction } from '../../context/UIContext';

type Period = 'all' | 'year' | 'month';

function periodRange(period: Period, now: string): [string, string] {
  if (period === 'month') return [now, now];
  if (period === 'year') return [`${now.slice(0, 4)}-01`, now];
  return ['0000-00', '9999-99'];
}

function totalsFor(summary: ExpenseSummary | undefined, from: string, to: string, cur: string) {
  let total = 0;
  const cats = new Map<string, number>();
  for (const [m, byCur] of Object.entries(summary?.months ?? {})) {
    if (m < from || m > to) continue;
    const t = byCur[cur];
    if (!t) continue;
    total += t.total;
    for (const [k, v] of Object.entries(t.categories)) cats.set(k, (cats.get(k) ?? 0) + v);
  }
  const rows = [...cats]
    .filter(([, v]) => v > 0)
    .map(([key, amount]) => ({ key, label: summary?.categoryLabels[key] ?? key, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { total, rows };
}

/** Recorded expenses (actual) and subscriptions (projections until a payment is recorded). */
export default function ExpensesPage() {
  const prefs = usePrefs();
  const addRef = useRef<HTMLElement>(null);
  useQuickAction('Record an expense', () => focusFirstFieldIn(addRef.current));
  const base = prefs.data?.baseCurrency ?? 'EUR';
  const summary = useExpenseSummary();
  const subs = useSubscriptions();
  const [period, setPeriod] = useState<Period>('all');
  const [params, setParams] = useSearchParams();
  const editId = params.get('entry');
  const now = monthKey(new Date());
  const [from, to] = periodRange(period, now);
  const { total, rows } = totalsFor(summary.data, from, to, base);
  // Second figure: this month, or last month when the main figure already is this month.
  const sideMonth = period === 'month' ? shiftMonth(now, -1) : now;
  const sideTotal = totalsFor(summary.data, sideMonth, sideMonth, base).total;

  const active = (subs.data ?? []).filter((s) => s.active);
  const recurring = active.reduce<Record<string, number>>((acc, s) => {
    acc[s.currency] = (acc[s.currency] ?? 0) + monthlyEquivalent(s);
    return acc;
  }, {});
  const categories = Object.values(summary.data?.categoryLabels ?? {});
  // Totals are in the base currency, so they wait for it as well as for the summary.
  const loading = summary.isLoading || prefs.isLoading;
  // Couldn't load: no figures rather than zeros (the error and retry show below the form).
  const failed = !summary.data && summary.isError;
  const figure = (amount: number, width: string) =>
    loading ? <Pending width={width} /> : failed ? '—' : formatMoney(amount, base);

  return (
    <Page width="default">
      <PageHeader title="Money & Work">
        <MoneyTabs />
      </PageHeader>

      <div className="mt-4">
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
      </div>

      <section
        aria-label="Overview"
        className="mt-6 grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3"
      >
        <div className="col-span-2 sm:col-span-1">
          <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">
            Recorded ·{' '}
            {period === 'all'
              ? 'all time'
              : period === 'year'
                ? `${now.slice(0, 4)} so far`
                : monthLabel(now, 'long')}
          </div>
          <div
            className="mt-1 font-serif text-[2rem] leading-none tabular-nums text-ink"
            style={{ fontVariationSettings: "'opsz' 48" }}
          >
            {figure(total, '8rem')}
          </div>
          <div className="mt-1.5 text-sm text-ink-muted">actual expenses</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">
            {period === 'month' ? 'Last month' : 'This month'} · {monthLabel(sideMonth)}
          </div>
          <div className="mt-1 text-lg tabular-nums text-ink">{figure(sideTotal, '5.5rem')}</div>
        </div>
        <div>
          <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">
            Recurring · estimate
          </div>
          <div className="mt-1 text-lg tabular-nums text-ink">
            {subs.isLoading ? (
              <Pending width="5.5rem" />
            ) : Object.keys(recurring).length ? (
              Object.entries(recurring)
                .map(([c, v]) => `≈ ${formatMoney(v, c)}`)
                .join(' + ')
            ) : (
              '—'
            )}
          </div>
          <div className="text-2xs text-ink-faint">
            per month
            {!subs.isLoading &&
              `, from ${active.length} active ${active.length === 1 ? 'subscription' : 'subscriptions'}`}
          </div>
        </div>
      </section>

      <section ref={addRef} aria-labelledby="add-expense" className="mt-10">
        <h2 id="add-expense" className="section-label mb-3">
          Record an expense
        </h2>
        <ExpenseForm categories={categories} defaultCurrency={base} />
      </section>

      {summary.isError && (
        <ErrorNote onRetry={() => void summary.refetch()}>{errorMessage(summary.error)}</ErrorNote>
      )}

      <Subscriptions
        subs={subs.data}
        loading={subs.isLoading}
        error={subs.error}
        onRetry={() => void subs.refetch()}
        base={base}
        categories={categories}
      />

      {rows.length > 0 && (
        <section aria-labelledby="by-cat" className="mt-12">
          <h2 id="by-cat" className="section-label mb-4">
            By category
          </h2>
          <SourceBars rows={rows} currency={base} />
        </section>
      )}

      <History onEdit={(id) => setParams({ entry: id })} />
      <EditExpense
        id={editId}
        categories={categories}
        onClose={() => setParams({}, { replace: true })}
      />
    </Page>
  );
}

/** "Connected to" choices: money ideas and projects (optional). */
function useConnectionOptions() {
  const ideas = useMoneyIdeas(false);
  const projects = useProjects();
  return [
    ...(ideas.data ?? []).map((i) => ({ value: `idea:${i.id}`, label: `Idea: ${i.name}` })),
    ...(projects.data ?? [])
      .filter((p) => p.status !== 'done')
      .map((p) => ({ value: `project:${p.id}`, label: `Project: ${p.name}` })),
  ];
}

function ExpenseForm({
  entry,
  categories,
  defaultCurrency,
  onDone,
}: {
  entry?: Expense;
  categories: string[];
  defaultCurrency: string;
  onDone?: () => void;
}) {
  const [amount, setAmount] = useState(entry ? amountInput(entry.amountMinor, entry.currency) : '');
  // Unset until picked, so a default that arrives after the form appears still applies.
  const [picked, setCurrency] = useState<string | null>(entry?.currency ?? null);
  const currency = picked ?? defaultCurrency;
  const [category, setCategory] = useState(entry?.category ?? '');
  const [date, setDate] = useState(entry?.date ?? today());
  const [description, setDescription] = useState(entry?.description ?? '');
  const [connection, setConnection] = useState(
    entry?.moneyIdeaId
      ? `idea:${entry.moneyIdeaId}`
      : entry?.projectId
        ? `project:${entry.projectId}`
        : '',
  );
  const [error, setError] = useState<string | null>(null);
  const add = useAddExpense();
  const update = useUpdateExpense();
  const toast = useToast();
  const listId = useId();
  const options = useConnectionOptions();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    const amountMinor = parseAmount(amount, currency);
    if (!amountMinor) return setError('Enter an amount, like 12 or 9.99.');
    const [kind, id] = connection.split(':');
    const body = {
      amountMinor,
      currency,
      category: category.trim(),
      date,
      description: description.trim(),
      moneyIdeaId: kind === 'idea' ? id! : null,
      projectId: kind === 'project' ? id! : null,
    };
    const opts = {
      onSuccess: () => {
        if (!entry) {
          setAmount('');
          setDescription('');
          toast({
            message: `Recorded ${formatMoney(amountMinor, currency)}${body.category ? ` · ${body.category}` : ''}`,
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
          {[...new Set([currency, defaultCurrency, ...COMMON_CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list={listId}
          placeholder="Category, e.g. Software"
          aria-label="Category"
          maxLength={60}
          className={cn(controlClass, 'col-span-2 h-10 sm:col-span-1 sm:h-9')}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
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
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_16rem]">
        <input
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="What it was (optional)"
          aria-label="Description"
          maxLength={2000}
          className={cn(controlClass, 'h-10 sm:h-9')}
        />
        <select
          value={connection}
          onChange={(e) => setConnection(e.target.value)}
          aria-label="Connected to (optional)"
          className={cn(controlClass, 'h-10 sm:h-9')}
        >
          <option value="">Not connected</option>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
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
    </form>
  );
}

function SubscriptionForm({
  initial,
  categories,
  base,
  onDone,
}: {
  initial?: Subscription;
  categories: string[];
  base: string;
  onDone: () => void;
}) {
  const [name, setName] = useState(initial?.name ?? '');
  const [amount, setAmount] = useState(
    initial ? amountInput(initial.amountMinor, initial.currency) : '',
  );
  const [currency, setCurrency] = useState(initial?.currency ?? base);
  const [frequency, setFrequency] = useState<Frequency>(initial?.frequency ?? 'monthly');
  const [nextRenewal, setNextRenewal] = useState(initial?.nextRenewal ?? '');
  const [category, setCategory] = useState(initial?.category ?? '');
  const [error, setError] = useState<string | null>(null);
  const { add, update } = useSubscriptionMutations();
  const listId = useId();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const amountMinor = parseAmount(amount, currency);
    if (!name.trim()) return setError('Give it a name.');
    if (!amountMinor) return setError('Enter the amount per payment.');
    const body = {
      name: name.trim(),
      amountMinor,
      currency,
      frequency,
      nextRenewal: nextRenewal || null,
      category: category.trim(),
    };
    const opts = { onSuccess: onDone, onError: (err: unknown) => setError(errorMessage(err)) };
    if (initial) update.mutate({ id: initial.id, patch: body }, opts);
    else add.mutate(body, opts);
  };

  return (
    <form onSubmit={submit} className="space-y-2 border-l-2 border-accent/50 pl-4">
      <div className="grid grid-cols-[1fr_auto] gap-2 sm:grid-cols-[1fr_8rem_5.5rem]">
        <input
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name, e.g. Notion"
          aria-label="Name"
          maxLength={120}
          className={cn(controlClass, 'col-span-2 h-10 sm:col-span-1 sm:h-9')}
        />
        <input
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          inputMode="decimal"
          placeholder="Amount"
          aria-label="Amount per payment"
          className={cn(controlClass, 'h-10 sm:h-9')}
        />
        <select
          value={currency}
          onChange={(e) => setCurrency(e.target.value)}
          aria-label="Currency"
          className={cn(controlClass, 'h-10 w-[5.5rem] sm:h-9')}
        >
          {[...new Set([currency, base, ...COMMON_CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-[10rem_10rem_1fr]">
        <select
          value={frequency}
          onChange={(e) => setFrequency(e.target.value as Frequency)}
          aria-label="How often"
          className={cn(controlClass, 'h-10 sm:h-9')}
        >
          {(Object.keys(FREQUENCY_LABEL) as Frequency[]).map((f) => (
            <option key={f} value={f}>
              {FREQUENCY_LABEL[f]}
            </option>
          ))}
        </select>
        <input
          type="date"
          value={nextRenewal}
          onChange={(e) => setNextRenewal(e.target.value)}
          aria-label="Next renewal"
          className={cn(controlClass, 'h-10 sm:h-9')}
        />
        <input
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          list={listId}
          placeholder="Category (optional)"
          aria-label="Category"
          className={cn(controlClass, 'col-span-2 h-10 sm:col-span-1 sm:h-9')}
        />
        <datalist id={listId}>
          {categories.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" busy={add.isPending || update.isPending}>
          {initial ? 'Save' : 'Add subscription'}
        </Button>
        <Button size="sm" variant="ghost" onClick={onDone}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Subscriptions({
  subs,
  loading,
  error,
  onRetry,
  base,
  categories,
}: {
  subs: Subscription[] | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
  base: string;
  categories: string[];
}) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const [showCancelled, setShowCancelled] = useState(false);
  const { update, remove, pay } = useSubscriptionMutations();
  const confirm = useConfirm();
  const toast = useToast();
  const t = today();
  const list = (subs ?? []).filter((s) => s.active || showCancelled);
  const cancelledCount = (subs ?? []).filter((s) => !s.active).length;

  const recordPayment = async (s: Subscription) => {
    const date = s.nextRenewal && s.nextRenewal <= t ? s.nextRenewal : t;
    const ok = await confirm({
      title: `Record a ${formatMoney(s.amountMinor, s.currency)} payment for ${s.name}?`,
      message: `It is added to Expenses as an actual cost on ${formatRelativeDay(date)}, and the next renewal moves on by one period.`,
      confirmLabel: 'Record payment',
    });
    if (!ok) return;
    pay.mutate(
      { id: s.id, date },
      {
        onSuccess: ({ subscription }) =>
          toast({
            message: `Recorded. Next renewal ${subscription.nextRenewal ? formatRelativeDay(subscription.nextRenewal) : 'not set'}`,
          }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <section aria-labelledby="subs" className="mt-12">
      <div className="mb-1 flex items-center gap-3">
        <h2 id="subs" className="section-label flex-1">
          Subscriptions & recurring costs
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="-my-1 inline-flex h-9 items-center gap-1 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-7"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      <p className="mb-3 text-2xs text-ink-faint">
        Amounts here are projections. A payment only counts as an expense once you record it.
      </p>
      {adding && (
        <div className="mb-4">
          <SubscriptionForm categories={categories} base={base} onDone={() => setAdding(false)} />
        </div>
      )}
      {loading ? (
        <Skeleton>
          <ul className="divide-y divide-line/70 border-y border-line/70">
            {[0, 1].map((i) => (
              <li key={i} className="py-2.5">
                <SkeletonText className="text-[0.9375rem]" width={skeletonWidth(i)} />
                <SkeletonText className="text-2xs" width="9rem" />
              </li>
            ))}
          </ul>
        </Skeleton>
      ) : error && !subs ? (
        <ErrorNote onRetry={onRetry}>{errorMessage(error)}</ErrorNote>
      ) : !list.length && !adding ? (
        <p className="text-sm text-ink-faint">No subscriptions yet.</p>
      ) : (
        <ul className="divide-y divide-line/70 border-y border-line/70">
          {list.map((s) =>
            editing === s.id ? (
              <li key={s.id} className="py-3">
                <SubscriptionForm
                  initial={s}
                  categories={categories}
                  base={base}
                  onDone={() => setEditing(null)}
                />
              </li>
            ) : (
              <li key={s.id} className="flex items-center gap-2 py-2.5">
                <div className="min-w-0 flex-1">
                  <div
                    className={cn(
                      'truncate text-[0.9375rem]',
                      s.active ? 'text-ink' : 'text-ink-faint line-through',
                    )}
                  >
                    {s.name}
                  </div>
                  <div className="text-2xs text-ink-faint">
                    {formatMoney(s.amountMinor, s.currency)}{' '}
                    {FREQUENCY_LABEL[s.frequency].toLowerCase()}
                    {s.frequency !== 'monthly' &&
                      ` · ≈ ${formatMoney(monthlyEquivalent(s), s.currency)}/month`}
                    {s.active && s.nextRenewal && (
                      <span className={s.nextRenewal < t ? 'text-warn' : ''}>
                        {' · '}
                        {s.nextRenewal < t
                          ? `Renewal was due ${formatRelativeDay(s.nextRenewal)}`
                          : `Renews ${formatRelativeDay(s.nextRenewal)}`}
                      </span>
                    )}
                    {!s.active && ' · cancelled'}
                  </div>
                </div>
                {s.active && (
                  <Button
                    size="sm"
                    onClick={() => void recordPayment(s)}
                    busy={pay.isPending && pay.variables?.id === s.id}
                  >
                    Paid
                  </Button>
                )}
                <Menu
                  trigger={(p) => (
                    <IconButton label={`Actions for ${s.name}`} {...p}>
                      <Ellipsis className="h-4 w-4" />
                    </IconButton>
                  )}
                  items={[
                    { label: 'Edit', onSelect: () => setEditing(s.id) },
                    {
                      label: s.active ? 'Mark as cancelled' : 'Reactivate',
                      onSelect: () => update.mutate({ id: s.id, patch: { active: !s.active } }),
                    },
                    {
                      label: 'Delete…',
                      danger: true,
                      onSelect: async () => {
                        if (
                          await confirm({
                            title: `Delete ${s.name}?`,
                            message: 'Expenses already recorded from it stay.',
                            confirmLabel: 'Delete',
                            danger: true,
                          })
                        ) {
                          remove.mutate(s.id);
                        }
                      },
                    },
                  ]}
                />
              </li>
            ),
          )}
        </ul>
      )}
      {cancelledCount > 0 && (
        <button
          type="button"
          onClick={() => setShowCancelled((v) => !v)}
          className="mt-2 text-2xs text-ink-faint hover:text-ink-muted"
        >
          {showCancelled ? 'Hide' : 'Show'} {cancelledCount} cancelled
        </button>
      )}
    </section>
  );
}

function History({ onEdit }: { onEdit: (id: string) => void }) {
  const list = useExpenseList();
  const entries = list.data?.pages.flatMap((p) => p.items) ?? [];
  const groups = new Map<string, Expense[]>();
  for (const e of entries)
    groups.set(e.date.slice(0, 7), [...(groups.get(e.date.slice(0, 7)) ?? []), e]);
  return (
    <section aria-labelledby="exp-history" className="mt-12">
      <h2 id="exp-history" className="section-label mb-1">
        History
      </h2>
      {list.isLoading ? (
        <HistorySkeleton />
      ) : list.isError ? (
        <ErrorNote onRetry={() => void list.refetch()}>{errorMessage(list.error)}</ErrorNote>
      ) : !entries.length ? (
        <Empty>
          Nothing recorded yet. An expense is just an amount and a date; everything else is
          optional.
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
                      <span className="block truncate text-[0.9375rem] text-ink">
                        {e.description || e.category || 'Expense'}
                      </span>
                      {e.description && e.category && (
                        <span className="block truncate text-2xs text-ink-faint">{e.category}</span>
                      )}
                    </span>
                    <span className="shrink-0 tabular-nums text-ink">
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

function EditExpense({
  id,
  onClose,
  categories,
}: {
  id: string | null;
  onClose: () => void;
  categories: string[];
}) {
  const list = useExpenseList();
  const entry = list.data?.pages.flatMap((p) => p.items).find((e) => e.id === id);
  const del = useDeleteExpense();
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <Dialog open={!!id} onClose={onClose} title="Edit expense" placement="top">
      <div className="p-4">
        {entry ? (
          <>
            <ExpenseForm
              key={entry.id}
              entry={entry}
              categories={categories}
              defaultCurrency={entry.currency}
              onDone={onClose}
            />
            <button
              type="button"
              onClick={async () => {
                if (
                  !(await confirm({
                    title: 'Delete this expense?',
                    message: formatMoney(entry.amountMinor, entry.currency),
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
              Delete expense
            </button>
          </>
        ) : list.isLoading ? (
          <Loading />
        ) : (
          <p className="text-sm text-ink-muted">This expense isn&apos;t in the recent history.</p>
        )}
      </div>
    </Dialog>
  );
}
