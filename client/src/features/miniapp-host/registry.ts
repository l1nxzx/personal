import type { MiniappDefinition } from './sdk/types';

/**
 * Every miniapp in client/miniapps/: each folder's index.ts, found at build time. The site
 * never imports a miniapp directly; adding or deleting a folder adds or removes the app.
 */
const modules = import.meta.glob<{ default: MiniappDefinition }>('../../../miniapps/*/index.ts', {
  eager: true,
});

export const MINIAPPS: MiniappDefinition[] = Object.entries(modules)
  .map(([path, mod]) => {
    const folder = path.split('/').at(-2);
    const def = mod.default;
    if (!def || def.id !== folder)
      throw new Error(`miniapps/${folder}/index.ts must export defineMiniapp({ id: '${folder}' })`);
    return def;
  })
  .sort((a, b) => a.name.localeCompare(b.name));

export const miniappById = (id: string): MiniappDefinition | undefined =>
  MINIAPPS.find((m) => m.id === id);
