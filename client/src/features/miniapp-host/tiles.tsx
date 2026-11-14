import { cn } from '../../lib/cn';
import type { Badge } from './badges';
import { iconLookOf } from './iconLooks';
import type { IconTile } from './layout';
import { MiniappIcon, SQUIRCLE_MASK } from './MiniappIcon';

export type Tone = 'light' | 'dark' | 'theme';

/** The red badge on an icon's top right corner: a count, or a dot. */
export function BadgeDot({ value }: { value: Badge }) {
  const label = value === true ? 'Needs attention' : `${value} waiting`;
  return (
    <span
      role="status"
      aria-label={label}
      className={cn(
        'absolute z-10 flex items-center justify-center rounded-full bg-[#ff3b30] font-semibold leading-none text-white ring-2 ring-black/10',
        value === true
          ? '-right-0.5 -top-0.5 h-3.5 w-3.5'
          : '-right-1.5 -top-1.5 h-[1.375rem] min-w-[1.375rem] px-1.5 text-[0.75rem] tabular-nums',
      )}
    >
      {value === true ? null : value > 99 ? '99+' : value}
    </span>
  );
}

/** Folder plates on the wallpaper: frosted, lighter over dark and darker over light. */
const PLATE: Record<Tone, string> = {
  light: 'bg-white/20',
  dark: 'bg-black/[0.12]',
  theme: 'bg-ink/[0.12]',
};

/**
 * A folder's icon: a frosted squircle with its first icons in a small grid, the same size
 * as an app icon.
 */
export function FolderIcon({
  items,
  tone,
  className,
}: {
  items: IconTile[];
  tone: Tone;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      data-icon
      className={cn(
        'relative grid h-[3.75rem] w-[3.75rem] shrink-0 content-start backdrop-blur-xl',
        // Up to four icons in a 2 x 2 grid (larger), more in 3 x 3.
        items.length <= 4
          ? 'grid-cols-2 gap-[0.3125rem] p-[0.5625rem]'
          : 'grid-cols-3 gap-[0.1875rem] p-[0.4375rem]',
        PLATE[tone],
        className,
      )}
      style={{ mask: SQUIRCLE_MASK, WebkitMask: SQUIRCLE_MASK }}
    >
      {items.slice(0, 9).map((t) => (
        <span key={t.key} className="aspect-square">
          <MiniappIcon {...iconLookOf(t)} size="fill" />
        </span>
      ))}
    </span>
  );
}
