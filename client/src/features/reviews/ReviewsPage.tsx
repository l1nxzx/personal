import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { WeekContext, WeeklyReview, WeeklyReviewAnswers } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { AutoSaveText } from '../../components/ui/AutoSaveText';
import { IconButton } from '../../components/ui/Button';
import { ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { apiFetch, errorMessage } from '../../lib/apiFetch';
import { addDays, formatRelativeDay, parseLocalDate, today, toLocalDate } from '../../lib/dates';
import { JournalSectionHeader } from '../entries/ListParts';
import { formatMoney } from '../money/money';
import { focusFirstFieldIn, useQuickAction } from '../../context/UIContext';

export const QUESTIONS: { key: keyof WeeklyReviewAnswers; question: string }[] = [
  { key: 'happened', question: 'What happened this week?' },
  { key: 'learned', question: 'What did you learn, or change your mind about?' },
  { key: 'accomplished', question: 'What did you get done?' },
  { key: 'work', question: 'How did your work and income go?' },
  { key: 'focus', question: 'What would you like to focus on next week?' },
];

/** Monday of the week containing `date` (local). */
export function weekStartOf(date: string): string {
  const d = parseLocalDate(date);
  return toLocalDate(new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7)));
}

const weekLabel = (start: string) => {
  const fmt = new Intl.DateTimeFormat(undefined, { day: 'numeric', month: 'short' });
  return `${fmt.format(parseLocalDate(start))} – ${fmt.format(parseLocalDate(addDays(start, 6)))}`;
};

/**
 * An optional weekly review. Starts from what the app already knows about the week;
 * every question can be skipped, and answering one is enough.
 */
