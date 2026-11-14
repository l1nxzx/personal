import { useMiniappState } from './api';
import { usePictureTone } from './pictureTone';
import { wallpaperStyle } from './wallpapers';

/**
 * How the phone's bottom bar should look over the miniapps screen's wallpaper: frosted, and
 * tinted to what is under it ('light' text: a dark tint; 'dark' text: a light one; 'theme': the
 * site's own background, translucent). For a picture, its bottom strip decides. null when the
 * screen isn't showing.
 */
export function useWallpaperNavTone(onScreen: boolean): 'light' | 'dark' | 'theme' | null {
  const state = useMiniappState(onScreen);
  const wallpaper = onScreen ? state.data?.settings.wallpaper : undefined;
  const tone = usePictureTone(wallpaper);
  if (!onScreen) return null;
  if (wallpaper?.kind === 'image') return tone?.bar ?? 'light';
  return wallpaperStyle(wallpaper).ink;
}
