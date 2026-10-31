import { ChevronLeft, Ellipsis, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import type { Experiment, MoneyIdea } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { AutoSaveText } from '../../components/ui/AutoSaveText';
import { Button, IconButton } from '../../components/ui/Button';
import { controlClass } from '../../components/ui/Field';
import { Menu } from '../../components/ui/Menu';
import { ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { ApiError, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatLongDate, formatRelativeDay, today } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import { usePrefs } from '../me/api';
import { useProjects } from '../projects/api';
import { useIncomeSummary } from './api';
import { useAddExpense, useExpensesFor } from './expensesApi';
import {
  STATUS,
  useDeleteMoneyIdea,
  useIdeaToProject,
  useMoneyIdea,
  useUpdateMoneyIdea,
} from './ideasApi';
import { amountInput, COMMON_CURRENCIES, formatMoney, parseAmount } from './money';

const newId = () => Math.random().toString(36).slice(2, 10);

export default function MoneyIdeaPage() {
  const { id = '' } = useParams();
  const idea = useMoneyIdea(id);
  const navigate = useNavigate();
  return (
    <Page width="narrow">
      <div className="pt-safe flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center lg:mt-4">
        <button
          type="button"
          onClick={() => navigate('/money/ideas')}
          className="-ml-2 flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-8"
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" /> Money ideas
        </button>
      </div>
      {idea.data ? (
        <IdeaView key={idea.data.id} idea={idea.data} />
      ) : idea.isError ? (
        idea.error instanceof ApiError && idea.error.status === 404 ? (
          <ErrorNote>This idea no longer exists.</ErrorNote>
        ) : (
          <ErrorNote onRetry={() => void idea.refetch()}>{errorMessage(idea.error)}</ErrorNote>
        )
      ) : (
        <Skeleton>
          <SkeletonText className="page-title" width="55%" />
          <div className="mt-4 flex gap-1">
            {['4.5rem', '5rem', '4rem', '4.5rem'].map((w, i) => (
              <SkeletonBlock key={i} className="h-9 sm:h-7" style={{ width: w }} />
            ))}
          </div>
          <SkeletonText className="mt-1.5 text-2xs" width="12rem" />
          <div className="mt-6 border-l-2 border-line bg-surface py-3 pl-4 pr-3">
            <SkeletonText className="text-2xs" width="4.5rem" />
            <SkeletonText className="mt-1 py-1 text-[1.0625rem] leading-7" width="70%" />
          </div>
        </Skeleton>
      )}
    </Page>
  );
}

function Section({
  id,
  title,
  children,
  aside,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
  aside?: React.ReactNode;
}) {
  return (
    <section className="mt-10" aria-labelledby={id}>
      <div className="mb-2 flex items-baseline gap-3">
        <h2 id={id} className="section-label flex-1">
          {title}
        </h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

function IdeaView({ idea }: { idea: MoneyIdea }) {
  const update = useUpdateMoneyIdea(idea.id);
  const del = useDeleteMoneyIdea();
  const toProject = useIdeaToProject(idea.id);
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(idea.name);
  const [next, setNext] = useState(idea.nextStep);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  const nextRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(nameRef, name);
  useAutosize(nextRef, next);
  const blurOnEnter = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.currentTarget.blur();
    }
  };

  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }),
    });

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${idea.name}”?`,
      message:
        'Its experiments and notes are deleted too. To keep what you learned, archive it or mark it Dropped instead.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await del
      .mutateAsync(idea.id)
      .then(() => {
        toast({ message: 'Idea deleted' });
        navigate('/money/ideas', { replace: true });
      })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <textarea
          ref={nameRef}
          rows={1}
          value={name}
          onChange={(e) => setName(e.target.value.replace(/\n/g, ' '))}
          onBlur={() => name.trim() && name.trim() !== idea.name && save({ name: name.trim() })}
          onKeyDown={blurOnEnter}
          aria-label="Name"
          maxLength={200}
          className="page-title min-w-0 flex-1 resize-none overflow-hidden bg-transparent focus:outline-none focus-visible:outline-none"
        />
        <Menu
          trigger={(p) => (
            <IconButton label="Idea actions" {...p} className="mt-1">
              <Ellipsis className="h-4 w-4" />
            </IconButton>
          )}
          items={[
            {
              label: idea.archived ? 'Unarchive' : 'Archive',
              onSelect: () => save({ archived: !idea.archived }),
            },
            { label: 'Delete…', icon: <Trash2 />, danger: true, onSelect: () => void remove() },
          ]}
        />
      </div>
      {idea.archived && (
        <p className="mt-1 text-2xs uppercase tracking-[0.12em] text-ink-faint">Archived</p>
      )}

      <div className="mt-4 flex flex-wrap gap-1" role="radiogroup" aria-label="Status">
        {STATUS.map((s) => (
          <button
            key={s.value}
            type="button"
            role="radio"
            aria-checked={idea.status === s.value}
            title={s.hint}
            onClick={() => idea.status !== s.value && save({ status: s.value })}
            className={cn(
              'h-9 rounded border px-3 text-sm sm:h-8',
              idea.status === s.value
                ? 'border-accent/60 bg-accent/10 text-ink'
                : 'border-line text-ink-muted hover:text-ink',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>
      <p className="mt-1.5 text-2xs text-ink-faint">
        {STATUS.find((s) => s.value === idea.status)!.hint}
      </p>

      <div className="mt-6 border-l-2 border-accent/60 bg-surface py-3 pl-4 pr-3">
        <label
          className="block text-2xs uppercase tracking-[0.12em] text-ink-faint"
          htmlFor="next-step"
        >
          Next step
        </label>
        <textarea
          ref={nextRef}
          id="next-step"
          rows={1}
          value={next}
          onChange={(e) => setNext(e.target.value.replace(/\n/g, ' '))}
          onBlur={() => next.trim() !== idea.nextStep && save({ nextStep: next.trim() })}
          onKeyDown={blurOnEnter}
          maxLength={1000}
          placeholder="The next concrete thing you could do"
          className="mt-1 block w-full resize-none overflow-hidden bg-transparent py-1 text-[1.0625rem] leading-7 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
        />
      </div>

      <Section id="i-desc" title="What it is">
        <AutoSaveText
          value={idea.description}
          onSave={(description) => save({ description })}
          label="Description"
          placeholder="What the idea is and how it would work"
          minRows={2}
        />
      </Section>
      <Section id="i-why" title="Why it might work">
        <AutoSaveText
          value={idea.whyItMightWork}
          onSave={(whyItMightWork) => save({ whyItMightWork })}
          label="Why it might work"
          placeholder="Demand, an advantage you have, a gap you've noticed"
          minRows={2}
        />
      </Section>

      <Experiments idea={idea} onChange={(experiments) => save({ experiments })} />

      <Section id="i-notes" title="Notes & results">
        <AutoSaveText
          value={idea.notes}
          onSave={(notes) => save({ notes })}
          label="Notes and results"
          placeholder="What you tried, what happened, what you learned, what you'd do differently"
        />
      </Section>

      <Effort idea={idea} onSave={save} />

      <ProjectConnection
        idea={idea}
        onLink={(projectId) => save({ projectId })}
        onCreate={() =>
          toProject.mutate(undefined, {
            onSuccess: ({ project }) =>
              toast({
                message: `Project “${project.name}” created`,
                action: { label: 'Open', onClick: () => navigate(`/tasks/projects/${project.id}`) },
              }),
            onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
          })
        }
        busy={toProject.isPending}
      />

      <MoneyConnections idea={idea} onSources={(incomeSources) => save({ incomeSources })} />

      <LinksPanel item={{ type: 'moneyIdea', id: idea.id }} className="mt-12" />
    </div>
  );
}

function ExperimentForm({
  initial,
  onSave,
  onCancel,
  defaultCurrency,
}: {
  initial?: Experiment;
  onSave: (e: Experiment) => void;
  onCancel: () => void;
  defaultCurrency: string;
}) {
  const [e, setE] = useState<Experiment>(
    initial ?? {
      id: newId(),
      date: today(),
      tried: '',
      outcome: '',
      lessons: '',
      hours: null,
      spentMinor: null,
      currency: null,
    },
  );
  const [spent, setSpent] = useState(
    initial?.spentMinor && initial.currency
      ? amountInput(initial.spentMinor, initial.currency)
      : '',
  );
  const currency = e.currency ?? defaultCurrency;
  const field = (key: 'tried' | 'outcome' | 'lessons', label: string, placeholder: string) => (
    <label className="block">
      <span className="text-[0.8125rem] text-ink-muted">{label}</span>
      <textarea
        value={e[key]}
        onChange={(ev) => setE({ ...e, [key]: ev.target.value })}
        rows={2}
        placeholder={placeholder}
        className={cn(controlClass, 'mt-1')}
      />
    </label>
  );
  return (
    <form
      onSubmit={(ev) => {
        ev.preventDefault();
        if (!e.tried.trim()) return;
        const spentMinor = spent.trim() ? parseAmount(spent, currency) : null;
        onSave({ ...e, spentMinor, currency: spentMinor ? currency : null });
      }}
      className="space-y-3 border-l-2 border-accent/50 pl-4"
    >
      <input
        type="date"
        value={e.date}
        onChange={(ev) => ev.target.value && setE({ ...e, date: ev.target.value })}
        aria-label="Date"
        className={cn(controlClass, 'h-10 w-auto sm:h-8')}
      />
      {field(
        'tried',
        'What I tried',
        'e.g. a landing page with a price, posted in two communities',
      )}
      {field('outcome', 'What happened', 'Numbers if you have them: visits, replies, sales')}
      {field('lessons', 'What I learned', 'What you would keep or change next time')}
      <div className="flex flex-wrap items-center gap-2">
        <input
          inputMode="decimal"
          value={e.hours ?? ''}
          onChange={(ev) =>
            setE({
              ...e,
              hours: ev.target.value
                ? Math.max(0, Number(ev.target.value.replace(',', '.'))) || null
                : null,
            })
          }
          placeholder="Hours"
          aria-label="Hours spent (optional)"
          className={cn(controlClass, 'h-10 w-24 sm:h-8')}
        />
        <input
          value={spent}
          onChange={(ev) => setSpent(ev.target.value)}
          inputMode="decimal"
          placeholder="Money spent"
          aria-label="Money spent (optional)"
          className={cn(controlClass, 'h-10 w-32 sm:h-8')}
        />
        <select
          value={currency}
          onChange={(ev) => setE({ ...e, currency: ev.target.value })}
          aria-label="Currency"
          className={cn(controlClass, 'h-10 w-[5.5rem] sm:h-8')}
        >
          {[...new Set([currency, ...COMMON_CURRENCIES])].map((c) => (
            <option key={c}>{c}</option>
          ))}
        </select>
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!e.tried.trim()}>
          Save experiment
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Experiments({ idea, onChange }: { idea: MoneyIdea; onChange: (e: Experiment[]) => void }) {
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const prefs = usePrefs();
  const addExpense = useAddExpense();
  const confirm = useConfirm();
  const toast = useToast();
  const base = prefs.data?.baseCurrency ?? 'EUR';
  const sorted = [...idea.experiments].sort((a, b) => b.date.localeCompare(a.date));

  const recordAsExpense = async (x: Experiment) => {
    if (!x.spentMinor || !x.currency) return;
    const ok = await confirm({
      title: 'Record this as a real expense?',
      message: `${formatMoney(x.spentMinor, x.currency)} on ${formatLongDate(x.date)} will be added to Expenses, connected to this idea. Only do this if you actually paid it.`,
      confirmLabel: 'Record expense',
    });
    if (!ok) return;
    addExpense.mutate(
      {
        date: x.date,
        amountMinor: x.spentMinor,
        currency: x.currency,
        category: 'Experiments',
        description: `${idea.name}: ${x.tried.slice(0, 120)}`,
        moneyIdeaId: idea.id,
      },
      {
        onSuccess: () => toast({ message: 'Recorded in Expenses' }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <Section
      id="i-exp"
      title="Experiments"
      aside={
        !adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="-my-1 inline-flex h-9 items-center gap-1 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-7"
          >
            <Plus className="h-3.5 w-3.5" /> Record
          </button>
        )
      }
    >
      {adding && (
        <div className="mb-6">
          <ExperimentForm
            defaultCurrency={base}
            onSave={(x) => {
              onChange([...idea.experiments, x]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {!sorted.length && !adding && (
        <p className="text-sm text-ink-faint">
          Small, cheap tests, each with what you tried, what happened and what you learned. They
          stay here even if you drop the idea.
        </p>
      )}
      <ol className="space-y-6">
        {sorted.map((x) =>
          editing === x.id ? (
            <li key={x.id}>
              <ExperimentForm
                initial={x}
                defaultCurrency={base}
                onSave={(n) => {
                  onChange(idea.experiments.map((y) => (y.id === x.id ? n : y)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={x.id} className="group border-l-2 border-line-strong pl-4">
              <div className="flex items-baseline gap-3">
                <span className="text-2xs uppercase tracking-[0.1em] text-ink-faint">
                  {formatRelativeDay(x.date)}
                </span>
                <span className="ml-auto flex gap-1 text-2xs">
                  <button
                    type="button"
                    onClick={() => setEditing(x.id)}
                    className="h-8 rounded px-2 text-ink-faint hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-6"
                  >
                    Edit
                  </button>
                  <IconButton
                    label="Delete experiment"
                    className="sm:h-6 sm:w-6"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Delete this experiment?',
                          message: 'What you learned from it will be gone.',
                          confirmLabel: 'Delete',
                          danger: true,
                        })
                      ) {
                        onChange(idea.experiments.filter((y) => y.id !== x.id));
                      }
                    }}
                  >
                    <X className="h-3 w-3" />
                  </IconButton>
                </span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-[0.9375rem] text-ink">{x.tried}</p>
              {x.outcome && (
                <p className="mt-2 whitespace-pre-wrap text-sm text-ink-muted">
                  <span className="text-ink-faint">Outcome: </span>
                  {x.outcome}
                </p>
              )}
              {x.lessons && (
                <p className="mt-1 whitespace-pre-wrap text-sm text-ink-muted">
                  <span className="text-ink-faint">Learned: </span>
                  {x.lessons}
                </p>
              )}
              {(x.hours || x.spentMinor) && (
                <p className="mt-1.5 flex flex-wrap items-center gap-x-3 text-2xs text-ink-faint">
                  {x.hours ? <span>{x.hours} h</span> : null}
                  {x.spentMinor && x.currency ? (
                    <span>{formatMoney(x.spentMinor, x.currency)} spent (noted)</span>
                  ) : null}
                  {x.spentMinor && x.currency ? (
                    <button
                      type="button"
                      onClick={() => void recordAsExpense(x)}
                      className="text-accent hover:underline"
                    >
                      Record as expense
                    </button>
                  ) : null}
                </p>
              )}
            </li>
          ),
        )}
      </ol>
    </Section>
  );
}

function Effort({ idea, onSave }: { idea: MoneyIdea; onSave: (p: Partial<MoneyIdea>) => void }) {
  const prefs = usePrefs();
  const currency = idea.currency ?? prefs.data?.baseCurrency ?? 'EUR';
  const [hours, setHours] = useState(idea.hours?.toString() ?? '');
  const [spent, setSpent] = useState(idea.spentMinor ? amountInput(idea.spentMinor, currency) : '');
  const expHours = idea.experiments.reduce((s, x) => s + (x.hours ?? 0), 0);
  const expSpent = idea.experiments.reduce<Record<string, number>>((acc, x) => {
    if (x.spentMinor && x.currency) acc[x.currency] = (acc[x.currency] ?? 0) + x.spentMinor;
    return acc;
  }, {});

  return (
    <Section id="i-effort" title="Effort">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="text-[0.8125rem] text-ink-muted">Hours (other than experiments)</span>
          <input
            inputMode="decimal"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
            onBlur={() => {
              const h = hours.trim() ? Number(hours.replace(',', '.')) : null;
              if (h === null || (Number.isFinite(h) && h >= 0)) onSave({ hours: h });
            }}
            className={cn(controlClass, 'mt-1 h-10 w-32 sm:h-9')}
          />
        </label>
        <label className="block">
          <span className="text-[0.8125rem] text-ink-muted">Money spent ({currency})</span>
          <input
            inputMode="decimal"
            value={spent}
            onChange={(e) => setSpent(e.target.value)}
            onBlur={() => {
              const m = spent.trim() ? parseAmount(spent, currency) : null;
              onSave({ spentMinor: m, currency: m ? currency : null });
            }}
            className={cn(controlClass, 'mt-1 h-10 w-36 sm:h-9')}
          />
        </label>
      </div>
      {(expHours > 0 || Object.keys(expSpent).length > 0) && (
        <p className="mt-2 text-2xs text-ink-faint">
          Plus experiments:{' '}
          {[
            expHours ? `${expHours} h` : null,
            ...Object.entries(expSpent).map(([c, v]) => formatMoney(v, c)),
          ]
            .filter(Boolean)
            .join(' · ')}
        </p>
      )}
      <p className="mt-1 text-2xs text-ink-faint">
        Noted for your own reference. These are not recorded as expenses unless you record them.
      </p>
    </Section>
  );
}

function ProjectConnection({
  idea,
  onLink,
  onCreate,
  busy,
}: {
  idea: MoneyIdea;
  onLink: (id: string | null) => void;
  onCreate: () => void;
  busy: boolean;
}) {
  const projects = useProjects();
  const project = projects.data?.find((p) => p.id === idea.projectId);
  return (
    <Section id="i-project" title="Project">
      {idea.projectId ? (
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <Link
            to={`/tasks/projects/${idea.projectId}`}
            className="font-medium text-accent hover:underline"
          >
            {project?.name ?? 'Open project'}
          </Link>
          <span className="text-2xs text-ink-faint">
            Tasks, files, milestones and notes live there.
          </span>
          <button
            type="button"
            onClick={() => onLink(null)}
            className="text-2xs text-ink-faint hover:text-ink-muted"
          >
            Disconnect
          </button>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={onCreate} busy={busy}>
            Turn into a project
          </Button>
          <span className="text-2xs text-ink-faint">or</span>
          <select
            value=""
            onChange={(e) => e.target.value && onLink(e.target.value)}
            aria-label="Connect to an existing project"
            className="h-10 rounded border border-line bg-raised px-2 text-sm text-ink-muted sm:h-8"
          >
            <option value="">Connect to an existing project…</option>
            {projects.data
              ?.filter((p) => p.status !== 'done')
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </div>
      )}
    </Section>
  );
}

/** Real money only: income from connected sources, and expenses recorded against this idea. */
function MoneyConnections({
  idea,
  onSources,
}: {
  idea: MoneyIdea;
  onSources: (s: string[]) => void;
}) {
  const summary = useIncomeSummary();
  const expenses = useExpensesFor({ moneyIdeaId: idea.id });
  const labels = summary.data?.sourceLabels ?? {};
  const totals: Record<string, number> = {};
  for (const byCur of Object.values(summary.data?.months ?? {})) {
    for (const [cur, t] of Object.entries(byCur)) {
      for (const key of idea.incomeSources)
        totals[cur] = (totals[cur] ?? 0) + (t.sources[key] ?? 0);
    }
  }
  const costTotals = (expenses.data ?? []).reduce<Record<string, number>>((acc, e) => {
    acc[e.currency] = (acc[e.currency] ?? 0) + e.amountMinor;
    return acc;
  }, {});
  const fmt = (t: Record<string, number>) =>
    Object.entries(t)
      .filter(([, v]) => v)
      .map(([c, v]) => formatMoney(v, c))
      .join(' + ') || '—';

  return (
    <Section id="i-money" title="Actual money">
      <div className="space-y-4 text-sm">
        <div>
          <div className="text-[0.8125rem] text-ink-muted">Income sources from this idea</div>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {idea.incomeSources.map((k) => (
              <span
                key={k}
                className="inline-flex h-8 items-center gap-1 rounded-sm bg-surface-2 pl-2.5 pr-1 text-[0.8125rem] text-ink sm:h-7"
              >
                {labels[k] ?? k}
                <button
                  type="button"
                  aria-label={`Disconnect ${labels[k] ?? k}`}
                  onClick={() => onSources(idea.incomeSources.filter((x) => x !== k))}
                  className="flex h-6 w-6 items-center justify-center text-ink-faint hover:text-ink"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            ))}
            <select
              value=""
              onChange={(e) => e.target.value && onSources([...idea.incomeSources, e.target.value])}
              aria-label="Connect an income source"
              className="h-8 rounded border border-line bg-raised px-2 text-[0.8125rem] text-ink-muted sm:h-7"
            >
              <option value="">Connect a source…</option>
              {Object.entries(labels)
                .filter(([k]) => !idea.incomeSources.includes(k))
                .map(([k, l]) => (
                  <option key={k} value={k}>
                    {l}
                  </option>
                ))}
            </select>
          </div>
          {idea.incomeSources.length > 0 && (
            <p className="mt-1.5 text-ink">Received so far: {fmt(totals)}</p>
          )}
        </div>
        <div>
          <div className="text-[0.8125rem] text-ink-muted">Recorded expenses for this idea</div>
          <p className="mt-1 text-ink">{fmt(costTotals)}</p>
          {(expenses.data ?? []).slice(0, 5).map((e) => (
            <p key={e.id} className="text-2xs text-ink-faint">
              {formatRelativeDay(e.date)} · {formatMoney(e.amountMinor, e.currency)} ·{' '}
              {e.description || e.category}
            </p>
          ))}
        </div>
        <p className="text-2xs text-ink-faint">
          These come from your Income and Expenses records; nothing is counted twice or estimated.
        </p>
      </div>
    </Section>
  );
}
