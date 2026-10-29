import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type {
  ActivityStats,
  ContentStatKey,
  NoteType,
  ProfileStats,
  WritingStatKey,
} from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Empty, ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonText } from '../../components/ui/Skeleton';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { daysBetween, formatRelativeDay, toLocalDate } from '../../lib/dates';
import { formatSize } from '../documents/api';
import { useProfile, useRecount } from './api';
import { formatDuration, plural } from './format';
import { UsageHistory } from './UsageHistory';

const nf = new Intl.NumberFormat();
const fmtDate = new Intl.DateTimeFormat(undefined, {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});
const fmtMonth = new Intl.DateTimeFormat(undefined, { month: 'long', year: 'numeric' });
const fmtTime = new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit' });

/** "2 years, 3 months", "5 days". */
function timeSince(iso: string, now = new Date()): string {
  const d = new Date(iso);
  let months = (now.getFullYear() - d.getFullYear()) * 12 + now.getMonth() - d.getMonth();
  if (now.getDate() < d.getDate()) months -= 1;
  if (months < 1) {
    const days = daysBetween(toLocalDate(d), toLocalDate(now));
    return days < 1 ? 'since today' : plural(days, 'day');
  }
  const years = Math.floor(months / 12);
  return [years && plural(years, 'year'), months % 12 && plural(months % 12, 'month')]
    .filter(Boolean)
    .join(', ');
}

/** "today at 21:10", "yesterday at 9:02", "12 Oct at 18:30". */
function lastSeen(iso: string): string {
  const d = new Date(iso);
  const day = formatRelativeDay(toLocalDate(d));
  const label = ['Today', 'Yesterday'].includes(day) ? day.toLowerCase() : day;
  return `${label} at ${fmtTime.format(d)}`;
}

const formatBytes = (bytes: number) =>
  bytes >= 1024 ** 3 ? `${(bytes / 1024 ** 3).toFixed(1)} GB` : formatSize(bytes);

const CONTENT_LABELS: Record<ContentStatKey, string> = {
  journal: 'Journal entries',
  writing: 'Writings',
  review: 'Weekly reviews',
  moment: 'Timeline moments',
  note: 'Notes',
  project: 'Projects',
  task: 'Tasks',
  book: 'Books',
  document: 'Files',
  moneyIdea: 'Money-making ideas',
  income: 'Income records',
  expense: 'Expenses',
  subscription: 'Subscriptions',
};

/** Sections of the site, in the order of the navigation. */
const CONTENT_GROUPS: { title: string; keys: ContentStatKey[] }[] = [
  { title: 'Journal & Writing', keys: ['journal', 'writing', 'review', 'moment'] },
  { title: 'Ideas & Knowledge', keys: ['note'] },
  { title: 'Money & Work', keys: ['moneyIdea', 'income', 'expense', 'subscription'] },
  { title: 'Projects & Tasks', keys: ['project', 'task'] },
  { title: 'Library', keys: ['book'] },
  { title: 'Documents', keys: ['document'] },
];

const NOTE_TYPE_LABELS: Record<NoteType, [string, string]> = {
  note: ['note', 'notes'],
  question: ['question', 'questions'],
  belief: ['belief', 'beliefs'],
  quote: ['quote', 'quotes'],
  decision: ['decision', 'decisions'],
};

const WRITING_LABELS: Record<WritingStatKey, string> = {
  journal: 'Journal',
  writing: 'Writing',
  note: 'Ideas & notes',
  review: 'Weekly reviews',
  moment: 'Timeline moments',
  book: 'Book notes',
  project: 'Project descriptions',
  moneyIdea: 'Money-making ideas',
};

export default function ProfilePage() {
  const profile = useProfile();
  return (
    <Page width="default">
      <PageHeader title="Profile" />
      {profile.isPending && <ProfileSkeleton />}
      {profile.isError && (
        <ErrorNote onRetry={() => void profile.refetch()}>{errorMessage(profile.error)}</ErrorNote>
      )}
      {profile.data && (
        <>
          <Identity memberSince={profile.data.memberSince} />
          <TimeSection a={profile.data.activity} />
          <WritingSection w={profile.data.writing} />
          <ContentSection c={profile.data.content} />
          <UsageHistory activity={profile.data.activity} />
          <MonthsSection a={profile.data.activity} />
          <HowCounted />
        </>
      )}
    </Page>
  );
}

