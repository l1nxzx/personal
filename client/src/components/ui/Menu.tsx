import { useEffect, useId, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  icon?: ReactNode;
  onSelect: () => void;
  danger?: boolean;
  disabled?: boolean;
}

/** A small dropdown menu. `trigger` receives the props to spread on the button that opens it. */
export function Menu({
  trigger,
  items,
  align = 'right',
}: {
  trigger: (props: {
    onClick: () => void;
    'aria-haspopup': 'menu';
    'aria-expanded': boolean;
    'aria-controls': string;
  }) => ReactNode;
  items: MenuItem[];
  align?: 'left' | 'right';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', onPointer);
    return () => document.removeEventListener('pointerdown', onPointer);
  }, [open]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []),
    ];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      setOpen(false);
      (rootRef.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div ref={rootRef} className="relative" onKeyDown={onKeyDown}>
      {trigger({
        onClick: () => setOpen((o) => !o),
        'aria-haspopup': 'menu',
        'aria-expanded': open,
        'aria-controls': id,
      })}
      {open && (
        <div
          ref={listRef}
          id={id}
          role="menu"
          className={cn(
            'absolute z-40 mt-1 min-w-[11rem] rounded-md border border-line bg-raised py-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.5)]',
            align === 'right' ? 'right-0' : 'left-0',
          )}
        >
          {items.map((item) => (
            <button
              key={item.label}
              type="button"
              role="menuitem"
              disabled={item.disabled}
              onClick={() => {
                setOpen(false);
                item.onSelect();
              }}
              className={cn(
                'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm outline-none sm:h-8',
                'hover:bg-surface-2 focus-visible:bg-surface-2 disabled:opacity-40',
                item.danger ? 'text-bad' : 'text-ink',
              )}
            >
              {item.icon && (
                <span className="text-ink-faint [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>
              )}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
