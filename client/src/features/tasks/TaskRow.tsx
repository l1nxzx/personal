import { useQueryClient, type QueryClient } from '@tanstack/react-query';
import { Flag, FolderKanban, ListTree, Sun } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { ProjectTaskCounts, Task } from '../../../../shared/types';
import { Checkbox } from '../../components/ui/Checkbox';
import { SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, formatRelativeDay, today } from '../../lib/dates';
import { keys } from '../../lib/keys';
import { taskCountsKey, useProjectNames } from '../projects/api';
import { useUpdateTask } from './api';

/** Due/planned information, worded so a missing deadline never reads as "late". */
function Meta({
  task,
  showPlanned,
  project,
}: {
  task: Task;
  showPlanned: boolean;
  project: string | null;
}) {
  const t = today();
  const parts: React.ReactNode[] = [];
  // What the task is for comes first: it's the reason to do it.
  if (project) {
    parts.push(
      <span key="project" className="inline-flex min-w-0 items-center gap-1 text-ink-muted">
        <FolderKanban className="h-3 w-3 shrink-0" aria-hidden />
        <span className="truncate">{project}</span>
      </span>,
    );
  }
  if (task.status === 'done' && task.completedAt) {
    parts.push(<span key="done">Done {formatAgo(task.completedAt)}</span>);
  } else if (task.dueDate) {
    if (task.dueDate < t)
      parts.push(
        <span key="due" className="text-bad">
          Overdue · {formatRelativeDay(task.dueDate)}
        </span>,
      );
    else if (task.dueDate === t)
      parts.push(
        <span key="due" className="text-warn">
          Due today
        </span>,
      );
    else parts.push(<span key="due">Due {formatRelativeDay(task.dueDate)}</span>);
  }
  if (showPlanned && task.status === 'open' && task.plannedDate) {
    parts.push(
      <span key="plan" className="inline-flex items-center gap-1">
        <Sun className="h-3 w-3" aria-hidden />
        {task.plannedDate <= t ? 'Today' : formatRelativeDay(task.plannedDate)}
      </span>,
    );
  }
  if (task.subtasks.length) {
    const done = task.subtasks.filter((s) => s.done).length;
    parts.push(
      <span key="sub" className="inline-flex items-center gap-1">
        <ListTree className="h-3 w-3" aria-hidden />
        {done}/{task.subtasks.length}
      </span>,
    );
  }
  if (!parts.length) return null;
  return <div className="mt-0.5 flex flex-wrap gap-x-3 text-2xs text-ink-faint">{parts}</div>;
}

/**
 * "Done", plus where that leaves its project. Read from what's already cached (no request);
 * by now the optimistic update has taken the task out of the open list.
 */
function doneMessage(qc: QueryClient, task: Task, projectName: string | null): string {
  if (!task.projectId || !projectName) return 'Done';
  const total = qc.getQueryData<ProjectTaskCounts>(taskCountsKey)?.[task.projectId];
  const open = qc
    .getQueryData<Task[]>(keys.openTasks)
    ?.filter((t) => t.projectId === task.projectId);
  if (!open) return 'Done';
  if (!open.length) return `Done. Nothing left open in ${projectName}.`;
  return total ? `Done · ${projectName}: ${total - open.length} of ${total}` : 'Done';
}

/**
 * One task. Checking it shows the tick for a moment before the task leaves the list,
 * with an Undo in the toast. `extra` adds a quiet action on the right (e.g. "Plan for today").
 */
export function TaskRow({
  task,
  showPlanned = true,
  showProject = true,
  extra,
}: {
  task: Task;
  showPlanned?: boolean;
  showProject?: boolean;
  extra?: ReactNode;
}) {
  const update = useUpdateTask();
  const qc = useQueryClient();
  const projectNames = useProjectNames();
  const projectName = task.projectId ? (projectNames.get(task.projectId) ?? null) : null;
  const project = showProject ? projectName : null;
  const toast = useToast();
  const [, setParams] = useSearchParams();
  const [pendingDone, setPendingDone] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  useEffect(() => () => clearTimeout(timer.current), []);

  const checked = task.status === 'done' || pendingDone;

  // mutateAsync, not mutate(…, callbacks): completing removes this row (optimistically), and
  // per-call callbacks are dropped once the component unmounts.
  const setStatus = (status: Task['status']) =>
    update
      .mutateAsync({ id: task.id, patch: { status } })
      .then(() => {
        if (status === 'done') {
          toast({
            message: doneMessage(qc, task, projectName),
            action: {
              label: 'Undo',
              onClick: () =>
                update
                  .mutateAsync({ id: task.id, patch: { status: 'open' } })
                  .catch((err) => toast({ message: errorMessage(err), tone: 'error' })),
            },
          });
        }
      })
      .catch((err) => {
        setPendingDone(false);
        toast({ message: errorMessage(err), tone: 'error' });
      });

  const onCheck = (next: boolean) => {
    clearTimeout(timer.current);
    if (task.status === 'done') return setStatus('open');
    if (!next) return setPendingDone(false);
    setPendingDone(true);
    timer.current = setTimeout(() => setStatus('done'), 450);
  };

  const open = () =>
    setParams(
      (p) => {
        p.set('task', task.id);
        return p;
      },
      { replace: false },
    );

  return (
    <div
      className="group -mx-2 flex cursor-pointer items-start gap-3 rounded px-2 py-2.5 transition-colors hover:bg-surface/70 active:bg-surface"
      onClick={open}
    >
      <Checkbox
        checked={checked}
        onChange={onCheck}
        label={checked ? `Mark “${task.title}” as not done` : `Complete “${task.title}”`}
        className="mt-[3px]"
      />
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          open();
        }}
        className="min-w-0 flex-1 text-left focus-visible:outline-offset-4"
      >
        <span
          className={cn(
            'block text-[0.9375rem] leading-6 transition-colors',
            checked ? 'text-ink-faint line-through decoration-ink-faint/60' : 'text-ink',
          )}
        >
          {task.title}
        </span>
        <Meta task={task} showPlanned={showPlanned} project={project} />
      </button>
      {task.priority === 'high' && task.status === 'open' && (
        <Flag className="mt-1 h-3.5 w-3.5 shrink-0 text-warn" aria-label="High priority" />
      )}
      {extra && (
        <div className="-my-1 shrink-0" onClick={(e) => e.stopPropagation()}>
          {extra}
        </div>
      )}
    </div>
  );
}

/** A task row while loading: same box, checkbox square and title line. Use inside a Skeleton. */
export function TaskRowSkeleton({ width, meta }: { width: string; meta?: boolean }) {
  return (
    <div className="flex items-start gap-3 py-2.5">
      <SkeletonBlock className="mt-[3px] h-[18px] w-[18px] shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1">
        <SkeletonText className="text-[0.9375rem] leading-6" width={width} />
        {meta && <SkeletonText className="mt-0.5 text-2xs" width="5rem" />}
      </div>
    </div>
  );
}
