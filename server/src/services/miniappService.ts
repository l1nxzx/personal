import { randomBytes } from 'node:crypto';
import type {
  MiniappData,
  MiniappInstall,
  MiniappSettings,
  MiniappState,
  MiniappWallpaper,
} from '../../../shared/types.js';
import * as repo from '../data/miniappRepo.js';
import * as storage from '../data/storage.js';
import { AppError, badRequest, notFound } from '../lib/errors.js';
import { notifyChange, type Ctx } from './context.js';
import { processImage } from './imageService.js';

/**
 * Miniapps: generic per-account storage for the apps in client/miniapps/. The server never
 * knows which apps exist; an app id is just a name. Data is opaque JSON, at most MAX_JSON.
 */
export const MAX_JSON = 300_000;
const DEFAULT_WALLPAPER: MiniappWallpaper = { kind: 'template', id: 'plain' };
const wallpaperPath = (uid: string, version: string) =>
  `users/${uid}/miniapps/wallpaper-${version}`;

export async function getState(ctx: Ctx): Promise<MiniappState> {
  const [settings, apps] = await Promise.all([
    repo.getSettings(ctx.userId),
    repo.listApps(ctx.userId),
  ]);
  return {
    settings: {
      wallpaper: settings.wallpaper ?? DEFAULT_WALLPAPER,
      order: settings.order ?? [],
      layout: settings.layout ?? null,
    },
    apps: Object.fromEntries(
      apps.map((a): [string, MiniappInstall] => [
        a.id,
        { enabled: a.enabled, onHome: a.onHome, hasData: a.hasData, updatedAt: a.updatedAt },
      ]),
    ),
  };
}

/** Enable ("install") or disable ("uninstall") an app, and show its widget on Home or not. */
export async function setInstall(
  ctx: Ctx,
  appId: string,
  patch: { enabled?: boolean; onHome?: boolean },
): Promise<void> {
  // A disabled app's widget leaves Home too.
  const next = patch.enabled === false ? { ...patch, onHome: false } : patch;
  await repo.setInstall(ctx.userId, appId, next);
  if (patch.enabled !== undefined) {
    const order = (await repo.getSettings(ctx.userId)).order ?? [];
    const without = order.filter((id) => id !== appId);
    await repo.setSettings(ctx.userId, {
      order: patch.enabled ? [...without, appId] : without,
    });
  }
  notifyChange(ctx, 'miniapp', appId);
}

export async function setOrder(ctx: Ctx, order: string[]): Promise<void> {
  await repo.setSettings(ctx.userId, { order: [...new Set(order)] });
  notifyChange(ctx, 'miniapp');
}

/**
 * The miniapps screen's arrangement (icons and widgets). The app ids in it, in that order,
 * become the app order too.
 */
export async function setLayout(ctx: Ctx, layout: string[]): Promise<void> {
  const tiles = [...new Set(layout)];
  const settings = await repo.getSettings(ctx.userId);
  const placed = tiles.filter((t) => !t.startsWith('widget:'));
  const known = settings.order ?? [];
  const order = [
    ...placed.filter((id) => known.includes(id)),
    ...known.filter((id) => !placed.includes(id)),
  ];
  await repo.setSettings(ctx.userId, { layout: tiles, order });
  notifyChange(ctx, 'miniapp');
}

export async function getData(ctx: Ctx, appId: string): Promise<MiniappData> {
  const r = await repo.get(ctx.userId, appId);
  return {
    data: r?.json ? (JSON.parse(r.json) as unknown) : null,
    rev: r?.rev ?? 0,
    updatedAt: r?.dataUpdatedAt ?? null,
  };
}

export async function putData(
  ctx: Ctx,
  appId: string,
  data: unknown,
  expectedRev: number | null,
): Promise<{ rev: number; updatedAt: string }> {
  const json = JSON.stringify(data ?? null);
  if (json.length > MAX_JSON) throw badRequest('This miniapp saved too much data');
  const result = await repo.putData(ctx.userId, appId, json, expectedRev);
  if (result.status === 'conflict')
    throw new AppError(409, 'EDIT_CONFLICT', 'Changed on another device', { rev: result.rev });
  notifyChange(ctx, 'miniapp', appId);
  return { rev: result.rev, updatedAt: result.at };
}

/** The Store's "Delete data". */
export async function deleteData(ctx: Ctx, appId: string): Promise<void> {
  await repo.clearData(ctx.userId, appId);
  notifyChange(ctx, 'miniapp', appId);
}

// ---------------------------------------------------------------- wallpaper
export async function setTemplateWallpaper(ctx: Ctx, id: string): Promise<MiniappSettings> {
  const settings = await repo.getSettings(ctx.userId);
  await repo.setSettings(ctx.userId, {
    wallpaper: { kind: 'template', id },
    wallpaperPath: null,
  });
  if (settings.wallpaperPath) await storage.deleteFile(settings.wallpaperPath).catch(() => {});
  notifyChange(ctx, 'miniapp');
  return (await getState(ctx)).settings;
}

/** A picture of one's own: resized, re-encoded and stripped of metadata (location) first. */
export async function uploadWallpaper(ctx: Ctx, file: Buffer): Promise<MiniappSettings> {
  const { data, contentType } = await processImage(file);
  const settings = await repo.getSettings(ctx.userId);
  const version = randomBytes(8).toString('hex');
  const path = wallpaperPath(ctx.userId, version);
  await storage.uploadFile(path, data, contentType);
  await repo.setSettings(ctx.userId, {
    wallpaper: { kind: 'image', version },
    wallpaperPath: path,
  });
  if (settings.wallpaperPath) await storage.deleteFile(settings.wallpaperPath).catch(() => {});
  notifyChange(ctx, 'miniapp');
  return (await getState(ctx)).settings;
}

export async function openWallpaper(ctx: Ctx, version: string) {
  const settings = await repo.getSettings(ctx.userId);
  if (settings.wallpaper?.kind !== 'image' || settings.wallpaper.version !== version)
    throw notFound('No such wallpaper');
  const f = await storage.openFile(wallpaperPath(ctx.userId, version));
  if (!f) throw notFound('No such wallpaper');
  return f;
}
