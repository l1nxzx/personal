import { forwardRef, useId } from 'react';
import type { InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react';
import { cn } from '../../lib/cn';

export const controlClass =
  'block w-full rounded border border-line bg-surface-2 px-3 py-2 text-ink placeholder:text-ink-faint ' +
  'transition-colors hover:border-line-strong focus:border-accent/70 focus:outline-none focus-visible:outline-none';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(
  function Input({ className, ...props }, ref) {
    return <input ref={ref} className={cn(controlClass, 'h-10 sm:h-9', className)} {...props} />;
  },
);

export const Textarea = forwardRef<
  HTMLTextAreaElement,
  TextareaHTMLAttributes<HTMLTextAreaElement>
>(function Textarea({ className, ...props }, ref) {
  return <textarea ref={ref} className={cn(controlClass, 'leading-6', className)} {...props} />;
});

/** Label + control + optional hint/error, stacked. */
export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
}) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1.5 block text-sm font-medium text-ink-muted">
        {label}
      </label>
      {children(id)}
      {error ? (
        <p className="mt-1.5 text-sm text-bad" role="alert">
          {error}
        </p>
      ) : hint ? (
        <p className="mt-1.5 text-sm text-ink-faint">{hint}</p>
      ) : null}
    </div>
  );
}
