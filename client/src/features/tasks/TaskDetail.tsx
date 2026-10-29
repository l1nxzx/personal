import { ChevronLeft, Plus, Trash2, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import type { Subtask, Task, TaskPriority, UpdateTaskRequest } from '../../../../shared/types';
import { IconButton } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Dialog } from '../../components/ui/Dialog';
import { Segmented } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { addDays, formatAgo, formatRelativeDay, nextWeek, today } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import { useProjects } from '../projects/api';
import { useDeleteTask, useTask, useUpdateTask } from './api';

/** Opens for `?task=<id>` on any page, so tasks can be linked to and the back button closes it. */
export function TaskDetailHost() {
  const [params, setParams] = useSearchParams();
  const id = params.get('task');
  const close = () =>
    setParams(
      (p) => {
        p.delete('task');
        return p;
      },
      { replace: true },
    );
  return (
    <Dialog open={!!id} onClose={close} title="Task" hideTitle placement="panel">
      {id && <TaskDetail key={id} id={id} onClose={close} />}
    </Dialog>
  );
}

function TaskDetail({ id, onClose }: { id: string; onClose: () => void }) {
  const query = useTask(id);
  const task = query.data;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton label="Close" onClick={onClose} className="sm:hidden">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <span className="flex-1 pl-2 text-sm text-ink-faint">Task</span>
        {task && <DeleteButton task={task} onDeleted={onClose} />}
        <IconButton label="Close" onClick={onClose} className="hidden sm:inline-flex">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">
        {task ? (
          <TaskForm task={task} />
        ) : query.isError ? (
          <p className="text-sm text-ink-muted">{errorMessage(query.error)}</p>
        ) : (
          <Skeleton>
            <div className="flex items-start gap-3">
              <SkeletonBlock className="mt-2 h-[18px] w-[18px] shrink-0 rounded-sm" />
              <SkeletonText
                className="min-w-0 flex-1 font-serif text-[1.375rem] leading-snug"
                width="70%"
              />
            </div>
            <SkeletonText className="mt-5 text-sm" width="45%" />
            <SkeletonText className="mt-1 text-sm" width="60%" />
          </Skeleton>
        )}
      </div>
    </div>
  );
}

