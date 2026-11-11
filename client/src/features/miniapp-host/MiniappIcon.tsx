import { cn } from '../../lib/cn';
import type { Glyph } from './sdk/types';

/** An app icon: a flat rounded square in one colour, with a line glyph. */
export function MiniappIcon({
  glyph: GlyphIcon,
  background,
  color = '#f2f4f7',
  size = 'md',
  className,
}: {
  glyph: Glyph;
  background: string;
  color?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box = {
    xs: 'h-5 w-5 rounded-[5px]',
    sm: 'h-9 w-9 rounded-[9px]',
    md: 'h-14 w-14 rounded-[14px]',
    lg: 'h-[4.5rem] w-[4.5rem] rounded-[18px]',
  }[size];
  const glyphSize = { xs: 'h-3 w-3', sm: 'h-5 w-5', md: 'h-7 w-7', lg: 'h-9 w-9' }[size];
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center ring-1 ring-inset ring-black/10',
        box,
        className,
      )}
      style={{ background, color }}
    >
      <GlyphIcon className={glyphSize} strokeWidth={1.75} />
    </span>
  );
}
