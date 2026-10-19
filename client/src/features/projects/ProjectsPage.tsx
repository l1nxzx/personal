import { ChevronDown, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import type { Project, Task } from '../../../../shared/types';
import { Empty, ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, today } from '../../lib/dates';
import { AddTask } from '../tasks/AddTask';
import { useOpenTasks } from '../tasks/api';
import { TaskRow } from '../tasks/TaskRow';
import { openByProject } from '../tasks/views';
import { useCreateProject, useProjects, useProjectTaskCounts } from './api';
import { ProgressLine, purposeOf, targetLabel } from './ProjectParts';

export const STATUS_LABEL: Record<Project['status'], string> = {
  active: 'Active',
  paused: 'Paused',
  done: 'Done',
};

/**
 * Projects: the things you're working towards. Each active one shows what it's for, how far
 * along it is, and its next action, which can be done right here.
 */
export function ProjectsView() {
  const projects = useProjects();
  const open = useOpenTasks();
  const counts = useProjectTaskCounts();
  const [showFinished, setShowFinished] = useState(false);
  const t = today();
  const byProject = openByProject(open.data ?? [], t);

  const list = projects.data ?? [];
  const active = list.filter((p) => p.status === 'active');
  const paused = list.filter((p) => p.status === 'paused');
  const finished = list.filter((p) => p.status === 'done');

  return (
    <div className="mt-4">
      <NewProject />

      {projects.isLoading ? (
        <Loading />
      ) : projects.isError ? (
        <ErrorNote onRetry={() => void projects.refetch()}>
          {errorMessage(projects.error)}
        </ErrorNote>
      ) : !list.length ? (
        <Empty>
          A project is something you want to accomplish that takes more than one step: a course to
          launch, a room to repaint, a habit to build. It gathers the tasks, notes and files that
          move it forward. Not everything needs to be one.
        </Empty>
      ) : (
        <>
          {active.length > 0 ? (
            <ul className="mt-2 divide-y divide-line/70">
              {active.map((p) => (
                <ActiveProject
                  key={p.id}
                  project={p}
                  open={byProject.get(p.id) ?? []}
                  total={counts.data?.[p.id]}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-6 text-sm text-ink-faint">No active projects right now.</p>
          )}

          {paused.length > 0 && (
            <section className="mt-12" aria-labelledby="projects-paused">
              <h2 id="projects-paused" className="section-label mb-1">
                Paused
              </h2>
              <ul>
                {paused.map((p) => (
                  <li key={p.id}>
                    <QuietProject
                      project={p}
                      note={
                        byProject.get(p.id)?.length ? `${byProject.get(p.id)!.length} open` : ''
                      }
                    />
                  </li>
                ))}
              </ul>
            </section>
          )}

          {finished.length > 0 && (
            <section className="mt-10">
              <button
                type="button"
                onClick={() => setShowFinished((s) => !s)}
                aria-expanded={showFinished}
                className="section-label inline-flex items-center gap-1.5 hover:text-ink-muted"
              >
                Finished · {finished.length}
                <ChevronDown
                  className={cn('h-3.5 w-3.5 transition-transform', showFinished && 'rotate-180')}
                />
              </button>
              {showFinished && (
                <ul className="mt-1">
                  {finished.map((p) => (
                    <li key={p.id}>
                      <QuietProject project={p} note={`Finished ${formatAgo(p.updatedAt)}`} />
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}
        </>
      )}
    </div>
  );
}

function NewProject() {
  const create = useCreateProject();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState('');

  const submit = () => {
    const n = name.trim();
    if (!n || create.isPending) return;
    create.mutate(
      { name: n },
      {
        onSuccess: (p) => {
          setName('');
          navigate(`/tasks/projects/${p.id}`);
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      className="-mx-2 flex items-center gap-2 rounded px-2 focus-within:bg-surface/70"
    >
      <Plus className="h-[18px] w-[18px] shrink-0 text-ink-faint" strokeWidth={1.75} aria-hidden />
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Start a project"
        aria-label="New project name"
        maxLength={200}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
      />
      {name.trim() && (
        <button
          type="submit"
          disabled={create.isPending}
          className="h-9 shrink-0 rounded px-3 text-sm font-medium text-accent hover:bg-surface-2 sm:h-8"
        >
          Create
        </button>
      )}
    </form>
  );
}

/** An active project: its name and purpose lead; the next action sits underneath, doable here. */
function ActiveProject({
  project: p,
  open,
  total,
}: {
  project: Project;
  open: Task[];
  total: number | undefined;
}) {
  const purpose = purposeOf(p);
  const [next, ...rest] = open;
  const milestones = {
    done: p.milestones.filter((m) => m.done).length,
    total: p.milestones.length,
  };

  return (
    <li className="py-7 first:pt-4">
      <Link
        to={`/tasks/projects/${p.id}`}
        className="group block rounded focus-visible:outline-offset-4"
      >
        <div className="flex items-baseline gap-3">
          <h3
            className="min-w-0 flex-1 font-serif text-[1.375rem] font-medium leading-snug text-ink decoration-line-strong underline-offset-4 group-hover:underline"
            style={{ fontVariationSettings: "'opsz' 28" }}
          >
            {p.name}
          </h3>
          {p.targetDate && (
            <span className="shrink-0 text-2xs text-ink-faint">
              {targetLabel(p.targetDate, today())}
            </span>
          )}
        </div>
        {purpose ? (
          <p className="mt-1 line-clamp-2 text-[0.9375rem] leading-6 text-ink-muted">{purpose}</p>
        ) : (
          <p className="mt-1 text-sm text-ink-faint">What is this for? Add a goal.</p>
        )}
      </Link>

      {total !== undefined && (
        <ProgressLine
          className="mt-3"
          done={Math.max(0, total - open.length)}
          total={total}
          milestones={milestones}
        />
      )}

      <div className={cn('mt-4 border-l-2 pl-4', next ? 'border-accent/60' : 'border-line')}>
        <div className="text-2xs uppercase tracking-[0.12em] text-ink-faint">Next action</div>
        {next ? (
          <>
            {/* Keyed: when it's done, the following task takes its place with fresh state. */}
            <TaskRow key={next.id} task={next} showProject={false} />
            {rest.length > 0 && (
              <Link
                to={`/tasks/projects/${p.id}`}
                className="text-[0.8125rem] text-ink-faint hover:text-ink-muted"
              >
                then {rest.length} more
              </Link>
            )}
          </>
        ) : (
          <AddTask projectId={p.id} placeholder="What's the next step?" />
        )}
      </div>
    </li>
  );
}

function QuietProject({ project: p, note }: { project: Project; note: string }) {
  const purpose = purposeOf(p);
  return (
    <Link
      to={`/tasks/projects/${p.id}`}
      className="-mx-2 block rounded px-2 py-2.5 hover:bg-surface/70"
    >
      <div className="flex items-baseline gap-3">
        <span className="min-w-0 flex-1 truncate font-serif text-[1.0625rem] text-ink-muted">
          {p.name}
        </span>
        <span className="shrink-0 text-2xs text-ink-faint">{note}</span>
      </div>
      {purpose && <span className="block truncate text-[0.8125rem] text-ink-faint">{purpose}</span>}
    </Link>
  );
}
