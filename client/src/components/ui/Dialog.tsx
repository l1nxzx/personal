import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useHoldWork } from '../../lib/busy';
import { cn } from '../../lib/cn';
import { IconButton } from './Button';

type Placement = 'top' | 'center' | 'panel';

const placements: Record<Placement, string> = {
  // Anchored near the top on phones so the on-screen keyboard never covers it.
  top: 'inset-x-2 top-[calc(env(safe-area-inset-top)+0.5rem)] max-h-[calc(100dvh-1rem-env(safe-area-inset-top))] sm:inset-x-auto sm:left-1/2 sm:top-[12vh] sm:w-[36rem] sm:-translate-x-1/2',
  center:
    'inset-x-4 top-1/2 -translate-y-1/2 sm:inset-x-auto sm:left-1/2 sm:w-[26rem] sm:-translate-x-1/2',
  // Full screen on phones, a side panel on larger screens.
  panel:
    'inset-0 pt-safe pb-safe sm:inset-y-0 sm:left-auto sm:right-0 sm:w-[28rem] sm:border-l sm:border-line sm:pb-0 sm:pt-0',
};

let openCount = 0;

interface DialogProps {
  open: boolean;
  onClose: () => void;
  /** Accessible name; shown as a heading unless `hideTitle`. */
  title: string;
  hideTitle?: boolean;
  placement?: Placement;
  children: ReactNode;
  className?: string;
  /** Element to focus first; defaults to the first focusable element. */
  initialFocus?: React.RefObject<HTMLElement>;
}

export function Dialog({
  open,
  onClose,
  title,
  hideTitle,
  placement = 'top',
  children,
  className,
  initialFocus,
}: DialogProps) {
  const panelRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  // An open dialog is often a form; pull to refresh and updates wait until it closes.
  useHoldWork(open);

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    openCount++;
    document.body.style.overflow = 'hidden';

    const panel = panelRef.current!;
    const focusables = () =>
      [
        ...panel.querySelectorAll<HTMLElement>(
          'a[href],button:not([disabled]),input:not([disabled]),textarea:not([disabled]),select:not([disabled]),[tabindex]:not([tabindex="-1"])',
        ),
      ].filter((el) => el.offsetParent !== null);

    (initialFocus?.current ?? focusables()[0] ?? panel).focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current();
      } else if (e.key === 'Tab') {
        const els = focusables();
        if (!els.length) return;
        const first = els[0]!;
        const last = els.at(-1)!;
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    panel.addEventListener('keydown', onKey);
    return () => {
      panel.removeEventListener('keydown', onKey);
      if (--openCount === 0) document.body.style.overflow = '';
      previouslyFocused?.focus?.({ preventScroll: true });
    };
  }, [open, initialFocus]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 bg-[rgb(8_11_16/0.6)]" onClick={onClose} aria-hidden />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        className={cn(
          'absolute flex flex-col overflow-hidden border border-line bg-raised shadow-[0_16px_48px_-12px_rgb(0_0_0/0.5)] outline-none',
          placement !== 'panel' && 'rounded-md',
          placement === 'panel' && 'border-0',
          placements[placement],
          className,
        )}
      >
        {!hideTitle && (
          <div className="flex shrink-0 items-center justify-between gap-2 border-b border-line py-2 pl-4 pr-2">
            <h2 className="text-sm font-medium text-ink">{title}</h2>
            <IconButton label="Close" onClick={onClose}>
              <X className="h-4 w-4" />
            </IconButton>
          </div>
        )}
        {children}
      </div>
    </div>,
    document.body,
  );
}
