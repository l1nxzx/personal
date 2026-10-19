import { ChevronLeft, Ellipsis, Plus, Trash2, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Milestone, Project, ProjectStatus } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { AutoSaveText } from '../../components/ui/AutoSaveText';
import { IconButton } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Menu } from '../../components/ui/Menu';
import { ErrorNote, Loading, Segmented } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { ApiError, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatRelativeDay, today } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import { AddTask } from '../tasks/AddTask';
import { useOpenTasks } from '../tasks/api';
import { TaskRow } from '../tasks/TaskRow';
import { TaskList } from '../tasks/TasksPage';
import { byNextAction } from '../tasks/views';
import { MomentDialog } from '../timeline/MomentDialog';
import { useDeleteProject, useProject, useProjectTasks, useUpdateProject } from './api';
import { ProgressLine, targetLabel } from './ProjectParts';

const newId = () => Math.random().toString(36).slice(2, 10);

export default function ProjectPage() {
  const { id = '' } = useParams();
  const project = useProject(id);
  const navigate = useNavigate();

  return (
    <Page width="narrow">
      <div className="pt-safe flex h-14 items-center lg:mt-4">
        <button
          type="button"
          onClick={() => navigate('/tasks/projects')}
          className="-ml-2 flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-8"
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" /> Projects
        </button>
      </div>
      {project.data ? (
        <ProjectView key={project.data.id} project={project.data} />
      ) : project.isError ? (
        <ErrorNote>
          {project.error instanceof ApiError && project.error.status === 404
            ? 'This project no longer exists.'
            : errorMessage(project.error)}
        </ErrorNote>
      ) : (
        <Loading />
      )}
    </Page>
  );
}

