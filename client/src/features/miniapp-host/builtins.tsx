import type { IconLook } from './MiniappIcon';

/**
 * The built-in icons, drawn like phone system apps: bold filled shapes, a few clear colours,
 * cut-outs in the icon's own colour (`var(--icon-bg)`).
 */
type GlyphProps = { className?: string; strokeWidth?: string | number };
const cut = { stroke: 'var(--icon-bg)' };

function StoreGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M8.4 8.3V7a3.6 3.6 0 0 1 7.2 0v1.3"
        stroke="currentColor"
        strokeWidth={2}
        strokeLinecap="round"
      />
      <path
        d="M4.8 9c0-.6.5-1.1 1.1-1.1h12.2c.6 0 1.1.5 1.1 1.1l-.8 10.3a2.2 2.2 0 0 1-2.2 2H7.8a2.2 2.2 0 0 1-2.2-2Z"
        fill="currentColor"
      />
      <path d="M9.2 12.4a2.8 2.8 0 0 0 5.6 0" style={cut} strokeWidth={2} strokeLinecap="round" />
    </svg>
  );
}

/** A small photo: sky, sun and two hills, in colour on a white icon. */
function WallpaperGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className}>
      <defs>
        <clipPath id="wp-glyph-frame">
          <rect x="2" y="3.5" width="20" height="17" rx="4" />
        </clipPath>
      </defs>
      <g clipPath="url(#wp-glyph-frame)">
        <rect x="2" y="3.5" width="20" height="17" fill="#5aaeff" />
        <circle cx="16.4" cy="8.6" r="2.3" fill="#ffc83d" />
        <path d="M2 16.5 8.5 10.4l7 7.6V21H2Z" fill="#2fbf71" />
        <path d="m10.5 21 5.6-6.2a1.3 1.3 0 0 1 1.9 0L22 19.2V21Z" fill="#14995a" />
      </g>
    </svg>
  );
}

function ClockGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="9.4" fill="#fff" />
      <path d="M12 6.6V12l3.6 2.2" stroke="#1c1c1e" strokeWidth={2} strokeLinecap="round" />
      <path d="M12 12 8.2 16" stroke="#ff8a1f" strokeWidth={1.4} strokeLinecap="round" />
      <circle cx="12" cy="12" r="1.2" fill="#ff8a1f" />
    </svg>
  );
}

export const STORE_ICON: IconLook = {
  glyph: StoreGlyph,
  background: '#2f62e8',
  gradient: ['#5ea0ff', '#2a55e0'],
};
export const WALLPAPER_ICON: IconLook = {
  glyph: WallpaperGlyph,
  background: '#ffffff',
  gradient: ['#ffffff', '#eef1f5'],
};
export const CLOCK_ICON: IconLook = {
  glyph: ClockGlyph,
  background: '#1c1c1e',
  gradient: ['#3a3a3e', '#141416'],
};
