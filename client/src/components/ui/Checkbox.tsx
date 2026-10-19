import { Check } from 'lucide-react';
import { cn } from '../../lib/cn';

/** Square task checkbox with a generous invisible hit area for touch. */
export function Checkbox({
  checked,
  onChange,
  label,
  className,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  className?: string;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!checked);
      }}
      className={cn(
        'group relative inline-flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-sm border transition-colors',
        "before:absolute before:-inset-3 before:content-['']",
        checked
          ? 'border-accent-strong bg-accent-strong text-accent-ink'
          : 'border-line-strong hover:border-accent/70',
        className,
      )}
    >
      <Check
        className={cn(
          'h-3 w-3 transition-opacity',
          checked ? 'opacity-100' : 'opacity-0 group-hover:opacity-20',
        )}
        strokeWidth={3}
      />
    </button>
  );
}
