import type { Project } from '../../../../shared/types';
import { cn } from '../../lib/cn';
import { formatRelativeDay } from '../../lib/dates';

/** What a project is for, in a line: its goal, or else the first line of text in its notes. */
export function purposeOf(p: Project): string {
  if (p.goal.trim()) return p.goal.trim();
  const line = p.description
    .split('\n')
    .filter((l) => !/^\s*#{1,6}\s/.test(l)) // a heading ("## Why") isn't a purpose
    .map((l) => l.replace(/^\s*(>\s?|[-*+]\s|\d+\.\s)/, '').trim())
    .find(Boolean);
  return line ?? '';
}

/** A target is an intention, not a deadline: a passed one is stated plainly, never flagged. */
export function targetLabel(date: string, today: string): string {
  return date < today
    ? `Target was ${formatRelativeDay(date)}`
    : `Target ${formatRelativeDay(date)}`;
}

/**
 * Tasks done and milestones reached, as a thin line and a short phrase. Facts only: no
 * percentages, no colours for "behind".
 */
export function ProgressLine({
  done,
  total,
  milestones,
  className,
}: {
  done: number;
  total: number;
  milestones?: { done: number; total: number };
  className?: string;
}) {
  const parts: string[] = [];
  if (total > 0) parts.push(`${done} of ${total} ${total === 1 ? 'task' : 'tasks'} done`);
  if (milestones?.total) parts.push(`${milestones.done} of ${milestones.total} milestones`);
  if (!parts.length) return null;
  const share = total > 0 ? done / total : milestones!.done / milestones!.total;
  return (
    <div className={cn('flex items-center gap-3', className)}>
      <div
        className="h-[3px] w-24 shrink-0 overflow-hidden rounded-full bg-line sm:w-32"
        aria-hidden
      >
        <div
          className="h-full rounded-full bg-accent/80 transition-[width] duration-500"
          style={{ width: `${Math.round(share * 100)}%` }}
        />
      </div>
      <span className="min-w-0 truncate text-2xs tabular-nums text-ink-faint">
        {parts.join(' · ')}
      </span>
    </div>
  );
}
