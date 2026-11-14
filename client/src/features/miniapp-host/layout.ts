import type { MiniappFolder, MiniappState } from '../../../../shared/types';
import { enabledApps } from './api';
import { miniappById } from './registry';
import type { MiniappDefinition } from './sdk/types';

/**
 * The miniapps screen's tiles, in order: app icons, the two built-in icons, folders of icons,
 * and widgets (an app's widget, or the built-in clock). Saved as keys (`settings.layout`): an
 * app id, `store`, `wallpaper`, `folder:<id>`, `widget:<app id>`, `widget:clock`; a folder's
 * contents are in `settings.folders`.
 */
export type IconTile =
  | { key: string; kind: 'app'; app: MiniappDefinition }
  | { key: 'store' | 'wallpaper'; kind: 'builtin' };

export type Tile =
  | IconTile
  | { key: string; kind: 'folder'; id: string; name: string; items: IconTile[] }
  | { key: string; kind: 'widget'; app: MiniappDefinition }
  | { key: 'widget:clock'; kind: 'clock' };

export type Folders = Record<string, MiniappFolder>;

export const CLOCK_KEY = 'widget:clock';
export const widgetKey = (appId: string) => `widget:${appId}`;
export const folderKey = (id: string) => `folder:${id}`;
export const isIcon = (t: Tile): t is IconTile => t.kind === 'app' || t.kind === 'builtin';

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

function iconOf(key: string, enabled: Set<string>): IconTile | null {
  if (key === 'store' || key === 'wallpaper') return { key, kind: 'builtin' };
  const app = miniappById(key);
  return app && enabled.has(key) ? { key, kind: 'app', app } : null;
}

function tileOf(key: string, enabled: Set<string>, folders: Folders): Tile | null {
  if (key === CLOCK_KEY) return { key: CLOCK_KEY, kind: 'clock' };
  if (key.startsWith('folder:')) {
    const id = key.slice(7);
    const f = folders[id];
    if (!f) return null;
    const items = f.apps.map((k) => iconOf(k, enabled)).filter((t): t is IconTile => !!t);
    return items.length ? { key, kind: 'folder', id, name: f.name, items } : null;
  }
  if (key.startsWith('widget:')) {
    const app = miniappById(key.slice(7));
    return app?.Widget && enabled.has(app.id) ? { key, kind: 'widget', app } : null;
  }
  // Apps no longer on the screen (or not in this build) are skipped, and keep their place.
  return iconOf(key, enabled);
}

/**
 * What the screen shows: the saved arrangement, minus apps that are off the screen, plus apps
 * got since it was saved (at the end, as on a phone).
 */
export function screenTiles(state: MiniappState | undefined): Tile[] {
  const apps = enabledApps(state);
  const enabled = new Set(apps.map((a) => a.id));
  const folders = state?.settings.folders ?? {};
  const keys = state?.settings.layout ?? defaultKeys(apps);
  const seen = new Set<string>();
  const tiles: Tile[] = [];
  const add = (k: string) => {
    if (seen.has(k)) return;
    seen.add(k);
    if (k.startsWith('folder:')) folders[k.slice(7)]?.apps.forEach((a) => seen.add(a));
    const t = tileOf(k, enabled, folders);
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

const newFolderId = () => `f${Math.random().toString(36).slice(2, 9)}`;

/**
 * An icon dropped on another icon (a new folder, in the target's place) or on a folder (added
 * to it). `order` is the screen's visible keys at the drop. Returns the new visible keys and
 * folders.
 */
export function dropIntoFolder(
  order: string[],
  folders: Folders,
  dragged: string,
  target: string,
): { keys: string[]; folders: Folders; folderId: string } {
  const keys = order.filter((k) => k !== dragged);
  if (target.startsWith('folder:')) {
    const id = target.slice(7);
    const f = folders[id] ?? { name: 'Folder', apps: [] };
    return {
      keys,
      folders: {
        ...folders,
        [id]: { ...f, apps: [...f.apps.filter((k) => k !== dragged), dragged] },
      },
      folderId: id,
    };
  }
  const id = newFolderId();
  return {
    keys: keys.map((k) => (k === target ? folderKey(id) : k)),
    folders: { ...folders, [id]: { name: 'Folder', apps: [target, dragged] } },
    folderId: id,
  };
}

/**
 * An icon taken out of a folder: it goes right after the folder. A folder left with one icon
 * becomes that icon again.
 */
export function takeOutOfFolder(
  order: string[],
  folders: Folders,
  id: string,
  key: string,
): { keys: string[]; folders: Folders } {
  const f = folders[id];
  if (!f) return { keys: order, folders };
  const apps = f.apps.filter((k) => k !== key);
  const fk = folderKey(id);
  const at = order.indexOf(fk);
  const keys = order.filter((k) => k !== key);
  keys.splice(at === -1 ? keys.length : at + 1, 0, key);
  const rest = { ...folders };
  if (apps.length <= 1) {
    delete rest[id];
    const i = keys.indexOf(fk);
    if (i !== -1) keys.splice(i, 1, ...apps);
    return { keys, folders: rest };
  }
  return { keys, folders: { ...rest, [id]: { ...f, apps } } };
}
