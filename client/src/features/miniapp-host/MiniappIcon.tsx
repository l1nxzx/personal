import { useId } from 'react';
import type { CSSProperties } from 'react';
import { cn } from '../../lib/cn';
import type { Glyph } from './sdk/types';

/**
 * The squircle (a superellipse, n = 5) phone launchers use for app icons, in a 100 x 100 box.
 * Softer than a rounded square: the curve starts further from the corner.
 */
const SQUIRCLE = (() => {
  const n = 5;
  const pts: string[] = [];
  for (let i = 0; i < 96; i++) {
    const t = (i / 96) * Math.PI * 2;
    const c = Math.cos(t);
    const s = Math.sin(t);
    const x = 50 + 50 * Math.sign(c) * Math.abs(c) ** (2 / n);
    const y = 50 + 50 * Math.sign(s) * Math.abs(s) ** (2 / n);
    pts.push(`${x.toFixed(2)} ${y.toFixed(2)}`);
  }
  return `M${pts.join('L')}Z`;
})();

const SIZES = {
  xs: { box: 'h-5 w-5', glyph: 'h-3 w-3' },
  sm: { box: 'h-9 w-9', glyph: 'h-5 w-5' },
  md: { box: 'h-[3.75rem] w-[3.75rem]', glyph: 'h-[1.9rem] w-[1.9rem]' },
  lg: { box: 'h-[4.5rem] w-[4.5rem]', glyph: 'h-9 w-9' },
} as const;

/**
 * An app icon, finished like a phone's: a squircle in the app's colour, lit softly from above
 * (lighter at the top, deeper at the bottom), with a fine bevelled edge and the glyph slightly
 * raised. Everything is derived from the app's one colour, so apps only choose that.
 *
 * Custom glyphs may use `var(--icon-bg)` (the icon's colour) for cut-outs in a white shape.
 */
export function MiniappIcon({
  glyph: GlyphIcon,
  background,
  color = '#ffffff',
  size = 'md',
  lifted = false,
  className,
}: {
  glyph: Glyph;
  background: string;
  color?: string;
  size?: keyof typeof SIZES;
  /** A shadow under the icon, for icons standing on a wallpaper. */
  lifted?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, '');
  const { box, glyph } = SIZES[size];
  const top = `color-mix(in srgb, ${background} 80%, white)`;
  const bottom = `color-mix(in srgb, ${background} 82%, black)`;
  return (
    <span
      aria-hidden
      className={cn('relative inline-flex shrink-0 items-center justify-center', box, className)}
      style={
        {
          color,
          '--icon-bg': background,
          filter: lifted
            ? 'drop-shadow(0 1px 1px rgb(0 0 0 / 0.22)) drop-shadow(0 4px 10px rgb(0 0 0 / 0.2))'
            : size === 'xs'
              ? undefined
              : 'drop-shadow(0 1px 1.5px rgb(0 0 0 / 0.18))',
        } as CSSProperties
      }
    >
      <svg viewBox="0 0 100 100" className="absolute inset-0 h-full w-full">
        <defs>
          <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" style={{ stopColor: top }} />
            <stop offset="0.55" style={{ stopColor: background }} />
            <stop offset="1" style={{ stopColor: bottom }} />
          </linearGradient>
          <radialGradient id={`${id}l`} cx="0.5" cy="-0.1" r="0.85">
            <stop offset="0" stopColor="#fff" stopOpacity="0.26" />
            <stop offset="1" stopColor="#fff" stopOpacity="0" />
          </radialGradient>
          <linearGradient id={`${id}e`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#fff" stopOpacity="0.32" />
            <stop offset="0.5" stopColor="#fff" stopOpacity="0.06" />
            <stop offset="1" stopColor="#000" stopOpacity="0.22" />
          </linearGradient>
          <clipPath id={`${id}c`}>
            <path d={SQUIRCLE} />
          </clipPath>
        </defs>
        <path d={SQUIRCLE} fill={`url(#${id}f)`} />
        <path d={SQUIRCLE} fill={`url(#${id}l)`} />
        {/* Drawn twice as wide and clipped: only the inner half shows, as a fine edge. */}
        <path
          d={SQUIRCLE}
          fill="none"
          stroke={`url(#${id}e)`}
          strokeWidth={size === 'xs' ? 5 : 3}
          clipPath={`url(#${id}c)`}
        />
      </svg>
      <GlyphIcon
        className={cn(
          'relative',
          glyph,
          size !== 'xs' && 'drop-shadow-[0_1px_1px_rgb(0_0_0/0.22)]',
        )}
        strokeWidth={size === 'xs' ? 2.25 : 2}
      />
    </span>
  );
}
