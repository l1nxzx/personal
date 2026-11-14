import { Ellipsis, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useLocation, useMatch } from 'react-router-dom';
import { useUI } from '../../context/UIContext';
import { cn } from '../../lib/cn';
import { useWallpaperNavTone } from '../../features/miniapp-host/navTone';
import { Dialog } from '../ui/Dialog';
import { NAV, PROFILE_NAV, SETTINGS_NAV, isActive, type NavItem } from './nav';

const PRIMARY = ['/', '/journal', '/tasks'];

interface BarLook {
  bar: string;
  active: string;
  idle: string;
  activeIcon: string;
  press: string;
}

/**
 * The bar's look: the site's own, or, over the miniapps screen's wallpaper, frosted glass
 * tinted to suit it (dark over dark wallpapers and pictures, light over light ones).
 */
const LOOKS: Record<'site' | 'light' | 'dark' | 'theme', BarLook> = {
  site: {
    bar: 'border-line bg-bg',
    active: 'text-ink',
    idle: 'text-ink-faint',
    activeIcon: 'text-accent',
    press: 'active:bg-surface-2/60',
  },
  light: {
    bar: 'border-white/10 bg-[rgb(10_13_19/0.42)] backdrop-blur-xl backdrop-saturate-150',
    active: 'text-white',
    idle: 'text-white/60',
    activeIcon: 'text-white',
    press: 'active:bg-white/10',
  },
  dark: {
    bar: 'border-black/[0.06] bg-white/50 backdrop-blur-xl backdrop-saturate-150',
    active: 'text-[#1d222b]',
    idle: 'text-[#1d222b]/60',
    activeIcon: 'text-[#1d222b]',
    press: 'active:bg-black/5',
  },
  theme: {
    bar: 'border-line/60 bg-bg/65 backdrop-blur-xl backdrop-saturate-150',
    active: 'text-ink',
    idle: 'text-ink-faint',
    activeIcon: 'text-accent',
    press: 'active:bg-surface-2/60',
  },
};

function Tab({ item, pathname, look }: { item: NavItem; pathname: string; look: BarLook }) {
  const active = isActive(item, pathname);
  const Icon = item.icon;
  return (
    <Link
      to={item.to}
      aria-current={active ? 'page' : undefined}
      className={cn(
        'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] transition-colors',
        look.press,
        active ? look.active : look.idle,
      )}
    >
      <Icon className={cn('h-5 w-5', active && look.activeIcon)} strokeWidth={1.75} />
      {item.short ?? item.label}
    </Link>
  );
}

/**
 * Phone navigation: Home, Journal, the plus (center, thumb-reachable: the page's quick action,
 * else Capture), Projects, More.
 * Everything else lives in the More sheet.
 */
export function MobileNav() {
  const { pathname } = useLocation();
  const { openCapture, quickAction } = useUI();
  const [moreOpen, setMoreOpen] = useState(false);
  const look = LOOKS[useWallpaperNavTone(!!useMatch('/miniapps')) ?? 'site'];

  const [home, journal, tasks] = PRIMARY.map((p) => NAV.find((n) => n.to === p)!);
  const secondary = [...NAV.filter((n) => !PRIMARY.includes(n.to)), PROFILE_NAV, SETTINGS_NAV];
  const moreActive = secondary.some((n) => isActive(n, pathname));

  return (
    <>
      <nav
        aria-label="Sections"
        className={cn(
          'pb-safe fixed inset-x-0 bottom-0 z-30 border-t transition-colors lg:hidden',
          look.bar,
        )}
      >
        <div className="flex h-14 items-stretch">
          <Tab item={home!} pathname={pathname} look={look} />
          <Tab item={journal!} pathname={pathname} look={look} />
          <div className="flex flex-1 items-center justify-center">
            <button
              type="button"
              // The page's own most common action (useQuickAction); otherwise Quick Capture.
              onClick={() => (quickAction ? quickAction.run() : openCapture())}
              aria-label={quickAction?.label ?? 'Capture'}
              title={quickAction?.label ?? 'Capture'}
              className="flex h-10 w-12 items-center justify-center rounded-md bg-accent-strong text-accent-ink transition-colors active:bg-accent-strong/75"
            >
              <Plus className="h-5 w-5" strokeWidth={2.25} />
            </button>
          </div>
          <Tab item={tasks!} pathname={pathname} look={look} />
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-expanded={moreOpen}
            className={cn(
              'flex flex-1 flex-col items-center justify-center gap-0.5 text-[0.6875rem] transition-colors',
              look.press,
              moreActive ? look.active : look.idle,
            )}
          >
            <Ellipsis className={cn('h-5 w-5', moreActive && look.activeIcon)} strokeWidth={1.75} />
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