/**
 * While the figures load: the name (already known), then the first two sections with their
 * real headings and labels, numbers left as placeholders.
 */
function ProfileSkeleton() {
  const { user } = useAuth();
  const figure = (label: string, large?: boolean, note?: string) => (
    <Figure
      large={large}
      label={label}
      note={note}
      value={
        <Skeleton>
          <SkeletonText width={large ? '7rem' : '3.5rem'} />
        </Skeleton>
      }
    />
  );
  return (
    <>
      <section aria-label="You" className="mt-3">
        <p className="font-serif text-xl text-ink" style={{ fontVariationSettings: "'opsz' 30" }}>
          {user?.displayName}
        </p>
        <Skeleton>
          <SkeletonText className="mt-1 text-sm" width="15rem" />
          <SkeletonText className="mt-0.5 text-sm" width="12rem" />
        </Skeleton>
      </section>
      <Section id="profile-time" title="Time here">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
          {figure('Active time', true)}
          {figure('Days active')}
          {figure('Sessions')}
        </div>
      </Section>
      <Section id="profile-writing" title="Writing">
        <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
          {figure('Words written', true)}
          {figure('Characters', false, 'not counting spaces')}
          {figure('Written entries')}
        </div>
      </Section>
    </>
  );
}

function Identity({ memberSince }: { memberSince: string }) {
  const { user } = useAuth();
  return (
    <section aria-label="You" className="mt-3">
      <p className="font-serif text-xl text-ink" style={{ fontVariationSettings: "'opsz' 30" }}>
        {user?.displayName}
      </p>
      <p className="mt-1 text-sm text-ink-muted">
        Here since {fmtDate.format(new Date(memberSince))}
        <span className="text-ink-faint"> · {timeSince(memberSince)}</span>
      </p>
      <p className="mt-0.5 text-sm text-ink-faint">
        {user?.email} ·{' '}
        <Link to="/settings" className="underline underline-offset-2 hover:text-ink">
          Change name
        </Link>
      </p>
    </section>
  );
}

function Figure({
  label,
  value,
  note,
  large,
}: {
  label: string;
  value: ReactNode;
  note?: ReactNode;
  large?: boolean;
}) {
  return (
    <div className={large ? 'col-span-2 sm:col-span-1' : undefined}>
      <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">{label}</div>
      {large ? (
        <div
          className="mt-1 font-serif text-[2rem] leading-none tabular-nums text-ink"
          style={{ fontVariationSettings: "'opsz' 48" }}
        >
          {value}
        </div>
      ) : (
        <div className="mt-1 text-lg tabular-nums text-ink">{value}</div>
      )}
      {note && <div className="mt-1.5 text-sm text-ink-muted">{note}</div>}
    </div>
  );
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-12">
      <h2 id={id} className="section-label mb-4">
        {title}
      </h2>
      {children}
    </section>
  );
}

function TimeSection({ a }: { a: ActivityStats }) {
  const facts = [
    a.lastActiveAt && `Last active ${lastSeen(a.lastActiveAt)}`,
    a.longestSessionSeconds > 0 && `longest session ${formatDuration(a.longestSessionSeconds)}`,
    a.days > 0 && `about ${formatDuration(a.totalSeconds / a.days)} on an active day`,
  ].filter(Boolean);
  return (
    <Section id="profile-time" title="Time here">
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Figure large label="Active time" value={formatDuration(a.totalSeconds)} />
        <Figure label="Days active" value={nf.format(a.days)} />
        <Figure label="Sessions" value={nf.format(a.sessions)} />
      </div>
      {facts.length > 0 && (
        <p className="mt-5 text-sm text-ink-muted">
          {facts.join(' · ').replace(/^./, (ch) => ch.toUpperCase())}
        </p>
      )}
    </Section>
  );
}

