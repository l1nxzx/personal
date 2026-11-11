import type { ReactNode } from 'react';
import { useToast as useSiteToast } from '../../../context/ToastContext';
import { cn } from '../../../lib/cn';

export { Button, IconButton } from '../../../components/ui/Button';
export { cn };

/** Short messages at the bottom of the screen, optionally with one action ("Undo"). */
export function useToast() {
  return useSiteToast();
}

/** A plain card in the site's style. */
export function Card({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('rounded-lg border border-line bg-surface p-4', className)}>{children}</div>
  );
}

/** A small uppercase label with a hairline, as section headings across the site. */
export function SectionLabel({ children }: { children: ReactNode }) {
  return <h2 className="section-label mb-2">{children}</h2>;
}
