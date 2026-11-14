import { ArrowUpLeft } from 'lucide-react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { cn } from '../../lib/cn';
import type { Badge } from './badges';
import { iconLookOf } from './iconLooks';
import type { IconTile } from './layout';
import { BadgeDot, type Tone } from './tiles';
import { MiniappIcon } from './MiniappIcon';

/** Folder panels on the wallpaper: frosted, a little lighter or darker than what's behind. */
const PANEL: Record<Tone, string> = {
  light: 'bg-white/[0.16] ring-white/10',
  dark: 'bg-white/55 ring-black/5',
  theme: 'bg-surface/80 ring-line/50',
};

/**
 * An open folder, over a blurred screen, grown from the folder's icon: its name (tap to
 * rename), its icons (tap to open). "Edit", or holding an icon, shows a button on each icon to
 * take it out of the folder.
 */
export function FolderView({
  name,
  items,
  origin,
  tone,
  ink,
  badges,
  editing: startEditing,
  onClose,
  onRename,
  onTakeOut,
  onOpen,
}: {
  name: string;
  items: IconTile[];
  /** The folder icon's box, for the opening animation. */
  origin: DOMRect | null;
  tone: Tone;
  ink: string;
  badges: Record<string, Badge>;
  editing: boolean;
  onClose: () => void;
  onRename: (name: string) => void;
  onTakeOut: (key: string) => void;
  onOpen: (tile: IconTile, iconEl: HTMLElement | null) => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const [editing, setEditing] = useState(startEditing);
  const [title, setTitle] = useState(name);
  const hold = useRef<number>();
  useEffect(() => setTitle(name), [name]);

  useLayoutEffect(() => {
    const el = panel.current;
    if (!el || !origin || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const r = el.getBoundingClientRect();
    const dx = origin.left + origin.width / 2 - (r.left + r.width / 2);
    const dy = origin.top + origin.height / 2 - (r.top + r.height / 2);
    el.animate(
      [
        { transform: `translate(${dx}px, ${dy}px) scale(${origin.width / r.width})`, opacity: 0.4 },
        { transform: 'none', opacity: 1 },
      ],
      { duration: 280, easing: 'cubic-bezier(0.2, 0.85, 0.25, 1)' },
    );
    // Only on opening.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const commitTitle = () => {
    const t = title.trim() || 'Folder';
    setTitle(t);
    if (t !== name) onRename(t);
  };

  return createPortal(
    <div
      className="fixed inset-0 z-40 bg-black/20 backdrop-blur-2xl backdrop-saturate-150"
      onClick={(e) => e.target === e.currentTarget && onClose()}
      role="dialog"
      aria-modal="true"
      aria-label={`${name} folder`}
    >
      <div className="mx-auto mt-[18vh] w-[min(100%-2rem,22rem)]">
        <div className="mb-4 flex items-center gap-2 px-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={commitTitle}
            onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
            maxLength={40}
            aria-label="Folder name"
            className={cn(
              'min-w-0 flex-1 bg-transparent font-serif text-[1.75rem] leading-tight outline-none',
              ink,
            )}
          />
          <button
            type="button"
            onClick={() => setEditing((v) => !v)}
            className={cn(
              'h-8 shrink-0 rounded-full px-3.5 text-sm font-medium',
              tone === 'dark' ? 'bg-black/10 text-[#1d222b]' : 'bg-white/15 text-white',
              tone === 'theme' && 'bg-surface-2 text-ink',
            )}
          >
            {editing ? 'Done' : 'Edit'}
          </button>
        </div>
        <div
          ref={panel}
          className={cn(
            'grid grid-cols-3 gap-x-2 gap-y-5 rounded-[2rem] px-3 py-6 ring-1 ring-inset backdrop-blur-2xl',
            PANEL[tone],
          )}
        >
          {items.map((t, i) => {
            const look = iconLookOf(t);
            return (
              <div key={t.key} className="relative">
                <button
                  type="button"
                  onClick={(e) => {
                    if (editing) return;
                    onOpen(t, e.currentTarget.querySelector<HTMLElement>('[data-icon]'));
                  }}
                  onPointerDown={() => {
                    hold.current = window.setTimeout(() => setEditing(true), 450);
                  }}
                  onPointerUp={() => window.clearTimeout(hold.current)}
                  onPointerLeave={() => window.clearTimeout(hold.current)}
                  onContextMenu={(e) => e.preventDefault()}
                  className="flex w-full select-none flex-col items-center gap-1.5 [-webkit-touch-callout:none]"
                >
                  <span
                    className={cn(
                      'relative inline-flex',
                      editing && cn('tile-jiggle', i % 2 && 'tile-jiggle-b'),
                    )}
                  >
                    <MiniappIcon {...look} />
                    {badges[t.key] !== undefined && <BadgeDot value={badges[t.key]!} />}
                  </span>
                  <span className={cn('max-w-full truncate px-1 text-[0.8125rem] leading-4', ink)}>
                    {look.name}
                  </span>
                </button>
                {editing && (
                  <button
                    type="button"
                    aria-label={`Take ${look.name} out of the folder`}
                    title="Take out of the folder"
                    onClick={() => onTakeOut(t.key)}
                    className="absolute left-[calc(50%-2.25rem)] top-[-0.25rem] z-10 flex h-6 w-6 items-center justify-center rounded-full bg-[#e6e8ec] text-[#1d222b] shadow-[0_1px_4px_rgb(0_0_0/0.35)] active:scale-90"
                  >
                    <ArrowUpLeft className="h-3.5 w-3.5" strokeWidth={2.75} />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>,
    document.body,
  );
}