function DeleteButton({ task, onDeleted }: { task: Task; onDeleted: () => void }) {
  const del = useDeleteTask();
  const confirm = useConfirm();
  const toast = useToast();
  return (
    <IconButton
      label="Delete task"
      onClick={async () => {
        const ok = await confirm({
          title: 'Delete this task?',
          message: `“${task.title}” will be removed for good.`,
          confirmLabel: 'Delete',
          danger: true,
        });
        if (!ok) return;
        // Promise, not callbacks: removing the task's query unmounts this button.
        await del
          .mutateAsync(task.id)
          .then(() => {
            onDeleted();
            toast({ message: 'Task deleted' });
          })
          .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
      }}
    >
      <Trash2 className="h-4 w-4" />
    </IconButton>
  );
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-2 border-t border-line/70 py-4 sm:grid-cols-[6.5rem_1fr] sm:items-start sm:gap-3">
      <div className="pt-1 text-[0.8125rem] text-ink-faint">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function DateChips({
  value,
  onChange,
  noneLabel,
}: {
  value: string | null;
  onChange: (v: string | null) => void;
  noneLabel: string;
}) {
  const t = today();
  const options: { label: string; value: string | null }[] = [
    { label: 'Today', value: t },
    { label: 'Tomorrow', value: addDays(t, 1) },
    { label: 'Next week', value: nextWeek(t) },
    { label: noneLabel, value: null },
  ];
  const custom = value && !options.some((o) => o.value === value);
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          aria-pressed={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-sm px-2.5 text-[0.8125rem] transition-colors sm:h-7',
            value === o.value
              ? 'bg-accent/15 text-ink ring-1 ring-accent/50'
              : 'bg-surface-2/70 text-ink-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
      <label
        className={cn(
          'relative h-9 cursor-pointer overflow-hidden rounded-sm px-2.5 text-[0.8125rem] leading-9 sm:h-7 sm:leading-7',
          custom
            ? 'bg-accent/15 text-ink ring-1 ring-accent/50'
            : 'bg-surface-2/70 text-ink-muted hover:text-ink',
        )}
      >
        {custom ? formatRelativeDay(value) : 'Pick a date'}
        <input
          type="date"
          value={value ?? ''}
          onChange={(e) => onChange(e.target.value || null)}
          className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
          aria-label="Pick a date"
        />
      </label>
    </div>
  );
}

function TaskForm({ task }: { task: Task }) {
  const update = useUpdateTask();
  const toast = useToast();
  const [title, setTitle] = useState(task.title);
  const [notes, setNotes] = useState(task.notes);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  const notesRef = useRef<HTMLTextAreaElement>(null);
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  useAutosize(titleRef, title);
  useAutosize(notesRef, notes, 3);

  // Take in changes from elsewhere unless that field is being edited here.
  useEffect(() => {
    if (document.activeElement !== titleRef.current) setTitle(task.title);
    if (document.activeElement !== notesRef.current) setNotes(task.notes);
  }, [task.title, task.notes]);

  const save = (patch: UpdateTaskRequest) =>
    update.mutate(
      { id: task.id, patch },
      { onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }) },
    );

  const saveLater = (field: 'title' | 'notes', value: string) => {
    clearTimeout(timers.current[field]);
    timers.current[field] = setTimeout(() => {
      if (field === 'title' && !value.trim()) return;
      if (value !== task[field]) save({ [field]: field === 'title' ? value.trim() : value });
    }, 700);
  };

  // Flush pending text edits when the panel closes.
  const latest = useRef({ title, notes, task });
  latest.current = { title, notes, task };
  useEffect(
    () => () => {
      const { title: t, notes: n, task: current } = latest.current;
      for (const k of Object.keys(timers.current)) clearTimeout(timers.current[k]);
      const patch: UpdateTaskRequest = {};
      if (t.trim() && t.trim() !== current.title) patch.title = t.trim();
      if (n !== current.notes) patch.notes = n;
      if (Object.keys(patch).length) update.mutate({ id: current.id, patch });
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const setSubtasks = (subtasks: Subtask[]) => save({ subtasks });
  const [newStep, setNewStep] = useState('');

  return (
    <div>
      <div className="flex items-start gap-3">
        <Checkbox
          checked={task.status === 'done'}
          onChange={(c) => save({ status: c ? 'done' : 'open' })}
          label={task.status === 'done' ? 'Mark as not done' : 'Mark as done'}
          className="mt-2"
        />
        <textarea
          ref={titleRef}
          value={title}
          rows={1}
          maxLength={300}
          aria-label="Task title"
          onChange={(e) => {
            const v = e.target.value.replace(/\n/g, ' ');
            setTitle(v);
            saveLater('title', v);
          }}
          onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), notesRef.current?.focus())}
          className={cn(
            'min-w-0 flex-1 resize-none overflow-hidden bg-transparent font-serif text-[1.375rem] font-medium leading-snug focus:outline-none focus-visible:outline-none',
            task.status === 'done'
              ? 'text-ink-muted line-through decoration-ink-faint/60'
              : 'text-ink',
          )}
          style={{ fontVariationSettings: "'opsz' 32" }}
        />
      </div>

      <div className="mt-5">
        <Row label="Due">
          <DateChips
            value={task.dueDate}
            onChange={(dueDate) => save({ dueDate })}
            noneLabel="No deadline"
          />
          <p className="mt-2 text-2xs text-ink-faint">
            A real deadline. Only tasks with one can be overdue.
          </p>
        </Row>
        <Row label="Work on it">
          <DateChips
            value={task.plannedDate}
            onChange={(plannedDate) => save({ plannedDate })}
            noneLabel="Not planned"
          />
          <p className="mt-2 text-2xs text-ink-faint">
            When you&apos;d like to do it. Never counts as late.
          </p>
        </Row>
        <Row label="Priority">
          <Segmented<TaskPriority>
            label="Priority"
            value={task.priority}
            onChange={(priority) => save({ priority })}
            options={[
              { value: 'none', label: 'None' },
              { value: 'low', label: 'Low' },
              { value: 'high', label: 'High' },
            ]}
          />
        </Row>
        <Row label="Project">
          <ProjectSelect task={task} onChange={(projectId) => save({ projectId })} />
        </Row>
        <Row label="Steps">
          <ul className="space-y-0.5">
            {task.subtasks.map((s) => (
              <li key={s.id} className="group flex items-center gap-3">
                <Checkbox
                  checked={s.done}
                  onChange={(done) =>
                    setSubtasks(task.subtasks.map((x) => (x.id === s.id ? { ...x, done } : x)))
                  }
                  label={`Step: ${s.title}`}
                />
                <input
                  defaultValue={s.title}
                  aria-label="Step"
                  onBlur={(e) => {
                    const v = e.target.value.trim();
                    if (!v) setSubtasks(task.subtasks.filter((x) => x.id !== s.id));
                    else if (v !== s.title)
                      setSubtasks(
                        task.subtasks.map((x) => (x.id === s.id ? { ...x, title: v } : x)),
                      );
                  }}
                  onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                  className={cn(
                    'h-10 min-w-0 flex-1 bg-transparent text-sm focus:outline-none focus-visible:outline-none sm:h-8',
                    s.done ? 'text-ink-faint line-through' : 'text-ink',
                  )}
                />
                <IconButton
                  label="Remove step"
                  onClick={() => setSubtasks(task.subtasks.filter((x) => x.id !== s.id))}
                  className="opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </IconButton>
              </li>
            ))}
          </ul>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const v = newStep.trim();
              if (!v) return;
              setSubtasks([
                ...task.subtasks,
                { id: Math.random().toString(36).slice(2, 10), title: v, done: false },
              ]);
              setNewStep('');
            }}
            className="flex items-center gap-3"
          >
            <Plus className="h-[18px] w-[18px] text-ink-faint" strokeWidth={1.75} aria-hidden />
            <input
              value={newStep}
              onChange={(e) => setNewStep(e.target.value)}
              placeholder="Add a step"
              aria-label="Add a step"
              enterKeyHint="done"
              className="h-10 min-w-0 flex-1 bg-transparent text-sm text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none sm:h-8"
            />
          </form>
        </Row>
        <Row label="Notes">
          <textarea
            ref={notesRef}
            value={notes}
            onChange={(e) => {
              setNotes(e.target.value);
              saveLater('notes', e.target.value);
            }}
            rows={3}
            placeholder="Details, links, anything useful"
            aria-label="Notes"
            className="block w-full resize-none overflow-hidden bg-transparent text-[0.9375rem] leading-6 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
          />
        </Row>
      </div>

      <LinksPanel item={{ type: 'task', id: task.id }} className="mt-8" />

      <p className="mt-4 border-t border-line/70 pt-4 text-2xs text-ink-faint">
        Added {formatAgo(task.createdAt)}
        {task.completedAt && ` · Done ${formatAgo(task.completedAt)}`}
      </p>
    </div>
  );
}

function ProjectSelect({ task, onChange }: { task: Task; onChange: (id: string | null) => void }) {
  const projects = useProjects();
  const options = (projects.data ?? []).filter(
    (p) => p.status !== 'done' || p.id === task.projectId,
  );
  return (
    <div className="flex items-center gap-3">
      <select
        value={task.projectId ?? ''}
        onChange={(e) => onChange(e.target.value || null)}
        aria-label="Project"
        className="h-10 min-w-0 max-w-full flex-1 rounded border border-line bg-raised px-2 text-sm text-ink sm:h-8 sm:max-w-[16rem]"
      >
        <option value="">No project</option>
        {options.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      {task.projectId && (
        <Link
          to={`/tasks/projects/${task.projectId}`}
          className="shrink-0 text-[0.8125rem] text-accent hover:underline"
        >
          Open
        </Link>
      )}
    </div>
  );
}
