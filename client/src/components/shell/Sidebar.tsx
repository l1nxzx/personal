import { Plus, Search } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/cn';
import { modKey } from '../../lib/hotkeys';
import { Kbd } from '../ui/misc';
import { NAV, SETTINGS_NAV, isActive, type NavItem } from './nav';

function NavRow({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'relative flex h-8 items-center gap-3 rounded px-2.5 text-sm transition-colors',
        active ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:bg-surface-2/60 hover:text-ink',
      )}
    >
      {active && <span className="absolute -left-3 top-1.5 h-5 w-0.5 bg-accent" aria-hidden />}
      <Icon
        className={cn('h-4 w-4', active ? 'text-accent' : 'text-ink-faint')}
        strokeWidth={1.75}
      />
      {item.label}
    </Link>
  );
}

/** Desktop navigation: persistent, narrow, quiet. */
export function Sidebar() {
  const { pathname } = useLocation();
  const { openSearch, openCapture } = useUI();

  return (
    <aside className="fixed inset-y-0 left-0 z-30 hidden w-[13.5rem] flex-col border-r border-line bg-surface lg:flex">
      <div className="px-5 pb-4 pt-5">
        <Link
          to="/"
          className="font-serif text-lg font-medium tracking-[-0.01em] text-ink"
          style={{ fontVariationSettings: "'opsz' 30" }}
        >
          Notebook
        </Link>
      </div>

      <div className="space-y-1 px-3">
        <button
          type="button"
          onClick={openSearch}
          className="flex h-8 w-full items-center gap-3 rounded border border-line px-2.5 text-sm text-ink-faint transition-colors hover:border-line-strong hover:text-ink-muted"
        >
          <Search className="h-4 w-4" strokeWidth={1.75} />
          <span className="flex-1 text-left">Search</span>
          <Kbd>{modKey} K</Kbd>
        </button>
        <button
          type="button"
          onClick={() => openCapture()}
          className="flex h-8 w-full items-center gap-3 rounded px-2.5 text-sm text-accent transition-colors hover:bg-surface-2/60"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
          <span className="flex-1 text-left">Capture</span>
          <Kbd>C</Kbd>
        </button>
      </div>

      <nav className="mt-5 flex-1 space-y-0.5 px-3" aria-label="Sections">
        {NAV.map((item) => (
          <NavRow key={item.to} item={item} pathname={pathname} />
        ))}
      </nav>

      <div className="border-t border-line px-3 py-3">
        <NavRow item={SETTINGS_NAV} pathname={pathname} />
      </div>
    </aside>
  );
}
