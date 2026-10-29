import type { CSSProperties } from 'react';

export type WritingFont = 'serif' | 'sans';

/**
 * The type of written text: entry bodies (writing and reading), belief positions. One
 * definition, so all of it reads the same. Matches `.prose-entry` in index.css.
 */
export const writingTextClass = (font: WritingFont) =>
  font === 'serif'
    ? 'font-serif text-[1.1875rem] leading-[1.75]'
    : 'font-sans text-[1.0625rem] leading-[1.75]';

export const writingTextStyle = (font: WritingFont): CSSProperties | undefined =>
  font === 'serif' ? { fontVariationSettings: "'opsz' 16" } : undefined;

/** Rendered Markdown (`.prose-entry`) in the chosen font. */
export const proseClass = (font: WritingFont) =>
  font === 'serif' ? 'prose-entry font-serif' : 'prose-entry font-sans';

export const proseStyle = (font: WritingFont): CSSProperties =>
  font === 'serif'
    ? { fontVariationSettings: "'opsz' 16" }
    : { ['--entry-size' as string]: '1.0625rem' };
