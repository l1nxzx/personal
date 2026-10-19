import { useQuery } from '@tanstack/react-query';
import { ArrowRight, Search, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { EntrySummary, WeeklyReview } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { IconButton } from '../../components/ui/Button';
import { ErrorNote } from '../../components/ui/misc';
import { useAuth } from '../../context/AuthContext';
import { useUI } from '../../context/UIContext';
import { apiFetch, errorMessage } from '../../lib/apiFetch';
import { formatAgo, formatLongDate, greeting, today } from '../../lib/dates';
import { hrefFor, TYPE_LABEL } from '../../lib/routes';
import { CaptureForm } from '../capture/CaptureForm';
import { useHome, usePrefs, useUpdatePrefs } from '../me/api';
import { useIncomeSummary } from '../money/api';
import { formatMoney, monthKey, monthLabel, monthTotals, shiftMonth } from '../money/money';
import { AddTask } from '../tasks/AddTask';
import { useOpenTasks } from '../tasks/api';
import { TaskList } from '../tasks/TasksPage';
import { todayGroups } from '../tasks/views';
import { promptFor } from './prompts';

const TODAY_LIMIT = 8;

export default function HomePage() {
  const { user } = useAuth();
  const { openSearch } = useUI();
  const firstName = user?.displayName.split(' ')[0] ?? '';
  const t = today();

  return (
    <Page width="wide">
      <header className="pt-safe">
        <div className="flex items-start pt-5 lg:pt-12">
          <div className="min-w-0 flex-1">
            <p className="text-2xs font-medium uppercase tracking-[0.12em] text-ink-faint">
              {formatLongDate(t)}
            </p>
            <h1 className="page-title mt-1.5">
              {greeting()}
              {firstName && `, ${firstName}`}.
            </h1>
            <FocusLine />
          </div>
          <IconButton label="Search" onClick={openSearch} className="-mr-2 lg:hidden">
            <Search className="h-5 w-5" strokeWidth={1.75} />
          </IconButton>
        </div>
      </header>

      <div className="mt-8 grid grid-cols-1 gap-x-14 gap-y-10 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="min-w-0 space-y-10">
          <div>
            <div className="rounded-md border border-line bg-surface focus-within:border-line-strong">
              <CaptureForm
                draftKey="capture:home"
                placeholder="Save a thought, a task, a line worth keeping…"
              />
            </div>
            <InboxLine />
          </div>
          <TodaySection />
        </div>

        <aside className="flex min-w-0 flex-col gap-10">
          <div className="order-4 lg:order-1">
            <Reflection />
          </div>
          <div className="order-1 empty:hidden lg:order-2">
            <ToRevisit />
            <WeekReview />
          </div>
          <div className="order-5 empty:hidden lg:order-5">
            <OnThisDay />
          </div>
          <div className="order-2">
            <MoneyOverview />
          </div>
          <div className="order-1 lg:order-3">
            <Continue />
          </div>
          <div className="order-3 lg:order-4">
            <RecentlyAdded />
          </div>
        </aside>
      </div>
    </Page>
  );
}

/** An optional line the owner writes for themselves. Never generated. */
function FocusLine() {
  const prefs = usePrefs();
  const update = useUpdatePrefs();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const value = prefs.data?.focusLine ?? '';

  if (!prefs.data) return <div className="mt-2 h-6" />;

  const save = () => {
    setEditing(false);
    if (draft.trim() !== value) update.mutate({ focusLine: draft.trim() });
  };

  if (editing) {
    return (
      <input
        autoFocus
        value={draft}
        maxLength={200}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === 'Enter') save();
          if (e.key === 'Escape') setEditing(false);
        }}
        placeholder="What matters this week?"
        aria-label="Focus line"
        className="mt-2 h-8 w-full max-w-xl border-b border-line bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:border-accent/70 focus:outline-none focus-visible:outline-none"
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        setDraft(value);
        setEditing(true);
      }}
      className={
        value
          ? 'mt-2 max-w-xl text-left text-[0.9375rem] leading-6 text-ink-muted hover:text-ink'
          : 'mt-2 text-left text-sm text-ink-faint hover:text-ink-muted'
      }
      title="Edit focus line"
    >
      {value || 'Add a line for this week'}
    </button>
  );
}

