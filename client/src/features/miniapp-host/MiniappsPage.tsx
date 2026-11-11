import { Link } from 'react-router-dom';
import { PAGE_FRAME } from '../../components/shell/PageHeader';
import { cn } from '../../lib/cn';
import { enabledApps, useMiniappState } from './api';
import { STORE_ICON, WALLPAPER_ICON } from './builtins';
import { MiniappIcon } from './MiniappIcon';
import type { Glyph } from './sdk/types';
import { inkClass, wallpaperStyle } from './wallpapers';

interface Tile {
  key: string;
  to: string;
  name: string;
  glyph: Glyph;
  background: string;
  color?: string;
}

/** The miniapps screen: app icons on a wallpaper, like a phone's home screen. */
export default function MiniappsPage() {
  const state = useMiniappState();
  const apps = enabledApps(state.data);
  const wallpaper = state.data?.settings.wallpaper;
  const wp = wallpaperStyle(wallpaper);
  const ink = inkClass(wp.ink, wallpaper?.kind === 'image');
  const tiles: Tile[] = [
    ...apps.map((a) => ({
      key: a.id,
      to: `/miniapps/${a.id}`,
      name: a.name,
      glyph: a.icon.glyph,
      background: a.icon.background,
      color: a.icon.color,
    })),
    { key: 'store', to: '/miniapps/store', name: 'Store', ...STORE_ICON },
    { key: 'wallpaper', to: '/miniapps/wallpaper', name: 'Wallpaper', ...WALLPAPER_ICON },
  ];

  return (
    <>
      <div
        aria-hidden
        data-testid="miniapps-wallpaper"
        className="fixed inset-0 lg:left-[13.5rem]"
        style={{ background: wp.background }}
      />
      <div className={cn('relative min-h-dvh pb-28 lg:pb-16', PAGE_FRAME)}>
        <header className="pt-safe">
          <div className="flex min-h-[3.5rem] items-center pt-3 lg:pt-10">
            <h1 className={cn('page-title', ink)}>Miniapps</h1>
          </div>
        </header>
        <ul className="mt-6 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6 lg:grid-cols-8">
          {tiles.map((t) => (
            <li key={t.key}>
              <Link
                to={t.to}
                className="group flex flex-col items-center gap-1.5 rounded-md py-1 outline-offset-2"
              >
                <MiniappIcon
                  glyph={t.glyph}
                  background={t.background}
                  color={t.color}
                  className="transition-transform duration-100 group-active:scale-95"
                />
                <span className={cn('max-w-full truncate px-1 text-[0.75rem] leading-4', ink)}>
                  {t.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {state.isSuccess && apps.length === 0 && (
          <p className={cn('mt-10 text-sm opacity-80', ink)}>
            Nothing here yet. Get miniapps in the Store.
          </p>
        )}
      </div>
    </>
  );
}
