import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
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

  const onKeyDown = menuKeys(
    listRef,
    () => {
      setOpen(false);
      (rootRef.current?.querySelector('[aria-haspopup]') as HTMLElement | null)?.focus();
    },
    () => setOpen(false),
  );

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
          className={cn(MENU_PANEL, 'absolute mt-1', align === 'right' ? 'right-0' : 'left-0')}
        >
          <MenuItems items={items} onPick={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}

const MENU_PANEL =
  'z-40 min-w-[11rem] rounded-md border border-line bg-raised py-1 shadow-[0_12px_32px_-8px_rgb(0_0_0/0.5)]';

/** Arrow keys move between items; Escape and Tab close. */
function menuKeys(
  listRef: React.RefObject<HTMLDivElement>,
  onEscape: () => void,
  onTab: () => void,
) {
  return (e: React.KeyboardEvent) => {
    const buttons = [
      ...(listRef.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []),
    ];
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (e.key === 'Escape') {
      e.stopPropagation();
      onEscape();
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      buttons[(i + 1) % buttons.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      buttons[(i - 1 + buttons.length) % buttons.length]?.focus();
    } else if (e.key === 'Tab') {
      onTab();
    }
  };
}

function MenuItems({ items, onPick }: { items: MenuItem[]; onPick: () => void }) {
  return items.map((item) => (
    <button
      key={item.label}
      type="button"
      role="menuitem"
      disabled={item.disabled}
      onClick={() => {
        onPick();
        item.onSelect();
      }}
      className={cn(
        'flex h-10 w-full items-center gap-2.5 px-3 text-left text-sm outline-none sm:h-8',
        'hover:bg-surface-2 active:bg-surface-2/60 focus-visible:bg-surface-2 disabled:opacity-40',
        item.danger ? 'text-bad' : 'text-ink',
      )}
    >
      {item.icon && <span className="text-ink-faint [&>svg]:h-4 [&>svg]:w-4">{item.icon}</span>}
      {item.label}
    </button>
  ));
}

/**
 * The same menu, opened at a point (right-click or long-press) and kept inside the viewport.
 * Closes on a click elsewhere, Escape, scrolling or resizing.
 */
export function PointMenu({
  at,
  items,
  label,
  onClose,
}: {
  at: { x: number; y: number } | null;
  items: MenuItem[];
  label: string;
  onClose: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useLayoutEffect(() => {
    const el = listRef.current;
    if (!at || !el) return setPos(null);
    const { width, height } = el.getBoundingClientRect();
    const pad = 8;
    setPos({
      left: Math.max(pad, Math.min(at.x, window.innerWidth - width - pad)),
      top: Math.max(pad, at.y + height + pad > window.innerHeight ? at.y - height : at.y),
    });
  }, [at]);

  useEffect(() => {
    if (!at) return;
    const previous = document.activeElement as HTMLElement | null;
    listRef.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const close = () => onCloseRef.current();
    const onPointer = (e: PointerEvent) => {
      if (!listRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', onPointer);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      previous?.focus?.({ preventScroll: true });
    };
  }, [at]);

  if (!at) return null;
  return createPortal(
    <div
      ref={listRef}
      role="menu"
      aria-label={label}
      onKeyDown={menuKeys(listRef, onClose, onClose)}
      onContextMenu={(e) => e.preventDefault()}
      style={pos ?? { left: at.x, top: at.y, visibility: 'hidden' }}
      className={cn(MENU_PANEL, 'fixed')}
    >
      <MenuItems items={items} onPick={onClose} />
    </div>,
    document.body,
  );
}
