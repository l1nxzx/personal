import type { ComponentType, LazyExoticComponent } from 'react';

type Lazyable<P> = ComponentType<P> | LazyExoticComponent<ComponentType<P>>;

/** An icon picture: an SVG component taking a class and stroke width (lucide icons fit). */
export type Glyph = ComponentType<{ className?: string; strokeWidth?: string | number }>;

/** What a miniapp declares about itself (its `index.ts` default export). */
export interface MiniappDefinition<T = unknown> {
  /** Lower-case letters, digits and dashes; the folder name. Never change it: data is kept under it. */
  id: string;
  /** Shown under the icon, in the Store and on its screen. Short (one or two words). */
  name: string;
  /** One sentence for the Store. */
  description: string;
  icon: {
    /** The picture on the icon: an SVG component (a lucide icon works) drawn in `color`. */
    glyph: Glyph;
    /** Icon background: any CSS background (a colour or a gradient). */
    background: string;
    /** Colour of the glyph. Default white. */
    color?: string;
  };
  /** The app's screen. Load it lazily: `lazy(() => import('./App'))`. */
  App: Lazyable<object>;
  /** Optional Home widget (a small card). Load it lazily too. */
  Widget?: Lazyable<object>;
  /** The data a fresh install starts with (what `useAppData()` returns before anything is saved). */
  initialData: T;
  /**
   * Optional: combine this device's unsaved data with newer data from another device (after
   * being offline, for instance). Without it, this device's data wins.
   */
  merge?: (server: T, local: T) => T;
}

/** Declares a miniapp (identity function: it only checks and types the definition). */
export function defineMiniapp<T>(def: MiniappDefinition<T>): MiniappDefinition<T> {
  if (!/^[a-z][a-z0-9-]{1,39}$/.test(def.id) || ['store', 'wallpaper'].includes(def.id))
    throw new Error(`Miniapp id "${def.id}" is not allowed`);
  return def;
}
