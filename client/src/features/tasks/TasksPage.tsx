import { Sun } from 'lucide-react';
import { useState } from 'react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { Task } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Empty, ErrorNote, TabLinks } from '../../components/ui/misc';
import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { formatRelativeDay, toLocalDate, today } from '../../lib/dates';
import { FilterSearch, GroupHeading } from '../entries/ListParts';
import { useProjects } from '../projects/api';
import { ProjectsView } from '../projects/ProjectsPage';
import { AddTask } from './AddTask';
import { useDoneTasks, useOpenTasks, useUpdateTask } from './api';
import { TaskRow, TaskRowSkeleton } from './TaskRow';
import { byNextAction, openByProject, todayGroups, upcomingGroups } from './views';

export type TaskView = 'today' | 'upcoming' | 'done' | 'all' | 'projects';

export function TaskList({
  tasks,
  showPlanned,
  showProject,
}: {
  tasks: Task[];
  showPlanned?: boolean;
  showProject?: boolean;
}) {
  return (
    <ul>
      {tasks.map((t) => (
        <li key={t.id}>
          <TaskRow task={t} showPlanned={showPlanned} showProject={showProject} />
        </li>
      ))}
    </ul>
  );
}

/** Placeholder task rows, for use inside a Skeleton. */
function TaskListSkeleton({ rows }: { rows: number }) {
  return Array.from({ length: rows }, (_, i) => (
    <TaskRowSkeleton key={i} width={skeletonWidth(i)} meta={i % 2 === 1} />
  ));
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="section-label mb-1">{title}</h2>
      {children}
    </section>
  );
}

export default function TasksPage({ view }: { view: TaskView }) {
  return (
    <Page width="narrow">
      <PageHeader title="Projects & Tasks">
        <div className="mt-4">
          <TabLinks
            tabs={[
              { to: '/tasks', label: 'Today', end: true },
              { to: '/tasks/projects', label: 'Projects' },
              { to: '/tasks/upcoming', label: 'Upcoming' },
              { to: '/tasks/all', label: 'All' },
              { to: '/tasks/done', label: 'Done' },
            ]}
          />
        </div>
      </PageHeader>
      {view === 'projects' ? (
        <ProjectsView />
      ) : view === 'done' ? (
        <DoneView />
      ) : (
        <OpenView view={view} />
      )}
    </Page>
  );
}

function OpenView({ view }: { view: Exclude<TaskView, 'done' | 'projects'> }) {
  const open = useOpenTasks();
  const [filter, setFilter] = useState('');
  const t = today();

  const body = () => {
    if (open.isLoading)
      return (
        <Skeleton className="mt-4">
          <TaskListSkeleton rows={4} />
        </Skeleton>
      );
    if (open.isError)
      return <ErrorNote onRetry={() => void open.refetch()}>{errorMessage(open.error)}</ErrorNote>;
    const tasks = open.data ?? [];

    if (view === 'today') {
      const { due, planned } = todayGroups(tasks, t);
      const inToday = new Set([...due, ...planned].map((x) => x.id));
      return (
        <>
          {!due.length && !planned.length && (
            <p className="mt-4 text-sm text-ink-faint">
              Nothing planned for today. Add something above, or pick a next step below.
            </p>
          )}
          {due.length > 0 && (
            <Section title="Due">
              <TaskList tasks={due} showPlanned={false} />
            </Section>
          )}
          {planned.length > 0 && (
            <Section title="Planned for today">
              <TaskList tasks={planned} showPlanned={false} />
            </Section>
          )}
          <ProjectNextSteps tasks={tasks} inToday={inToday} />
        </>
      );
    }

    if (view === 'upcoming') {
      const { dated, anytime } = upcomingGroups(tasks, t);
      if (!dated.length && !anytime.length) return <Empty>Nothing coming up.</Empty>;
      return (
        <>
          {dated.map(([date, list]) => (
            <Section key={date} title={formatRelativeDay(date)}>
              <TaskList tasks={list} />
            </Section>
          ))}
          {anytime.length > 0 && (
            <Section title="Anytime">
              <TaskList tasks={anytime} />
            </Section>
          )}
        </>
      );
    }

    const f = filter.trim().toLowerCase();
    const shown = f
      ? tasks.filter((x) => x.title.toLowerCase().includes(f) || x.notes.toLowerCase().includes(f))
      : tasks;
    return (
      <>
        <div className="mt-4">
          <FilterSearch value={filter} onChange={setFilter} placeholder="Filter open tasks" />
        </div>
        {shown.length ? (
          <ByProject tasks={shown} />
        ) : (
          <Empty>{f ? 'No open tasks match.' : 'No open tasks.'}</Empty>
        )}
      </>
    );
  };

  return (
    <>
      <div className="mt-4">
        <AddTask
          planToday={view === 'today'}
          placeholder={view === 'today' ? 'Add a task for today' : 'Add a task'}
        />
      </div>
      {body()}
    </>
  );
}