export default function ReviewsPage() {
  const [params, setParams] = useSearchParams();
  const thisWeek = weekStartOf(today());
  const week = params.get('week') ?? thisWeek;
  const qc = useQueryClient();
  const toast = useToast();

  const data = useQuery({
    queryKey: ['reviews', week],
    queryFn: () =>
      apiFetch<{ review: WeeklyReview | null; context: WeekContext }>(`/reviews/${week}`),
  });
  const past = useQuery({
    queryKey: ['reviews', 'list'],
    queryFn: async () => (await apiFetch<{ items: WeeklyReview[] }>('/reviews')).items,
  });

  const save = (key: keyof WeeklyReviewAnswers, value: string) =>
    apiFetch<{ review: WeeklyReview | null }>(`/reviews/${week}`, {
      method: 'PUT',
      body: { [key]: value },
    })
      .then(({ review }) => {
        qc.setQueryData<{ review: WeeklyReview | null; context: WeekContext }>(
          ['reviews', week],
          (d) => (d ? { ...d, review } : d),
        );
        void qc.invalidateQueries({ queryKey: ['reviews', 'list'] });
      })
      .catch((err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }));

  const answersRef = useRef<HTMLDivElement>(null);
  useQuickAction(
    data.isSuccess ? "Answer this week's review" : null,
    () => focusFirstFieldIn(answersRef.current, { emptyFirst: true }),
    { priority: 1 },
  );

  const go = (delta: number) => setParams({ week: addDays(week, delta * 7) }, { replace: true });

  return (
    <Page width="narrow">
      <JournalSectionHeader newTo="/journal/new" newLabel="New entry" />

      <div className="mt-6 flex items-center gap-2">
        <IconButton label="Previous week" onClick={() => go(-1)}>
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <h2
          className="min-w-0 flex-1 text-center font-serif text-[1.25rem] text-ink"
          style={{ fontVariationSettings: "'opsz' 28" }}
        >
          {week === thisWeek
            ? 'This week'
            : week === addDays(thisWeek, -7)
              ? 'Last week'
              : `Week of ${weekLabel(week)}`}
          <span className="block font-sans text-2xs text-ink-faint">{weekLabel(week)}</span>
        </h2>
        <IconButton label="Next week" onClick={() => go(1)} disabled={week >= thisWeek}>
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>

      {data.isLoading ? (
        <ReviewSkeleton />
      ) : data.isError ? (
        <ErrorNote onRetry={() => void data.refetch()}>{errorMessage(data.error)}</ErrorNote>
      ) : (
        <>
          <WeekFacts context={data.data!.context} />
          <div ref={answersRef} className="mt-8 space-y-8">
            {QUESTIONS.map((q) => (
              <section key={`${week}:${q.key}`} aria-labelledby={`q-${q.key}`}>
                <h3
                  id={`q-${q.key}`}
                  className="font-serif text-[1.0625rem] text-ink"
                  style={{ fontVariationSettings: "'opsz' 20" }}
                >
                  {q.question}
                </h3>
                <AutoSaveText
                  className="mt-1"
                  value={data.data!.review?.answers[q.key] ?? ''}
                  onSave={(v) => void save(q.key, v)}
                  label={q.question}
                  placeholder="Optional"
                  minRows={2}
                />
              </section>
            ))}
          </div>
          <p className="mt-6 text-2xs text-ink-faint">
            Answer as many or as few as you like. Saved as you write.
          </p>
        </>
      )}

      {(past.data?.length ?? 0) > 0 && (
        <section className="mt-14" aria-labelledby="past-reviews">
          <h2 id="past-reviews" className="section-label mb-1">
            Earlier reviews
          </h2>
          <ul className="divide-y divide-line/70">
            {past.data!.map((r) => {
              const first = QUESTIONS.map((q) => r.answers[q.key]).find((a) => a.trim());
              return (
                <li key={r.weekStart}>
                  <button
                    type="button"
                    onClick={() => setParams({ week: r.weekStart })}
                    className="-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-3 text-left hover:bg-surface/70 active:bg-surface"
                  >
                    <span className="block text-sm text-ink">{weekLabel(r.weekStart)}</span>
                    {first && (
                      <span className="block truncate text-[0.8125rem] text-ink-muted">
                        {first}
                      </span>
                    )}
                  </button>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </Page>
  );
}

/** The week while it loads: the facts box in outline, then the questions, answers pending. */
function ReviewSkeleton() {
  return (
    <>
      <Skeleton className="mt-6 bg-surface px-4 py-3">
        <SkeletonText className="text-2xs" width="8rem" />
        <SkeletonText className="mt-2 text-sm" width="70%" />
        <SkeletonText className="mt-1.5 text-sm" width="50%" />
      </Skeleton>
      <div className="mt-8 space-y-8">
        {QUESTIONS.map((q) => (
          <section key={q.key}>
            <h3
              className="font-serif text-[1.0625rem] text-ink"
              style={{ fontVariationSettings: "'opsz' 20" }}
            >
              {q.question}
            </h3>
            <Skeleton className="mt-1">
              <SkeletonText className="text-[0.9375rem] leading-7" width="4rem" />
              <div className="h-7" />
              <div className="mt-1 h-4" />
            </Skeleton>
          </section>
        ))}
      </div>
    </>
  );
}

/** What the app already knows about the week, as a starting point. Facts only. */
function WeekFacts({ context }: { context: WeekContext }) {
  const money = (m: Record<string, number>) =>
    Object.entries(m)
      .map(([c, v]) => formatMoney(v, c))
      .join(' + ');
  const rows: [string, React.ReactNode][] = [];
  if (context.tasksDone.length)
    rows.push([
      `${context.tasksDone.length} ${context.tasksDone.length === 1 ? 'task' : 'tasks'} done`,
      context.tasksDone
        .slice(0, 6)
        .map((t) => t.title)
        .join(' · ') + (context.tasksDone.length > 6 ? ' …' : ''),
    ]);
  if (context.journal.length)
    rows.push([
      `${context.journal.length} journal ${context.journal.length === 1 ? 'entry' : 'entries'}`,
      context.journal.map((j, i) => (
        <span key={j.id}>
          {i > 0 && ' · '}
          <Link to={`/journal/${j.id}`} className="hover:text-ink hover:underline">
            {j.title || formatRelativeDay(j.date)}
          </Link>
        </span>
      )),
    ]);
  if (context.notes.length)
    rows.push([
      `${context.notes.length} new ${context.notes.length === 1 ? 'note' : 'notes'}`,
      context.notes.map((n, i) => (
        <span key={n.id}>
          {i > 0 && ' · '}
          <Link to={`/ideas/${n.id}`} className="hover:text-ink hover:underline">
            {n.title || 'Untitled'}
          </Link>
        </span>
      )),
    ]);
  if (context.perspectives.length)
    rows.push([
      'Changed your view',
      context.perspectives.map((p) => p.title || 'Untitled').join(' · '),
    ]);
  if (Object.keys(context.income).length) rows.push(['Income received', money(context.income)]);
  if (Object.keys(context.expenses).length)
    rows.push(['Expenses recorded', money(context.expenses)]);

  return (
    <section aria-label="This week so far" className="mt-6 bg-surface px-4 py-3">
      <h3 className="text-2xs uppercase tracking-[0.12em] text-ink-faint">From your notebook</h3>
      {rows.length ? (
        <dl className="mt-2 space-y-1.5 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="grid grid-cols-1 gap-0.5 sm:grid-cols-[10rem_1fr] sm:gap-3">
              <dt className="text-ink">{k}</dt>
              <dd className="min-w-0 text-ink-muted">{v}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-1 text-sm text-ink-faint">Nothing recorded this week. That&apos;s fine.</p>
      )}
    </section>
  );
}
