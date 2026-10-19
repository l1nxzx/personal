import { Ellipsis, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/cn';
import { Dialog } from '../ui/Dialog';
import { NAV, SETTINGS_NAV, isActive, type NavItem } from './nav';

const PRIMARY = ['/', '/journal', '/tasks'];

function Tab({ item, pathname }: { item: NavItem; pathname: string }) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem]',
        active ? 'text-ink' : 'text-ink-faint',
      )}
    >
      <Icon className={cn('h-5 w-5', active && 'text-accent')} strokeWidth={1.75} />
      {item.short ?? item.label}
    </Link>
  );
}

/**
 * Phone navigation: Home, Journal, Capture (center, thumb-reachable), Projects, More.
 * Everything else lives in the More sheet.
 */
export function MobileNav() {
  const { pathname } = useLocation();
  const { openCapture } = useUI();
  const [moreOpen, setMoreOpen] = useState(false);

  const [home, journal, tasks] = PRIMARY.map((p) => NAV.find((n) => n.to === p)!);
  const secondary = [...NAV.filter((n) => !PRIMARY.includes(n.to)), SETTINGS_NAV];
  const moreActive = secondary.some((n) => isActive(n, pathname));

  return (
    <>
      <nav
        aria-label="Sections"
        className="pb-safe fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface lg:hidden"
      >
        <div className="flex h-14 items-stretch">
          <Tab item={home!} pathname={pathname} />
          <Tab item={journal!} pathname={pathname} />
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              onClick={() => openCapture()}
              aria-label="Capture"
              className="flex h-10 w-12 items-center justify-center rounded-md bg-accent-strong text-accent-ink active:bg-accent-strong/80"
            >
              <Plus className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          <Tab item={tasks!} pathname={pathname} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem]',
              moreActive ? 'text-ink' : 'text-ink-faint',
            )}
          >
            <Ellipsis className={cn('h-5 w-5', moreActive && 'text-accent')} strokeWidth={1.75} />
            More
          </button>
        </div>
      </nav>

      <Dialog open={moreOpen} onClose={() => setMoreOpen(false)} title="More" placement="top">
        <nav className="grid grid-cols-1 py-1" aria-label="More sections">
          {secondary.map((item) => {
            const Icon = item.icon;
            const active = isActive(item, pathname);
            return (
              <Link
                key={item.to}
                to={item.to}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex h-12 items-center gap-3 px-4 text-[0.9375rem]',
                  active ? 'text-ink' : 'text-ink-muted',
                  'active:bg-surface-2',
                )}
              >
                <Icon
                  className={cn('h-5 w-5', active ? 'text-accent' : 'text-ink-faint')}
                  strokeWidth={1.75}
                />
                <span className="flex-1">{item.title}</span>
              </Link>
            );
          })}
        </nav>
      </Dialog>
    </>
  );
}