function WritingSection({ w }: { w: ProfileStats['writing'] }) {
  const rows = w.items.filter((i) => i.items > 0 || i.words > 0);
  return (
    <Section id="profile-writing" title="Writing">
      <div className="grid grid-cols-2 gap-x-8 gap-y-6 sm:grid-cols-3">
        <Figure large label="Words written" value={nf.format(w.words)} />
        <Figure label="Characters" value={nf.format(w.chars)} />
        <Figure label="Written entries" value={nf.format(w.entries)} />
      </div>
      {rows.length ? (
        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="text-left text-2xs uppercase tracking-[0.12em] text-ink-faint">
              <th className="pb-2 font-normal">Where</th>
              <th className="pb-2 text-right font-normal">Words</th>
              <th className="hidden pb-2 pl-4 text-right font-normal sm:table-cell">Characters</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line/70 border-t border-line/70">
            {rows.map((r) => (
              <tr key={r.key}>
                <td className="py-2">
                  <span className="text-ink-muted">{WRITING_LABELS[r.key]}</span>
                  <span className="ml-2 text-2xs tabular-nums text-ink-faint">
                    {plural(r.items, 'item')}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums text-ink">{nf.format(r.words)}</td>
                <td className="hidden py-2 pl-4 text-right tabular-nums text-ink-muted sm:table-cell">
                  {nf.format(r.chars)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <Empty>Nothing written yet.</Empty>
      )}
    </Section>
  );
}

function ContentSection({ c }: { c: ProfileStats['content'] }) {
  const count = (key: ContentStatKey) => c.items.find((i) => i.key === key)?.count ?? 0;
  const details: Partial<Record<ContentStatKey, string>> = {
    note: c.noteTypes
      .filter((t) => t.count > 0)
      .map((t) => `${nf.format(t.count)} ${NOTE_TYPE_LABELS[t.type][t.count === 1 ? 0 : 1]}`)
      .join(' · '),
    task: c.tasksDone ? `${nf.format(c.tasksDone)} done` : '',
    document: count('document')
      ? `${formatBytes(c.documentBytes)}${c.folders ? ` in ${plural(c.folders, 'folder')}` : ''}`
      : '',
  };

  return (
    <Section id="profile-content" title="Everything kept here">
      <p className="text-sm text-ink-muted">
        <span className="text-lg tabular-nums text-ink">{nf.format(c.total)}</span>{' '}
        {c.total === 1 ? 'item' : 'items'} in all
      </p>
      <div className="mt-6 grid grid-cols-1 gap-x-10 gap-y-7 sm:grid-cols-2">
        {CONTENT_GROUPS.map((g) => (
          <div key={g.title}>
            <h3 className="mb-1 text-sm font-medium text-ink">{g.title}</h3>
            <dl className="divide-y divide-line/70">
              {g.keys.map((key) => (
                <div key={key} className="py-2">
                  <div className="flex items-baseline justify-between gap-4 text-sm">
                    <dt className="text-ink-muted">{CONTENT_LABELS[key]}</dt>
                    <dd className="tabular-nums text-ink">{nf.format(count(key))}</dd>
                  </div>
                  {details[key] && (
                    <div className="mt-0.5 text-2xs text-ink-faint">{details[key]}</div>
                  )}
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Section>
  );
}

const monthLabel = (month: string) =>
  fmtMonth.format(new Date(Number(month.slice(0, 4)), Number(month.slice(5, 7)) - 1));

function MonthsSection({ a }: { a: ActivityStats }) {
  if (!a.months.length) return null;
  const max = Math.max(...a.months.map((m) => m.seconds));
  return (
    <Section id="profile-months" title="By month">
      <table className="w-full max-w-xl text-sm">
        <tbody className="divide-y divide-line/70">
          {a.months.map((m) => (
            <tr key={m.month}>
              <td className="w-[38%] py-2 text-ink-muted">{monthLabel(m.month)}</td>
              <td className="py-2 pr-4" aria-hidden>
                <div
                  className="h-1 rounded-sm bg-chart-1/70"
                  style={{ width: `${Math.max(2, (m.seconds / max) * 100)}%` }}
                />
              </td>
              <td className="whitespace-nowrap py-2 text-right tabular-nums text-ink">
                {formatDuration(m.seconds)}
              </td>
              <td className="whitespace-nowrap py-2 pl-4 text-right text-2xs tabular-nums text-ink-faint">
                {plural(m.days, 'day')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </Section>
  );
}

function HowCounted() {
  const recount = useRecount();
  const toast = useToast();
  const run = () =>
    recount.mutateAsync().then(
      () => toast({ message: 'Counted again' }),
      (err: unknown) => toast({ message: errorMessage(err), tone: 'error' }),
    );
  return (
    <div className="mt-12">
      <Button size="sm" onClick={() => void run()} busy={recount.isPending}>
        Count again
      </Button>
    </div>
  );
}