/**
 * On Today: the next action of each active project that has nothing on today's list yet, so
 * the work that matters stays in view. One tap plans it for today; ticking it off works too.
 */
function ProjectNextSteps({ tasks, inToday }: { tasks: Task[]; inToday: Set<string> }) {
  const projects = useProjects();
  const update = useUpdateTask();
  const toast = useToast();
  const t = today();
  const byProject = openByProject(tasks, t);

  const steps: Task[] = [];
  const waiting: { id: string; name: string }[] = [];
  for (const p of projects.data ?? []) {
    if (p.status !== 'active') continue;
    const list = byProject.get(p.id);
    if (!list?.length) waiting.push({ id: p.id, name: p.name });
    else if (!list.some((x) => inToday.has(x.id))) steps.push(list[0]!);
  }
  if (!steps.length && !waiting.length) return null;

  const plan = (task: Task) =>
    update
      .mutateAsync({ id: task.id, patch: { plannedDate: t } })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));

  return (
    <section className="mt-12" aria-labelledby="next-steps">
      <h2 id="next-steps" className="section-label">
        Next steps for your projects
      </h2>
      {steps.length > 0 && (
        <ul className="mt-1">
          {steps.map((task) => (
            <li key={task.id}>
              <TaskRow
                task={task}
                extra={
                  <IconButton
                    label={`Plan “${task.title}” for today`}
                    title="Plan for today"
                    onClick={() => void plan(task)}
                  >
                    <Sun className="h-4 w-4" strokeWidth={1.75} />
                  </IconButton>
                }
              />
            </li>
          ))}
        </ul>
      )}
      {waiting.length > 0 && (
        <p className="mt-3 text-[0.8125rem] leading-6 text-ink-faint">
          No next step yet:{' '}
          {waiting.map((p, i) => (
            <span key={p.id}>
              {i > 0 && ', '}
              <Link
                to={`/tasks/projects/${p.id}`}
                className="text-ink-muted hover:text-ink hover:underline"
              >
                {p.name}
              </Link>
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

/** Open tasks under the project they serve (in next-action order), then the ones on their own. */
function ByProject({ tasks }: { tasks: Task[] }) {
  const projects = useProjects();
  const t = today();
  const byProject = openByProject(tasks, t);
  const known = new Set((projects.data ?? []).map((p) => p.id));
  const loose = tasks.filter((x) => !x.projectId || !known.has(x.projectId)).sort(byNextAction(t));

  return (
    <div className="mt-2">
      {(projects.data ?? []).map((p) => {
        const list = byProject.get(p.id);
        if (!list?.length) return null;
        return (
          <section key={p.id} className="mt-6">
            <h2 className="flex items-baseline gap-3 border-b border-line/70 pb-1.5">
              <Link
                to={`/tasks/projects/${p.id}`}
                className="min-w-0 flex-1 truncate font-serif text-[1.0625rem] font-medium text-ink decoration-line-strong underline-offset-4 hover:underline"
                style={{ fontVariationSettings: "'opsz' 20" }}
              >
                {p.name}
              </Link>
              <span className="shrink-0 text-2xs text-ink-faint">{list.length} open</span>
            </h2>
            <div className="mt-1">
              <TaskList tasks={list} showProject={false} />
            </div>
          </section>
        );
      })}
      {loose.length > 0 && (
        <section className="mt-8">
          <h2 className="section-label mb-1">On their own</h2>
          <TaskList tasks={loose} />
        </section>
      )}
    </div>
  );
}

function DoneView() {
  const done = useDoneTasks();
  if (done.isLoading)
    return (
      <Skeleton>
        <SkeletonText className="pb-2 pt-6 font-serif text-[1.0625rem]" width="6rem" />
        <TaskListSkeleton rows={4} />
      </Skeleton>
    );
  if (done.isError)
    return <ErrorNote onRetry={() => void done.refetch()}>{errorMessage(done.error)}</ErrorNote>;
  const tasks = done.data?.pages.flatMap((p) => p.items) ?? [];
  if (!tasks.length) return <Empty>Completed tasks will show up here.</Empty>;

  const groups = new Map<string, Task[]>();
  for (const task of tasks) {
    const day = toLocalDate(new Date(task.completedAt!));
    groups.set(day, [...(groups.get(day) ?? []), task]);
  }

  return (
    <div>
      {[...groups].map(([day, list]) => (
        <section key={day}>
          <GroupHeading>{formatRelativeDay(day)}</GroupHeading>
          <TaskList tasks={list} />
        </section>
      ))}
      {done.hasNextPage && (
        <div className="mt-6">
          <Button onClick={() => void done.fetchNextPage()} busy={done.isFetchingNextPage}>
            Show earlier
          </Button>
        </div>
      )}
    </div>
  );
}