function InboxLine() {
  const home = useHome();
  const n = home.data?.inboxCount ?? 0;
  if (!n) return null;
  return (
    <Link
      to="/inbox"
      className="mt-3 inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
    >
      {n} {n === 1 ? 'item' : 'items'} in your inbox
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

function TodaySection() {
  const open = useOpenTasks();
  const t = today();
  const { due, planned } = todayGroups(open.data ?? [], t);
  const total = due.length + planned.length;
  const shownDue = due.slice(0, TODAY_LIMIT);
  const shownPlanned = planned.slice(0, Math.max(0, TODAY_LIMIT - shownDue.length));

  return (
    <section aria-labelledby="home-today">
      <div className="mb-1 flex items-baseline gap-3">
        <h2 id="home-today" className="section-label flex-1">
          Today
        </h2>
        <Link to="/tasks" className="text-2xs text-ink-faint hover:text-ink-muted">
          All tasks
        </Link>
      </div>
      {open.isError && (
        <ErrorNote onRetry={() => void open.refetch()}>{errorMessage(open.error)}</ErrorNote>
      )}
      {shownDue.length > 0 && <TaskList tasks={shownDue} showPlanned={false} />}
      {shownDue.length > 0 && shownPlanned.length > 0 && (
        <div className="my-1 border-t border-line/60" />
      )}
      {shownPlanned.length > 0 && <TaskList tasks={shownPlanned} showPlanned={false} />}
      {open.isSuccess && total === 0 && (
        <p className="py-2 text-sm text-ink-faint">Nothing for today.</p>
      )}
      {total > TODAY_LIMIT && (
        <Link to="/tasks" className="mt-1 inline-block text-sm text-ink-muted hover:text-ink">
          {total - TODAY_LIMIT} more for today
        </Link>
      )}
      <div className="mt-1">
        <AddTask planToday placeholder="Add a task for today" />
      </div>
    </section>
  );
}

function Reflection() {
  const prefs = usePrefs();
  const update = useUpdatePrefs();
  const t = today();
  if (!prefs.data || !prefs.data.showPrompts || prefs.data.promptDismissedOn === t) return null;
  const prompt = promptFor(t);

  return (
    <section aria-labelledby="home-prompt" className="group">
      <div className="mb-3 flex items-center gap-3">
        <h2 id="home-prompt" className="section-label flex-1">
          A question
        </h2>
        <button
          type="button"
          aria-label="Not today"
          title="Not today"
          onClick={() => update.mutate({ promptDismissedOn: t })}
          className="-my-2 flex h-9 w-9 items-center justify-center rounded text-ink-faint hover:bg-surface-2 hover:text-ink sm:h-7 sm:w-7"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <p
        className="font-serif text-[1.1875rem] italic leading-snug text-ink"
        style={{ fontVariationSettings: "'opsz' 24" }}
      >
        {prompt}
      </p>
      <Link
        to="/journal/new"
        state={{ prompt }}
        className="mt-3 inline-flex items-center gap-1.5 text-sm text-accent hover:underline hover:underline-offset-2"
      >
        Write about it
        <ArrowRight className="h-3.5 w-3.5" />
      </Link>
    </section>
  );
}

function Continue() {
  const home = useHome();
  const recent = home.data?.recent ?? [];

  return (
    <section aria-labelledby="home-continue">
      <h2 id="home-continue" className="section-label mb-2">
        Continue
      </h2>
      {home.isError && (
        <ErrorNote onRetry={() => void home.refetch()}>{errorMessage(home.error)}</ErrorNote>
      )}
      {home.isSuccess && !recent.length && (
        <p className="py-2 text-sm text-ink-faint">
          What you write will show up here.{' '}
          <Link to="/journal/new" className="text-accent hover:underline hover:underline-offset-2">
            Start an entry
          </Link>
        </p>
      )}
      <ul className="-mx-2">
        {recent.map((e) => (
          <li key={`${e.kind}:${e.id}`}>
            <RecentRow e={e} />
          </li>
        ))}
      </ul>
    </section>
  );
}

function RecentRow({ e }: { e: EntrySummary }) {
  const title = e.title || (e.kind === 'journal' && e.date ? formatLongDate(e.date) : 'Untitled');
  return (
    <Link to={hrefFor(e.kind, e.id)} className="block rounded px-2 py-2.5 hover:bg-surface/70">
      <span
        className="block truncate font-serif text-[1rem] font-medium text-ink"
        style={{ fontVariationSettings: "'opsz' 20" }}
      >
        {title}
      </span>
      {e.excerpt && (
        <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-5 text-ink-muted">
          {e.excerpt}
        </span>
      )}
      <span className="mt-0.5 block text-2xs text-ink-faint">
        {TYPE_LABEL[e.kind]} · {formatAgo(e.updatedAt)}
      </span>
    </Link>
  );
}

/** Income this month in the base currency, against last month. Facts only, no scoring. */
function MoneyOverview() {
  const summary = useIncomeSummary();
  const prefs = usePrefs();
  if (!summary.data || !prefs.data) return null;
  const cur = prefs.data.baseCurrency;
  const now = monthKey(new Date());
  const month = monthTotals(summary.data, now, cur);
  const last = monthTotals(summary.data, shiftMonth(now, -1), cur);
  const any = Object.keys(summary.data.months).length > 0;

  return (
    <section aria-labelledby="home-money">
      <div className="mb-2 flex items-baseline gap-3">
        <h2 id="home-money" className="section-label flex-1">
          Money
        </h2>
        <Link to="/money" className="text-2xs text-ink-faint hover:text-ink-muted">
          Details
        </Link>
      </div>
      {any ? (
        <Link to="/money" className="-mx-2 block rounded px-2 py-1.5 hover:bg-surface/70">
          <span className="block text-2xs text-ink-faint">{monthLabel(now, 'long')}</span>
          <span className="block text-xl tabular-nums text-ink">
            {formatMoney(month.received, cur)}
          </span>
          <span className="mt-0.5 block text-[0.8125rem] text-ink-muted">
            {month.pending > 0 && `${formatMoney(month.pending, cur)} pending · `}
            {monthLabel(shiftMonth(now, -1))}: {formatMoney(last.received, cur)}
          </span>
        </Link>
      ) : (
        <p className="py-1 text-sm text-ink-faint">
          No income recorded yet.{' '}
          <Link to="/money" className="text-accent hover:underline hover:underline-offset-2">
            Record a payment
          </Link>
        </p>
      )}
    </section>
  );
}

/** Decisions whose revisit date has come and that have no recorded outcome yet. */
function ToRevisit() {
  const home = useHome();
  const due = home.data?.toRevisit ?? [];
  if (!due.length) return null;
  return (
    <section aria-labelledby="home-revisit" className="mb-8 last:mb-0">
      <h2 id="home-revisit" className="section-label mb-2">
        Decisions to look back on
      </h2>
      <ul className="-mx-2">
        {due.map((d) => (
          <li key={d.id}>
            <Link
              to={hrefFor(d.kind, d.id)}
              className="block rounded px-2 py-2 hover:bg-surface/70"
            >
              <span className="block truncate text-sm text-ink">
                {d.title || 'Untitled decision'}
              </span>
              <span className="block text-2xs text-ink-faint">How did it turn out?</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** From Friday to Sunday, a quiet link to this week's review until one is started. */
function WeekReview() {
  const t = today();
  const day = new Date(`${t}T12:00:00`).getDay();
  const weekend = day === 5 || day === 6 || day === 0;
  const monday = (() => {
    const d = new Date(`${t}T12:00:00`);
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  })();
  const reviews = useQuery({
    queryKey: ['reviews', 'list'],
    queryFn: async () => (await apiFetch<{ items: WeeklyReview[] }>('/reviews')).items,
    enabled: weekend,
  });
  if (!weekend || !reviews.isSuccess || reviews.data.some((r) => r.weekStart === monday))
    return null;
  return (
    <Link
      to="/reviews"
      className="inline-flex items-center gap-1.5 text-sm text-ink-muted hover:text-ink"
    >
      Look back on this week
      <ArrowRight className="h-3.5 w-3.5" />
    </Link>
  );
}

/** Entries and notes written on this date in earlier years. Can be turned off in Settings. */
function OnThisDay() {
  const home = useHome();
  const prefs = usePrefs();
  const items = home.data?.onThisDay ?? [];
  if (!items.length || !prefs.data?.showOnThisDay) return null;
  const year = Number(today().slice(0, 4));
  return (
    <section aria-labelledby="home-otd">
      <h2 id="home-otd" className="section-label mb-2">
        On this day
      </h2>
      <ul className="-mx-2">
        {items.map((i) => {
          const ago = year - Number(i.date.slice(0, 4));
          return (
            <li key={`${i.ref.type}:${i.ref.id}`}>
              <Link
                to={hrefFor(i.ref.type, i.ref.id)}
                className="block rounded px-2 py-2.5 hover:bg-surface/70"
              >
                <span className="block text-2xs text-ink-faint">
                  {ago === 1 ? 'A year ago' : `${ago} years ago`} · {TYPE_LABEL[i.ref.type]}
                </span>
                <span
                  className="block truncate font-serif text-[1rem] text-ink"
                  style={{ fontVariationSettings: "'opsz' 20" }}
                >
                  {i.title || formatLongDate(i.date)}
                </span>
                {i.excerpt && (
                  <span className="mt-0.5 line-clamp-2 text-[0.8125rem] leading-5 text-ink-muted">
                    {i.excerpt}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Books, files and projects added lately. Hidden when there's nothing. */
function RecentlyAdded() {
  const home = useHome();
  const added = home.data?.added ?? [];
  if (!added.length) return null;
  return (
    <section aria-labelledby="home-added">
      <h2 id="home-added" className="section-label mb-2">
        Recently added
      </h2>
      <ul className="-mx-2">
        {added.map((a) => (
          <li key={`${a.ref.type}:${a.ref.id}`}>
            <Link
              to={hrefFor(a.ref.type, a.ref.id)}
              className="flex items-baseline gap-3 rounded px-2 py-2 hover:bg-surface/70"
            >
              <span className="w-12 shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
                {TYPE_LABEL[a.ref.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{a.title}</span>
                {a.subtitle && (
                  <span className="block truncate text-2xs text-ink-faint">{a.subtitle}</span>
                )}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
