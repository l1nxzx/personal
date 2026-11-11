import type { MiniappWallpaper } from '../../../../shared/types';
import { API_BASE } from '../../lib/apiFetch';

/** Built-in backgrounds for the miniapps screen. `ink`: label colour that reads on it. */
export const WALLPAPERS: { id: string; name: string; background: string; ink: 'light' | 'dark' }[] =
  [
    {
      id: 'night',
      name: 'Night',
      background:
        'radial-gradient(120% 70% at 80% 0%, #2c3f6b 0%, transparent 60%), radial-gradient(90% 60% at 0% 100%, #1d2a44 0%, transparent 65%), linear-gradient(170deg, #182134 0%, #121720 60%, #0c1018 100%)',
      ink: 'light',
    },
    {
      id: 'dawn',
      name: 'Dawn',
      background:
        'radial-gradient(90% 60% at 20% 0%, #ffd9b8 0%, transparent 60%), linear-gradient(170deg, #f3c4a6 0%, #e3a3b5 50%, #8d86c4 100%)',
      ink: 'dark',
    },
    {
      id: 'forest',
      name: 'Forest',
      background:
        'radial-gradient(100% 60% at 100% 0%, #3c6a52 0%, transparent 60%), linear-gradient(170deg, #233f34 0%, #15271f 60%, #0d1813 100%)',
      ink: 'light',
    },
    {
      id: 'ocean',
      name: 'Ocean',
      background:
        'radial-gradient(110% 60% at 0% 0%, #2f7fae 0%, transparent 60%), linear-gradient(170deg, #145176 0%, #0f2f47 55%, #0a1a28 100%)',
      ink: 'light',
    },
    {
      id: 'plum',
      name: 'Plum',
      background:
        'radial-gradient(100% 60% at 90% 10%, #7a4c86 0%, transparent 60%), linear-gradient(170deg, #4a2b55 0%, #2a1931 60%, #170e1b 100%)',
      ink: 'light',
    },
    {
      id: 'sand',
      name: 'Sand',
      background:
        'radial-gradient(90% 60% at 80% 0%, #fff4e2 0%, transparent 60%), linear-gradient(170deg, #efe2cc 0%, #dcc6a3 60%, #c7ab83 100%)',
      ink: 'dark',
    },
    {
      id: 'aurora',
      name: 'Aurora',
      background:
        'radial-gradient(80% 50% at 15% 10%, #3fb39a 0%, transparent 60%), radial-gradient(70% 50% at 90% 30%, #6a5acd 0%, transparent 60%), linear-gradient(175deg, #10202a 0%, #0b1219 100%)',
      ink: 'light',
    },
    {
      id: 'slate',
      name: 'Slate',
      background: 'linear-gradient(170deg, #3a4250 0%, #262c36 60%, #1a1f27 100%)',
      ink: 'light',
    },
  ];

/** CSS background and label colour for a wallpaper setting. */
export function wallpaperStyle(w: MiniappWallpaper | undefined): {
  background: string;
  ink: 'light' | 'dark';
} {
  if (w?.kind === 'image')
    return {
      // A soft shade at the top and bottom keeps labels readable on any picture.
      background: `linear-gradient(180deg, rgb(0 0 0 / 0.35) 0%, transparent 25%, transparent 70%, rgb(0 0 0 / 0.45) 100%), url("${API_BASE}/miniapps/wallpaper/${w.version}") center / cover no-repeat`,
      ink: 'light',
    };
  const t = WALLPAPERS.find((x) => x.id === (w?.kind === 'template' ? w.id : 'night'));
  return t ?? WALLPAPERS[0]!;
}
