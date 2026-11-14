import { useMiniappState } from './api';
import { wallpaperStyle } from './wallpapers';

/**
 * How the phone's bottom bar should look over the miniapps screen's wallpaper: frosted, and
 * tinted to its labels ('light' labels: a dark tint; 'dark' labels: a light one; 'theme': the
 * site's own background, translucent). null when the screen isn't showing.
 */
export function useWallpaperNavTone(onScreen: boolean): 'light' | 'dark' | 'theme' | null {
  const state = useMiniappState(onScreen);
  if (!onScreen) return null;
  return wallpaperStyle(state.data?.settings.wallpaper).ink;
}
