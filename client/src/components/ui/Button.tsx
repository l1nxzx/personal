import { forwardRef } from 'react';
import type { ButtonHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

type Variant = 'primary' | 'secondary' | 'ghost' | 'danger';
type Size = 'sm' | 'md';

const variants: Record<Variant, string> = {
  primary: 'bg-accent-strong text-accent-ink hover:bg-accent-strong/85 active:bg-accent-strong/75',
  secondary:
    'border border-line-strong bg-surface-2 text-ink hover:border-ink-faint/60 hover:bg-surface-2/70 active:bg-surface',
  ghost: 'text-ink-muted hover:bg-surface-2 hover:text-ink active:bg-surface-2/60',
  danger: 'border border-bad/40 text-bad hover:bg-bad/10 active:bg-bad/15',
};

const sizes: Record<Size, string> = {
  sm: 'h-9 px-3 text-sm sm:h-8',
  md: 'h-10 px-4 text-sm sm:h-9',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  /** Disables the button and shows a quiet "working" state (prevents double submits). */
  busy?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  {
    variant = 'secondary',
    size = 'md',
    busy,
    disabled,
    className,
    children,
    type = 'button',
    ...props
  },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 select-none items-center justify-center gap-2 rounded font-medium transition-colors',
        'disabled:pointer-events-none disabled:opacity-50',
        busy && 'cursor-progress opacity-70',
        variants[variant],
        sizes[size],
        className,
      )}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      {...props}
    >
      {children}
    </button>
  );
});

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  active?: boolean;
}

/** Square icon button with an accessible label; 40px on touch screens, with a 44px hit area. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, active, className, children, type = 'button', ...props },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'touch-target inline-flex h-10 w-10 shrink-0 items-center justify-center rounded text-ink-muted transition-colors sm:h-8 sm:w-8',
        'hover:bg-surface-2 hover:text-ink active:bg-surface-2/60 disabled:opacity-40',
        active && 'bg-surface-2 text-ink',
        className,
      )}
      {...props}
    >
      {children}
    </button>
  );
});
