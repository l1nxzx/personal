import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { MoneyIdeaStatus, MoneyIdeaSummary } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote, Segmented } from '../../components/ui/misc';
import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo } from '../../lib/dates';
import { FilterSearch } from '../entries/ListParts';
import { useProjectNames } from '../projects/api';
import { STATUS, useCreateMoneyIdea, useMoneyIdeas, useSetIdeaStatus } from './ideasApi';
import { formatMoney } from './money';
import { MoneyTabs } from './MoneyTabs';

const GROUPS: { status: MoneyIdeaStatus; title: string; empty?: string }[] = [
  { status: 'testing', title: 'Testing' },
  { status: 'running', title: 'Running' },
  { status: 'idea', title: 'Ideas' },
  { status: 'dropped', title: 'Dropped' },
];

/** A practical board for ideas to make money: what's possible, being tried, working, or dropped. */
export default function MoneyIdeasPage() {
  const [archived, setArchived] = useState(false);
  const [filter, setFilter] = useState('');
  const [showDropped, setShowDropped] = useState(false);
  const ideas = useMoneyIdeas(archived);
  const create = useCreateMoneyIdea();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const f = filter.trim().toLowerCase();
  const items = (ideas.data ?? []).filter(
    (i) => !f || `${i.name} ${i.nextStep}`.toLowerCase().includes(f),
  );

  const add = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    create.mutate(
      { name: n },
      {
        onSuccess: (idea) => {
          setName('');
          toast({
            message: `Added “${idea.name}”`,
            action: { label: 'Open', onClick: () => navigate(`/money/ideas/${idea.id}`) },
          });
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <Page width="default">
      <PageHeader title="Money & Work">
        <MoneyTabs />
      </PageHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="-mx-2 mt-4 flex items-center gap-2 rounded px-2 focus-within:bg-surface/70"
      >
        <Plus
          className="h-[18px] w-[18px] shrink-0 text-ink-faint"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Add an idea for making money (just a name is enough)"
          aria-label="New idea"
          maxLength={200}
          enterKeyHint="done"
          className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
        />
        {name.trim() && (
          <button
            type="submit"
            disabled={create.isPending}
            className="h-9 shrink-0 rounded px-3 text-sm font-medium text-accent hover:bg-surface-2 active:bg-surface-2/60 sm:h-8"
          >
            Add
          </button>
        )}
      </form>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <FilterSearch value={filter} onChange={setFilter} placeholder="Search ideas" />
        <Segmented
          label="Show"
          value={archived ? 'archived' : 'current'}
          onChange={(v) => setArchived(v === 'archived')}
          options={[
            { value: 'current', label: 'Current' },
            { value: 'archived', label: 'Archived' },
          ]}
        />
      </div>
      <p className="mt-3 text-2xs text-ink-faint">
        Ideas and their estimates are not money. Only income you have received counts in Income, and
        only costs you record count in Expenses.
      </p>

      {ideas.isLoading ? (
        <Skeleton className="mt-8">
          <SkeletonText className="mb-1 text-2xs" width="6rem" />
          <ul className="divide-y divide-line/70">
            {[0, 1, 2].map((i) => (
              <li key={i} className="py-3.5">
                <SkeletonText className="font-serif text-[1.0625rem]" width={skeletonWidth(i)} />
                <SkeletonText className="mt-0.5 text-sm" width="70%" />
                <SkeletonText className="mt-1 text-2xs" width="8rem" />
              </li>
            ))}
          </ul>
        </Skeleton>
      ) : ideas.isError ? (
        <ErrorNote onRetry={() => void ideas.refetch()}>{errorMessage(ideas.error)}</ErrorNote>
      ) : !items.length ? (
        <Empty>
          {f
            ? 'No ideas match.'
            : archived
              ? 'Nothing archived.'
              : 'Write down ways you might earn money. Test the promising ones cheaply, and keep what you learn.'}
        </Empty>
      ) : (
        GROUPS.map((g) => {
          const group = items.filter((i) => i.status === g.status);
          if (!group.length) return null;
          const collapsed = g.status === 'dropped' && !showDropped && !f;
          return (
            <section key={g.status} className="mt-8" aria-labelledby={`g-${g.status}`}>
              <div className="mb-1 flex items-baseline gap-3">
                <h2 id={`g-${g.status}`} className="section-label flex-1">
                  {g.title} <span className="normal-case tracking-normal">· {group.length}</span>
                </h2>
                {g.status === 'dropped' && !f && (
                  <button
                    type="button"
                    onClick={() => setShowDropped((s) => !s)}
                    className="text-2xs text-ink-faint hover:text-ink-muted"
                  >
                    {showDropped ? 'Hide' : 'Show'}
                  </button>
                )}
              </div>
              {!collapsed && (
                <ul className="divide-y divide-line/70">
                  {group.map((i) => (
                    <li key={i.id}>
                      <IdeaRow idea={i} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </Page>
  );
}

function IdeaRow({ idea }: { idea: MoneyIdeaSummary }) {
  const setStatus = useSetIdeaStatus();
  const toast = useToast();
  const projects = useProjectNames();
  const effort = [
    idea.hours ? `${idea.hours} h` : null,
    idea.spentMinor && idea.currency
      ? `${formatMoney(idea.spentMinor, idea.currency)} spent`
      : null,
    idea.experimentCount
      ? `${idea.experimentCount} ${idea.experimentCount === 1 ? 'experiment' : 'experiments'}`
      : null,
    idea.projectId && projects.get(idea.projectId)
      ? `Project: ${projects.get(idea.projectId)}`
      : null,
  ].filter(Boolean);

  return (
    <div className="flex items-start gap-2">
      <Link
        to={`/money/ideas/${idea.id}`}
        className="-mx-2 min-w-0 flex-1 rounded px-2 py-3.5 hover:bg-surface/70 active:bg-surface"
      >
        <h3
          className={cn(
            'truncate font-serif text-[1.0625rem] font-medium',
            idea.status === 'dropped' ? 'text-ink-muted' : 'text-ink',
          )}
          style={{ fontVariationSettings: "'opsz' 20" }}
        >
          {idea.name}
        </h3>
        {idea.status !== 'dropped' &&
          (idea.nextStep ? (
            <p className="mt-0.5 text-sm text-ink">
              <span className="text-accent">Next:</span> {idea.nextStep}
            </p>
          ) : (
            <p className="mt-0.5 text-sm text-ink-faint">No next step yet</p>
          ))}
        <p className="mt-1 text-2xs text-ink-faint">
          {[...effort, formatAgo(idea.updatedAt)].join(' · ')}
        </p>
      </Link>
      <div className="pt-3">
        <Menu
          trigger={(p) => (
            <button
              type="button"
              {...p}
              aria-label={`Status of ${idea.name}`}
              className="inline-flex h-9 items-center gap-1 rounded border border-line px-2 text-[0.8125rem] text-ink-muted hover:text-ink sm:h-7"
            >
              {STATUS.find((s) => s.value === idea.status)!.label}
              <ChevronDown className="h-3 w-3" />
            </button>
          )}
          items={[
            ...STATUS.filter((s) => s.value !== idea.status).map((s) => ({
              label: `Move to ${s.label}`,
              onSelect: () =>
                setStatus.mutate(
                  { id: idea.id, patch: { status: s.value } },
                  {
                    onSuccess: () => toast({ message: `${idea.name}: ${s.label}` }),
                    onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                  },
                ),
            })),
            {
              label: idea.archived ? 'Unarchive' : 'Archive',
              onSelect: () =>
                setStatus.mutate({ id: idea.id, patch: { archived: !idea.archived } }),
            },
          ]}
        />
      </div>
    </div>
  );
}
