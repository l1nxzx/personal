/**
 * The icons every miniapps screen has, drawn as filled two-tone glyphs (white shapes with
 * cut-outs in the icon's own colour, `var(--icon-bg)`), the way phone system apps are.
 */
type GlyphProps = { className?: string; strokeWidth?: string | number };
const cut = { stroke: 'var(--icon-bg)' };

function StoreGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <path
        d="M8.6 8.2V7.1a3.4 3.4 0 0 1 6.8 0v1.1"
        stroke="currentColor"
        strokeWidth={1.9}
        strokeLinecap="round"
      />
      <path
        d="M5.2 8.6c0-.5.4-.9.9-.9h11.8c.5 0 .9.4.9.9l-.8 10.6a2 2 0 0 1-2 1.8H8a2 2 0 0 1-2-1.8Z"
        fill="currentColor"
      />
      <path d="M9.4 12.1a2.6 2.6 0 0 0 5.2 0" style={cut} strokeWidth={1.8} strokeLinecap="round" />
    </svg>
  );
}

function WallpaperGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <rect x="3.5" y="4.5" width="17" height="15" rx="3" fill="currentColor" />
      <circle cx="15.6" cy="9" r="1.7" style={{ fill: 'var(--icon-bg)' }} opacity={0.7} />
      <path
        d="M3.5 16.6 8.2 11.9a1.2 1.2 0 0 1 1.7 0l6.2 6.2M13.4 15.4l1.6-1.6a1.2 1.2 0 0 1 1.7 0l3.8 3.8"
        style={cut}
        strokeWidth={1.7}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

function ClockGlyph({ className }: GlyphProps) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none">
      <circle cx="12" cy="12" r="8.6" fill="currentColor" />
      <path d="M12 7.2V12l3.2 2" style={cut} strokeWidth={1.9} strokeLinecap="round" />
    </svg>
  );
}

export const STORE_ICON = { glyph: StoreGlyph, background: '#4c6798' };
export const WALLPAPER_ICON = { glyph: WallpaperGlyph, background: '#5d6678' };
export const CLOCK_ICON = { glyph: ClockGlyph, background: '#2f3b52' };
