import { createContext, useCallback, useContext, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Button } from '../components/ui/Button';
import { Dialog } from '../components/ui/Dialog';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  danger?: boolean;
}

const ConfirmContext = createContext<((o: ConfirmOptions) => Promise<boolean>) | null>(null);

/** `await confirm({...})` resolves true only if the person explicitly confirms. */
export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [options, setOptions] = useState<ConfirmOptions | null>(null);
  const resolver = useRef<(v: boolean) => void>();
  const cancelRef = useRef<HTMLButtonElement>(null);

  const confirm = useCallback((o: ConfirmOptions) => {
    setOptions(o);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  const close = (result: boolean) => {
    resolver.current?.(result);
    resolver.current = undefined;
    setOptions(null);
  };

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      <Dialog
        open={options !== null}
        onClose={() => close(false)}
        title={options?.title ?? ''}
        hideTitle
        placement="center"
        initialFocus={cancelRef}
      >
        {options && (
          <div className="p-5">
            <h2 className="font-medium text-ink">{options.title}</h2>
            {options.message && <p className="mt-2 text-sm text-ink-muted">{options.message}</p>}
            <div className="mt-5 flex justify-end gap-2">
              <Button ref={cancelRef} onClick={() => close(false)}>
                Cancel
              </Button>
              <Button variant={options.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
                {options.confirmLabel ?? 'Confirm'}
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error('useConfirm must be used inside ConfirmProvider');
  return ctx;
}
