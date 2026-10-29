import type { CSSProperties, ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * Placeholder for content that is still loading, shaped like the real thing so nothing moves
 * when it arrives. Invisible for the first moment (a fast load shows no flash), then fades in.
 * Put only placeholder shapes inside; real headings and controls stay outside it.
 */
export function Skeleton({
  children,
  className,
  label = 'Loading…',
}: {
  children: ReactNode;
  className?: string;
  label?: string;
}) {
  return (
    <div role="status" aria-label={label} aria-busy className={cn('skeleton', className)}>
      {children}
    </div>
  );
}

/**
 * One line of placeholder text. Give it the same type classes as the real line (font, size,
 * line height, margins) and it takes exactly that line's height.
 */
export function SkeletonText({ width, className }: { width: string; className?: string }) {
  return (
    <span aria-hidden className={cn('block', className)}>
      <span
        className="skeleton-bar inline-block h-[0.7em] max-w-full align-middle"
        style={{ width }}
      />
      {'​'}
    </span>
  );
}

/** A placeholder shape with an explicit size (an icon, a thumbnail, a control). */
export function SkeletonBlock({ className, style }: { className?: string; style?: CSSProperties }) {
  return <span aria-hidden className={cn('skeleton-bar block', className)} style={style} />;
}

/** Varied line widths, so a list of placeholders doesn't look stamped out. */
export const SKELETON_WIDTHS = ['62%', '45%', '74%', '52%', '38%', '58%'];
export const skeletonWidth = (i: number) => SKELETON_WIDTHS[i % SKELETON_WIDTHS.length]!;
