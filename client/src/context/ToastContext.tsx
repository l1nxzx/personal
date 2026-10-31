import { X } from 'lucide-react';
import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';

interface ToastInput {
  message: string;
  action?: { label: string; onClick: () => void };
  tone?: 'default' | 'error';
}
interface ToastItem extends ToastInput {
  id: number;
}

const ToastContext = createContext<((t: ToastInput) => void) | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((ts) => ts.filter((t) => t.id !== id)), []);

  const push = useCallback(
    (t: ToastInput) => {
      const id = nextId.current++;
      setToasts((ts) => [...ts.slice(-2), { ...t, id }]);
      setTimeout(() => dismiss(id), t.tone === 'error' ? 8000 : 5000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(4.25rem+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3 lg:bottom-6"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === 'error' ? 'alert' : 'status'}
            className={cn(
              'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-md border bg-raised py-2 pl-4 pr-1.5 text-sm shadow-[0_12px_32px_-8px_rgb(0_0_0/0.5)]',
              t.tone === 'error' ? 'border-bad/40 text-ink' : 'border-line text-ink',
            )}
          >
            <span className="min-w-0 flex-1">{t.message}</span>
            {t.action && (
              <button
                type="button"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
                className="h-9 shrink-0 rounded px-2 font-medium text-accent hover:bg-surface-2 active:bg-surface-2/60 sm:h-7"
              >
                {t.action.label}
              </button>
            )}
            <button
              type="button"
              aria-label="Dismiss"
              onClick={() => dismiss(t.id)}
              className="touch-target flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-7 sm:w-7"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