function ProjectView({ project }: { project: Project }) {
  const update = useUpdateProject(project.id);
  const del = useDeleteProject();
  const tasks = useProjectTasks(project.id);
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [name, setName] = useState(project.name);
  const [showDone, setShowDone] = useState(false);
  const [addingMoment, setAddingMoment] = useState(false);
  const nameRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(nameRef, name);

  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }),
    });

  const [goal, setGoal] = useState(project.goal);
  const goalRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(goalRef, goal);

  // The live open list (updates the moment a task is ticked), in next-action order.
  const t = today();
  const openTasks = useOpenTasks();
  const open = (openTasks.data ?? [])
    .filter((x) => x.projectId === project.id)
    .sort(byNextAction(t));
  const done = (tasks.data ?? [])
    .filter((x) => x.status === 'done')
    .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''));
  const [next, ...after] = open;
  const milestones = {
    done: project.milestones.filter((m) => m.done).length,
    total: project.milestones.length,
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Delete “${project.name}”?`,
      message:
        'Its tasks are kept, just no longer grouped under this project. Notes and files linked to it stay too.',
      confirmLabel: 'Delete project',
      danger: true,
    });
    if (!ok) return;
    await del
      .mutateAsync(project.id)
      .then(() => {
        toast({ message: 'Project deleted' });
        navigate('/tasks/projects', { replace: true });
      })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <textarea
          ref={nameRef}
          value={name}
          rows={1}
          maxLength={200}
          aria-label="Project name"
          onChange={(e) => setName(e.target.value.replace(/\n/g, ' '))}
          onBlur={() => name.trim() && name.trim() !== project.name && save({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
          className="page-title min-w-0 flex-1 resize-none overflow-hidden bg-transparent focus:outline-none focus-visible:outline-none"
        />
        <Menu
          trigger={(p) => (
            <IconButton label="Project actions" {...p} className="mt-1">
              <Ellipsis className="h-4 w-4" />
            </IconButton>
          )}
          items={[
            { label: 'Add to timeline…', onSelect: () => setAddingMoment(true) },
            {
              label: 'Delete project…',
              icon: <Trash2 />,
              danger: true,
              onSelect: () => void remove(),
            },
          ]}
        />
      </div>
      <textarea
        ref={goalRef}
        value={goal}
        rows={1}
        maxLength={300}
        aria-label="Goal"
        placeholder="What does done look like, and why does it matter?"
        onChange={(e) => setGoal(e.target.value.replace(/\n/g, ' '))}
        onBlur={() => goal.trim() !== project.goal && save({ goal: goal.trim() })}
        onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), e.currentTarget.blur())}
        className="mt-2 block w-full resize-none overflow-hidden bg-transparent font-serif text-[1.125rem] leading-7 text-ink-muted placeholder:text-ink-faint/80 focus:text-ink focus:outline-none focus-visible:outline-none"
        style={{ fontVariationSettings: "'opsz' 20" }}
      />
      <MomentDialog
        open={addingMoment}
        onClose={() => setAddingMoment(false)}
        initial={{
          title: project.status === 'done' ? `Finished ${project.name}` : `Started ${project.name}`,
          ref: { type: 'project', id: project.id },
        }}
      />

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Segmented<ProjectStatus>
          label="Status"
          value={project.status}
          onChange={(status) => save({ status })}
          options={[
            { value: 'active', label: 'Active' },
            { value: 'paused', label: 'Paused' },
            { value: 'done', label: 'Done' },
          ]}
        />
        <label className="relative inline-flex h-9 cursor-pointer items-center rounded border border-line px-3 text-sm text-ink-muted hover:border-line-strong sm:h-8">
          {project.targetDate ? targetLabel(project.targetDate, t) : 'Set a target date'}
          <input
            type="date"
            value={project.targetDate ?? ''}
            onChange={(e) => save({ targetDate: e.target.value || null })}
            aria-label="Target date"
            className="absolute inset-0 cursor-pointer opacity-0"
          />
        </label>
        {project.targetDate && (
          <button
            type="button"
            onClick={() => save({ targetDate: null })}
            className="text-2xs text-ink-faint hover:text-ink-muted"
          >
            Clear date
          </button>
        )}
      </div>

      {tasks.isSuccess && (
        <ProgressLine
          className="mt-5"
          done={done.length}
          total={done.length + open.length}
          milestones={milestones}
        />
      )}

      <section className="mt-8" aria-labelledby="p-next">
        <div
          className={cn(
            'border-l-2 bg-surface py-3 pl-4 pr-3',
            next ? 'border-accent/60' : 'border-line',
          )}
        >
          <h2 id="p-next" className="text-2xs uppercase tracking-[0.12em] text-ink-faint">
            Next action
          </h2>
          {openTasks.isLoading ? (
            <Loading />
          ) : next ? (
            <TaskRow key={next.id} task={next} showProject={false} />
          ) : (
            <>
              {project.status === 'active' && (
                <p className="mt-1 text-sm text-ink-muted">
                  {done.length
                    ? 'Everything here is done. What comes next?'
                    : 'What is the first step?'}
                </p>
              )}
              <AddTask projectId={project.id} placeholder="Add the next step" />
            </>
          )}
        </div>
      </section>

      <section className="mt-8" aria-labelledby="p-tasks">
        {next && (
          <>
            <h2 id="p-tasks" className="section-label mb-1">
              {after.length ? 'After that' : 'Tasks'}
            </h2>
            <TaskList tasks={after} showProject={false} />
            <div className="mt-1">
              <AddTask projectId={project.id} placeholder="Add a task to this project" />
            </div>
          </>
        )}
        {done.length > 0 && (
          <div className="mt-2">
            <button
              type="button"
              onClick={() => setShowDone((s) => !s)}
              className="text-[0.8125rem] text-ink-faint hover:text-ink-muted"
            >
              {showDone ? 'Hide' : 'Show'} {done.length} done
            </button>
            {showDone && <TaskList tasks={done} showProject={false} />}
          </div>
        )}
      </section>

      <Milestones milestones={project.milestones} onChange={(milestones) => save({ milestones })} />

      <section className="mt-12" aria-labelledby="p-notes">
        <h2 id="p-notes" className="section-label mb-2">
          Notes
        </h2>
        <AutoSaveText
          value={project.description}
          onSave={(description) => save({ description })}
          label="Project notes"
          placeholder="What this is about, decisions, what you have tried and learned…"
        />
      </section>

      <LinksPanel item={{ type: 'project', id: project.id }} className="mt-12" />
    </div>
  );
}

function Milestones({
  milestones,
  onChange,
}: {
  milestones: Milestone[];
  onChange: (m: Milestone[]) => void;
}) {
  const [title, setTitle] = useState('');
  const [date, setDate] = useState('');
  const sorted = [...milestones].sort((a, b) => (a.date ?? '9999').localeCompare(b.date ?? '9999'));

  const add = () => {
    const t = title.trim();
    if (!t) return;
    onChange([...milestones, { id: newId(), title: t, date: date || null, done: false }]);
    setTitle('');
    setDate('');
  };

  return (
    <section className="mt-12" aria-labelledby="p-milestones">
      <h2 id="p-milestones" className="section-label mb-1">
        Milestones
      </h2>
      <ul>
        {sorted.map((m) => (
          <li key={m.id} className="group -mx-2 flex items-center gap-3 rounded px-2 py-2">
            <Checkbox
              checked={m.done}
              onChange={(done) =>
                onChange(milestones.map((x) => (x.id === m.id ? { ...x, done } : x)))
              }
              label={`Milestone: ${m.title}`}
            />
            <span
              className={cn(
                'min-w-0 flex-1 text-[0.9375rem]',
                m.done ? 'text-ink-faint line-through' : 'text-ink',
              )}
            >
              {m.title}
            </span>
            {m.date && (
              <span className="shrink-0 text-2xs text-ink-faint">{formatRelativeDay(m.date)}</span>
            )}
            <IconButton
              label="Remove milestone"
              onClick={() => onChange(milestones.filter((x) => x.id !== m.id))}
              className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </IconButton>
          </li>
        ))}
      </ul>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="-mx-2 flex items-center gap-2 rounded px-2 focus-within:bg-surface/70"
      >
        <Plus
          className="h-[18px] w-[18px] shrink-0 text-ink-faint"
          strokeWidth={1.75}
          aria-hidden
        />
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Add a milestone"
          aria-label="Milestone"
          maxLength={300}
          className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
        />
        <input
          type="date"
          value={date}
          onChange={(e) => setDate(e.target.value)}
          aria-label="Milestone date (optional)"
          className="h-9 w-[8.5rem] shrink-0 rounded border border-line bg-transparent px-2 text-sm text-ink-muted sm:h-8"
        />
      </form>
    </section>
  );
}
