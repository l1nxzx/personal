import { ChevronLeft } from 'lucide-react';
import type { ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Page } from '../../components/shell/PageHeader';

/** The top of every miniapp-related screen: back to the miniapps screen, then the title. */
export function MiniappFrame({
  title,
  icon,
  back = { to: '/miniapps', label: 'Miniapps' },
  hideTitle,
  children,
}: {
  title: string;
  icon?: ReactNode;
  back?: { to: string; label: string };
  /** The page draws its own heading (the Store's app page). */
  hideTitle?: boolean;
  children: ReactNode;
}) {
  return (
    <Page width="narrow">
      <header className="pt-safe">
        <div className="flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center pt-safe lg:mt-4">
          <Link
            to={back.to}
            className="-ml-2 flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink active:bg-surface-2/60 sm:h-8"
          >
            <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" /> {back.label}
          </Link>
        </div>
        {!hideTitle && (
          <div className="mt-1 flex items-center gap-3">
            {icon}
            <h1 className="page-title min-w-0 truncate">{title}</h1>
          </div>
        )}
      </header>
      <div className={hideTitle ? 'mt-2' : 'mt-6'}>{children}</div>
    </Page>
  );
}
