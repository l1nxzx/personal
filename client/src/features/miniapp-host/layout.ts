import type { MiniappState } from '../../../../shared/types';
import { enabledApps } from './api';
import { miniappById } from './registry';
import type { MiniappDefinition } from './sdk/types';

/**
 * The miniapps screen's tiles, in order: app icons, the two built-in icons, and widgets (an
 * app's widget, or the built-in clock). Saved as keys (`settings.layout`): an app id, `store`,
 * `wallpaper`, `widget:<app id>`, `widget:clock`.
 */
export type Tile =
  | { key: string; kind: 'app'; app: MiniappDefinition }
  | { key: 'store' | 'wallpaper'; kind: 'builtin' }
  | { key: string; kind: 'widget'; app: MiniappDefinition }
  | { key: 'widget:clock'; kind: 'clock' };

export const CLOCK_KEY = 'widget:clock';
export const widgetKey = (appId: string) => `widget:${appId}`;

/** Before anything is arranged: the clock, each app's widget, then the icons. */
function defaultKeys(apps: MiniappDefinition[]): string[] {
  return [
    CLOCK_KEY,
    ...apps.filter((a) => a.Widget).map((a) => widgetKey(a.id)),
    ...apps.map((a) => a.id),
    'store',
    'wallpaper',
  ];
}

function tileOf(key: string, enabled: Set<string>): Tile | null {
  if (key === CLOCK_KEY) return { key: CLOCK_KEY, kind: 'clock' };
  if (key === 'store' || key === 'wallpaper') return { key, kind: 'builtin' };
  const isWidget = key.startsWith('widget:');
  const id = isWidget ? key.slice(7) : key;
  const app = miniappById(id);
  // Apps no longer on the screen (or not in this build) are skipped, and keep their place.
  if (!app || !enabled.has(id) || (isWidget && !app.Widget)) return null;
  return isWidget ? { key, kind: 'widget', app } : { key, kind: 'app', app };
}

/**
 * What the screen shows: the saved arrangement, minus apps that are off the screen, plus apps
 * got since it was saved (at the end, as on a phone).
 */
export function screenTiles(state: MiniappState | undefined): Tile[] {
  const apps = enabledApps(state);
  const enabled = new Set(apps.map((a) => a.id));
  const keys = state?.settings.layout ?? defaultKeys(apps);
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  const add = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    const t = tileOf(k, enabled);
    if (t) tiles.push(t);
  };
  keys.forEach(add);
  apps.forEach((a) => add(a.id));
  add('store');
  add('wallpaper');
  return tiles;
}

/**
 * The keys to save after a change on screen: the visible tiles' new order, with the hidden
 * keys (apps off the screen) kept at their old positions, so getting an app back restores it.
 */
export function keysToSave(
  previous: string[] | null,
  visible: string[],
  removed: string[] = [],
): string[] {
  const shown = new Set(visible);
  const out: string[] = [];
  let next = 0;
  for (const k of previous ?? []) {
    if (removed.includes(k)) continue;
    if (shown.has(k)) {
      // A visible slot takes the next visible key in its new order.
      if (next < visible.length) out.push(visible[next++]!);
    } else out.push(k);
  }
  while (next < visible.length) out.push(visible[next++]!);
  return [...new Set(out)];
}
