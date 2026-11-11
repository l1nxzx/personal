import type { Glyph } from './sdk/types';
import { cn } from '../../lib/cn';

/** A phone-style app icon: a rounded square with a glyph. */
export function MiniappIcon({
  glyph: GlyphIcon,
  background,
  color = '#fff',
  size = 'md',
  className,
}: {
  glyph: Glyph;
  background: string;
  color?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const box =
    size === 'sm'
      ? 'h-9 w-9 rounded-[10px]'
      : size === 'lg'
        ? 'h-16 w-16 rounded-[18px]'
        : 'h-[3.75rem] w-[3.75rem] rounded-[17px]';
  const glyphSize = size === 'sm' ? 'h-5 w-5' : size === 'lg' ? 'h-8 w-8' : 'h-7 w-7';
  return (
    <span
      aria-hidden
      className={cn(
        'flex shrink-0 items-center justify-center shadow-[0_2px_8px_rgb(0_0_0/0.25),inset_0_1px_0_rgb(255_255_255/0.18)]',
        box,
        className,
      )}
      style={{ background, color }}
    >
      <GlyphIcon className={glyphSize} strokeWidth={1.9} />
    </span>
  );
}
