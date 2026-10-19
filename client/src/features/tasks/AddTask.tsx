import { CalendarDays, Plus } from 'lucide-react';
import { useState } from 'react';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatRelativeDay, today } from '../../lib/dates';
import { useCreateTask } from './api';

/**
 * Inline "add a task" line. Enter adds it and keeps the field ready for the next one.
 * `planToday` puts undated tasks on today's list (as planned, not due).
 */
export function AddTask({
  planToday,
  projectId,
  placeholder = 'Add a task',
}: {
  planToday?: boolean;
  projectId?: string;
  placeholder?: string;
}) {
  const [title, setTitle] = useState('');
  const [due, setDue] = useState('');
  const create = useCreateTask();
  const toast = useToast();

  const submit = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    create.mutate(
      {
        title: t,
        dueDate: due || null,
        plannedDate: planToday && !due ? today() : null,
        projectId: projectId ?? null,
      },
      {
        onSuccess: () => {
          setTitle('');
          setDue('');
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
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        maxLength={300}
        enterKeyHint="done"
        className="h-11 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
      />
      <label
        className={cn(
          'relative flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded px-2 text-2xs transition-colors hover:bg-surface-2 sm:h-8',
          due ? 'text-ink-muted' : 'text-ink-faint',
        )}
        title="Due date (optional)"
      >
        <CalendarDays className="h-4 w-4" strokeWidth={1.75} />
        <span className={due ? '' : 'sr-only sm:not-sr-only'}>
          {due ? `Due ${formatRelativeDay(due)}` : 'Due date'}
        </span>
        <input
          type="date"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          aria-label="Due date (optional)"
          className="absolute inset-0 cursor-pointer opacity-0"
        />
      </label>
      {title.trim() && (
        <button
          type="submit"
          disabled={create.isPending}
          className="h-9 shrink-0 rounded px-3 text-sm font-medium text-accent hover:bg-surface-2 sm:h-8"
        >
          Add
        </button>
      )}
    </form>
  );
}
