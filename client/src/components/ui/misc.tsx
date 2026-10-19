import { useEffect, useState } from 'react';
import type { ReactNode } from 'react';
import { NavLink } from 'react-router-dom';
import { cn } from '../../lib/cn';

/** Keyboard key hint. Hidden on touch-only screens where it means nothing. */
export function Kbd({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd
      className={cn(
        'hidden rounded-sm border border-line px-1 font-sans text-2xs text-ink-faint [@media(hover:hover)]:inline-block',
        className,
      )}
    >
      {children}
    </kbd>
  );
}

/** Renders "Loading…" only if loading takes longer than a moment, so fast loads don't flicker. */
export function Loading({ label = 'Loading…', className }: { label?: string; className?: string }) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShow(true), 350);
    return () => clearTimeout(t);
  }, []);
  return (
    <p className={cn('py-6 text-sm text-ink-faint', !show && 'invisible', className)} role="status">
      {label}
    </p>
  );
}

/** Understated empty state: a sentence and maybe one action. Not an error. */
export function Empty({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <div className="py-6 text-sm text-ink-faint">
      <p>{children}</p>
      {action && <div className="mt-3">{action}</div>}
    </div>
  );
}

export function ErrorNote({ children, onRetry }: { children: ReactNode; onRetry?: () => void }) {
  return (
    <p className="py-4 text-sm text-bad" role="alert">
      {children}{' '}
      {onRetry && (
        <button type="button" onClick={onRetry} className="text-ink underline underline-offset-2">
          Try again
        </button>
      )}
    </p>
  );
}

/** Text tabs that are real links (back button and deep links work). */
export function TabLinks({ tabs }: { tabs: { to: string; label: string; end?: boolean }[] }) {
  return (
    <nav className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0">
      {tabs.map((t) => (
        <NavLink
          key={t.to}
          to={t.to}
          end={t.end}
          className={({ isActive }) =>
            cn(
              '-mb-px whitespace-nowrap border-b-2 px-2 py-2.5 text-sm transition-colors first:pl-0 sm:py-2',
              isActive
                ? 'border-accent font-medium text-ink'
                : 'border-transparent text-ink-muted hover:text-ink',
            )
          }
        >
          {t.label}
        </NavLink>
      ))}
    </nav>
  );
}

/** Small toggle group for filters / options. */
export function Segmented<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T;
  onChange: (v: T) => void;
  options: { value: T; label: string }[];
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="inline-flex rounded border border-line p-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'h-9 rounded-sm px-3 text-sm transition-colors sm:h-7',
            value === o.value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
