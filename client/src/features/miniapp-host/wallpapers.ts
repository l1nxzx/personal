import type { MiniappWallpaper } from '../../../../shared/types';
import { pictureUrl, type PictureTone } from './pictureTone';

/**
 * Backgrounds for the miniapps screen: the site's own colours (they follow dark/light mode), a
 * few quiet solids, or a picture of one's own. `ink`: the label colour that reads on it
 * ('theme' = the site's ink).
 */
export const WALLPAPERS: {
  id: string;
  name: string;
  background: string;
  ink: 'theme' | 'light' | 'dark';
}[] = [
  { id: 'plain', name: 'Plain', background: 'rgb(var(--bg))', ink: 'theme' },
  { id: 'mist', name: 'Mist', background: 'rgb(var(--surface))', ink: 'theme' },
  { id: 'navy', name: 'Navy', background: '#1b2433', ink: 'light' },
  { id: 'slate', name: 'Slate', background: '#2c323c', ink: 'light' },
  { id: 'moss', name: 'Moss', background: '#283029', ink: 'light' },
  { id: 'stone', name: 'Stone', background: '#d9d6cf', ink: 'dark' },
  { id: 'paper', name: 'Paper', background: '#eeece7', ink: 'dark' },
];

export const DEFAULT_WALLPAPER = WALLPAPERS[0]!;

/**
 * CSS background and label colour for a wallpaper setting (unknown ids fall back to Plain). A
 * picture's label colour follows its brightness (`tone`, see pictureTone.ts): white labels on a
 * slightly darkened dark picture, dark labels on a slightly lightened light one.
 */
export function wallpaperStyle(
  w: MiniappWallpaper | undefined,
  tone?: PictureTone | null,
): {
  background: string;
  ink: 'theme' | 'light' | 'dark';
} {
  if (w?.kind === 'image') {
    const light = tone?.ink === 'dark';
    const shade = light ? 'rgb(255 255 255 / 0.1)' : 'rgb(0 0 0 / 0.22)';
    return {
      background: `linear-gradient(${shade}, ${shade}), url("${pictureUrl(w.version)}") center / cover no-repeat`,
      ink: light ? 'dark' : 'light',
    };
  }
  return WALLPAPERS.find((x) => w?.kind === 'template' && x.id === w.id) ?? DEFAULT_WALLPAPER;
}

/** Text colour classes for labels on a wallpaper. */
export const inkClass = (ink: 'theme' | 'light' | 'dark', onPicture = false) =>
  ink === 'theme'
    ? 'text-ink'
    : ink === 'dark'
      ? onPicture
        ? 'text-[#15191f] [text-shadow:0_1px_2px_rgb(255_255_255/0.45)]'
        : 'text-[#1d222b]'
      : onPicture
        ? 'text-white [text-shadow:0_1px_2px_rgb(0_0_0/0.45)]'
        : 'text-[#e8ebf0]';
