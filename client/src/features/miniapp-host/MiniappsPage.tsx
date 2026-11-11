import { Image, ShoppingBag } from 'lucide-react';
import type { Glyph } from './sdk/types';
import { Link } from 'react-router-dom';
import { PAGE_FRAME } from '../../components/shell/PageHeader';
import { cn } from '../../lib/cn';
import { enabledApps, useMiniappState } from './api';
import { MiniappIcon } from './MiniappIcon';
import { wallpaperStyle } from './wallpapers';

interface Tile {
  key: string;
  to: string;
  name: string;
  glyph: Glyph;
  background: string;
  color?: string;
}

const BUILT_IN: Tile[] = [
  {
    key: 'store',
    to: '/miniapps/store',
    name: 'Store',
    glyph: ShoppingBag,
    background: 'linear-gradient(160deg, #6f93d6 0%, #3c5d9c 100%)',
  },
  {
    key: 'wallpaper',
    to: '/miniapps/wallpaper',
    name: 'Wallpaper',
    glyph: Image,
    background: 'linear-gradient(160deg, #b08ad6 0%, #6c4f99 100%)',
  },
];

/** The miniapps screen: app icons on a wallpaper, like a phone's home screen. */
export default function MiniappsPage() {
  const state = useMiniappState();
  const apps = enabledApps(state.data);
  const wp = wallpaperStyle(state.data?.settings.wallpaper);
  const ink =
    wp.ink === 'light'
      ? 'text-white [text-shadow:0_1px_3px_rgb(0_0_0/0.55)]'
      : 'text-[#1d2330] [text-shadow:0_1px_2px_rgb(255_255_255/0.4)]';
  const tiles: Tile[] = [
    ...BUILT_IN,
    ...apps.map((a) => ({
      key: a.id,
      to: `/miniapps/${a.id}`,
      name: a.name,
      glyph: a.icon.glyph,
      background: a.icon.background,
      color: a.icon.color,
    })),
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
            <h1 className={cn('font-serif text-[1.625rem] font-medium leading-tight', ink)}>
              Miniapps
            </h1>
          </div>
        </header>
        <ul className="mt-6 grid grid-cols-4 gap-x-2 gap-y-6 sm:grid-cols-6 lg:grid-cols-8">
          {tiles.map((t) => (
            <li key={t.key}>
              <Link
                to={t.to}
                className="group flex flex-col items-center gap-1.5 rounded-lg py-1 outline-offset-4"
              >
                <MiniappIcon
                  glyph={t.glyph}
                  background={t.background}
                  color={t.color}
                  className="transition-transform group-active:scale-90"
                />
                <span className={cn('max-w-full truncate px-1 text-[0.75rem] leading-4', ink)}>
                  {t.name}
                </span>
              </Link>
            </li>
          ))}
        </ul>
        {state.isSuccess && apps.length === 0 && (
          <p className={cn('mt-10 text-center text-sm', ink)}>
            No miniapps yet. Open the Store to add some.
          </p>
        )}
      </div>
    </>
  );
}
