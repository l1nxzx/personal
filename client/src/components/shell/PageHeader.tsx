import { Search } from 'lucide-react';
import type { ReactNode } from 'react';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/cn';
import { IconButton } from '../ui/Button';

/** Page title row. On phones it also carries the search button (no sidebar there). */
export function PageHeader({
  title,
  actions,
  children,
  className,
}: {
  title: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
}) {
  const { openSearch } = useUI();
  return (
    <header className={cn('pt-safe', className)}>
      <div className="flex min-h-[3.5rem] items-center gap-2 pt-3 lg:pt-10">
        <h1 className="page-title min-w-0 flex-1 truncate">{title}</h1>
        {actions}
        <IconButton label="Search" onClick={openSearch} className="-mr-2 lg:hidden">
          <Search className="h-5 w-5" strokeWidth={1.75} />
        </IconButton>
      </div>
      {children}
    </header>
  );
}

/**
 * The one content frame every page sits in. It is the same for all pages, so content always
 * starts at the same place and switching sections doesn't move anything sideways.
 */
export const PAGE_FRAME = 'mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-10';

/**
 * Standard page container. `width` limits how far the page's column extends to the right;
 * every column starts at the frame's left edge (it is never centered on its own).
 */
export function Page({
  children,
  width = 'default',
}: {
  children: ReactNode;
  width?: 'default' | 'narrow' | 'wide';
}) {
  return (
    <div className={cn(PAGE_FRAME, 'pb-28 lg:pb-16')}>
      <div
        className={cn(
          width === 'narrow' && 'max-w-[43rem]',
          width === 'default' && 'max-w-[51rem]',
        )}
      >
        {children}
      </div>
    </div>
  );
}
