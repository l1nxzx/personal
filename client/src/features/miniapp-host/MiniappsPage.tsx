import { Minus, Plus } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { Link } from 'react-router-dom';
import { PAGE_FRAME } from '../../components/shell/PageHeader';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { enabledApps, useMiniappState, useSetInstall, useSetLayout } from './api';
import { CLOCK_ICON, STORE_ICON, WALLPAPER_ICON } from './builtins';
import { ClockWidget } from './ClockWidget';
import { CLOCK_KEY, keysToSave, screenTiles, widgetKey, type Tile } from './layout';
import { MiniappIcon } from './MiniappIcon';
import { MiniappRuntime } from './Runtime';
import { useDragReorder } from './useDragReorder';
import { inkClass, wallpaperStyle } from './wallpapers';

type Tone = 'light' | 'dark' | 'theme';

/** Small rounded buttons that sit on the wallpaper (Edit, Done, Add widget). */
const PILL: Record<Tone, string> = {
  light: 'bg-white/15 text-white hover:bg-white/25 active:bg-white/30',
  dark: 'bg-black/[0.08] text-[#1d222b] hover:bg-black/[0.12] active:bg-black/15',
  theme: 'bg-surface-2/80 text-ink hover:bg-surface-2 active:bg-line',
};

/** Glass for widgets on the wallpaper: the site's surface, translucent and frosted. */
const GLASS =
  'rounded-[1.25rem] bg-surface/[0.86] shadow-[0_6px_20px_-6px_rgb(0_0_0/0.35)] ring-1 ring-inset ring-white/[0.08] backdrop-blur-xl backdrop-saturate-150';

/**
 * The miniapps screen, like a phone's home screen: app icons and widgets on a wallpaper. Hold a
 * tile (or press Edit) to arrange: tiles wobble, can be dragged anywhere, widgets can be added
 * and removed, apps taken off the screen. The arrangement is saved to the account.
 */
export default function MiniappsPage() {
  const state = useMiniappState();
  const toast = useToast();
  const setLayout = useSetLayout();
  const setInstall = useSetInstall();
  const [editing, setEditing] = useState(false);
  const [adding, setAdding] = useState(false);

  const apps = enabledApps(state.data);
  const tiles = screenTiles(state.data);
  const byKey = new Map(tiles.map((t) => [t.key, t]));
  const visible = tiles.map((t) => t.key);
  const saved = state.data?.settings.layout ?? null;

  const wallpaper = state.data?.settings.wallpaper;
  const wp = wallpaperStyle(wallpaper);
  const tone: Tone = wp.ink;
  const ink = inkClass(wp.ink, wallpaper?.kind === 'image');

  const onError = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });
  const save = (keys: string[], removed?: string[]) =>
    setLayout.mutate(keysToSave(saved, keys, removed), { onError });

  const drag = useDragReorder({
    keys: visible,
    editing,
    onStart: () => setEditing(true),
    onDrop: (keys) => save(keys),
  });

  useEffect(() => {
    if (!editing) return;
    const onKey = (e: globalThis.KeyboardEvent) => {
      if (e.key === 'Escape' && !adding) setEditing(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [editing, adding]);

  const removeWidget = (key: string) => {
    const before = saved ?? visible;
    save(
      visible.filter((k) => k !== key),
      [key],
    );
    toast({
      message: 'Widget removed',
      action: { label: 'Undo', onClick: () => setLayout.mutate(before, { onError }) },
    });
  };

  const removeApp = (tile: Extract<Tile, { kind: 'app' }>) => {
    const { id, name } = tile.app;
    setInstall.mutate(
      { id, patch: { enabled: false } },
      {
        onError,
        onSuccess: () =>
          toast({
            message: `${name} removed from the screen. Its data is kept.`,
            action: {
              label: 'Undo',
              onClick: () => setInstall.mutate({ id, patch: { enabled: true } }, { onError }),
            },
          }),
      },
    );
  };

  const addWidget = (key: string) => {
    save([key, ...visible]);
    setAdding(false);
    toast({ message: 'Widget added' });
  };

  const tileProps = (t: Tile, i: number) => ({
    tile: t,
    editing,
    ink,
    alt: i % 2 === 1,
    onNudge: (by: number) => drag.nudge(t.key, by),
  });

  const ghostTile = drag.ghost ? byKey.get(drag.ghost.key) : undefined;

  return (
    <>
      <div
        aria-hidden
        data-testid="miniapps-wallpaper"
        className="fixed inset-0 lg:left-[13.5rem]"
        style={{ background: wp.background }}
      />
      <div
        className={cn('relative min-h-dvh pb-28 lg:pb-16', PAGE_FRAME)}
        // Tapping the wallpaper itself ends arranging, as on a phone.
        onClick={(e) => {
          if (editing && (e.target as HTMLElement).dataset.backdrop) setEditing(false);
        }}
        data-backdrop="1"
      >
        <header className="pt-safe" data-backdrop="1">
          <div className="flex min-h-[3.5rem] items-center gap-2 pt-3 lg:pt-10" data-backdrop="1">
            <h1 className={cn('page-title mr-auto', ink)}>Miniapps</h1>
            {editing ? (
              <>
                <button
                  type="button"
                  onClick={() => setAdding(true)}
                  className={cn(
                    'inline-flex h-8 items-center gap-1 rounded-full pl-2.5 pr-3 text-sm font-medium backdrop-blur-md',
                    PILL[tone],
                  )}
                >
                  <Plus className="h-4 w-4" strokeWidth={2.25} /> Widget
                </button>
                <button
                  type="button"
                  onClick={() => setEditing(false)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full px-3.5 text-sm font-semibold backdrop-blur-md',
                    PILL[tone],
                  )}
                >
                  Done
                </button>
              </>
            ) : (
              state.isSuccess && (
                <button
                  type="button"
                  onClick={() => setEditing(true)}
                  className={cn(
                    'inline-flex h-8 items-center rounded-full px-3.5 text-sm backdrop-blur-md',
                    PILL[tone],
                  )}
                >
                  Edit
                </button>
              )
            )}
          </div>
        </header>

        <ul
          className="mt-6 grid grid-cols-4 gap-x-2 gap-y-5 sm:grid-cols-6 lg:grid-cols-8"
          data-backdrop="1"
          aria-label="Apps and widgets"
        >
          {drag.order.map((key, i) => {
            const t = byKey.get(key);
            if (!t) return null;
            const wide = t.kind === 'widget' || t.kind === 'clock';
            return (
              <li
                key={key}
                {...drag.bind(key)}
                data-tile={key}
                className={cn(
                  'relative select-none [-webkit-touch-callout:none]',
                  wide && 'col-span-4',
                  editing && 'touch-none',
                  drag.dragging === key && 'opacity-0',
                )}
              >
                <TileView {...tileProps(t, i)} />
                {editing && t.kind !== 'builtin' && (
                  <RemoveBadge
                    wide={wide}
                    label={
                      t.kind === 'app'
                        ? `Remove ${t.app.name} from the screen`
                        : `Remove the ${t.kind === 'clock' ? 'clock' : t.app.name} widget`
                    }
                    onRemove={() => (t.kind === 'app' ? removeApp(t) : removeWidget(t.key))}
                  />
                )}
              </li>
            );
          })}
        </ul>

        {state.isSuccess && apps.length === 0 && (
          <p className={cn('mt-10 text-sm opacity-80', ink)}>
            Nothing here yet. Get miniapps in the Store.
          </p>
        )}
      </div>

      {drag.ghost && ghostTile && (
        <div
          aria-hidden
          className="pointer-events-none fixed left-0 top-0 z-50"
          style={{
            width: drag.ghost.width,
            height: drag.ghost.height,
            transform: `translate(${drag.ghost.x}px, ${drag.ghost.y}px) scale(1.08)`,
          }}
        >
          <TileView tile={ghostTile} editing ink={ink} lifted onNudge={() => {}} />
        </div>
      )}

      <AddWidgetDialog
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={addWidget}
        available={[
          ...(byKey.has(CLOCK_KEY) ? [] : [CLOCK_KEY]),
          ...apps.filter((a) => a.Widget && !byKey.has(widgetKey(a.id))).map((a) => a.id),
        ]}
      />
    </>
  );
}

/** One tile's picture: an icon with its name, a widget card, or the clock. */
function TileView({
  tile,
  editing,
  ink,
  alt,
  lifted,
  onNudge,
}: {
  tile: Tile;
  editing: boolean;
  ink: string;
  alt?: boolean;
  /** Being dragged: no wobble, a deeper shadow. */
  lifted?: boolean;
  onNudge: (by: number) => void;
}) {
  const jiggle = editing && !lifted && cn('tile-jiggle', alt && 'tile-jiggle-b');
  const onKeyDown = (e: KeyboardEvent) => {
    if (!editing) return;
    const by = { ArrowLeft: -1, ArrowUp: -1, ArrowRight: 1, ArrowDown: 1 }[e.key];
    if (by) {
      e.preventDefault();
      onNudge(by);
    }
  };

  if (tile.kind === 'clock')
    return (
      <div
        tabIndex={editing ? 0 : -1}
        onKeyDown={onKeyDown}
        aria-label="Clock widget"
        className={cn('min-h-[6.5rem] rounded-[1.25rem]', jiggle)}
        style={{ ['--jiggle' as string]: '0.35deg' }}
      >
        <ClockWidget ink={ink} />
      </div>
    );

  if (tile.kind === 'widget') {
    const Widget = tile.app.Widget!;
    return (
      <div
        className={cn('flex flex-col items-center gap-1.5', jiggle)}
        style={{ ['--jiggle' as string]: '0.35deg' }}
      >
        <div
          className={cn(
            'relative flex min-h-[6.5rem] w-full items-center p-4',
            GLASS,
            lifted && 'shadow-[0_14px_34px_-8px_rgb(0_0_0/0.5)]',
          )}
        >
          <div className="w-full min-w-0">
            <MiniappRuntime definition={tile.app} place="widget">
              <Widget />
            </MiniappRuntime>
          </div>
          {/* While arranging, a widget is something to move, not to use. */}
          {editing && (
            <div
              tabIndex={0}
              onKeyDown={onKeyDown}
              aria-label={`${tile.app.name} widget`}
              className="absolute inset-0 z-10 rounded-[1.25rem]"
            />
          )}
        </div>
        <Link
          to={`/miniapps/${tile.app.id}`}
          draggable={false}
          tabIndex={editing ? -1 : 0}
          onClick={(e) => editing && e.preventDefault()}
          className={cn('max-w-full truncate px-1 text-[0.75rem] leading-4', ink)}
        >
          {tile.app.name}
        </Link>
      </div>
    );
  }

  const icon =
    tile.kind === 'app'
      ? { name: tile.app.name, to: `/miniapps/${tile.app.id}`, ...tile.app.icon }
      : tile.key === 'store'
        ? { name: 'Store', to: '/miniapps/store', ...STORE_ICON, color: undefined }
        : { name: 'Wallpaper', to: '/miniapps/wallpaper', ...WALLPAPER_ICON, color: undefined };
  return (
    <Link
      to={icon.to}
      draggable={false}
      onClick={(e) => editing && e.preventDefault()}
      onKeyDown={onKeyDown}
      aria-label={editing ? `${icon.name}, arrange with arrow keys` : undefined}
      className="group flex flex-col items-center gap-1.5 rounded-md py-1 outline-offset-2"
    >
      <span className={cn('inline-flex', jiggle)}>
        <MiniappIcon
          glyph={icon.glyph}
          background={icon.background}
          color={icon.color}
          lifted
          className={cn(
            'transition-transform duration-100',
            !editing && 'group-active:scale-[0.92]',
            lifted && '[filter:drop-shadow(0_10px_18px_rgb(0_0_0/0.4))]',
          )}
        />
      </span>
      <span
        className={cn(
          'max-w-full truncate px-1 text-[0.75rem] leading-4',
          ink,
          lifted && 'opacity-0',
        )}
      >
        {icon.name}
      </span>
    </Link>
  );
}

/** The small "minus" on a tile while arranging. */
function RemoveBadge({
  wide,
  label,
  onRemove,
}: {
  wide: boolean;
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onPointerDown={(e) => e.stopPropagation()}
      onClick={onRemove}
      className={cn(
        'absolute z-20 flex h-6 w-6 items-center justify-center rounded-full bg-[#e6e8ec] text-[#1d222b] shadow-[0_1px_4px_rgb(0_0_0/0.35)] active:scale-90',
        // Over the icon's top-left corner, or the widget's.
        wide ? '-left-1.5 -top-1.5' : 'left-[calc(50%-2.25rem)] top-0',
      )}
    >
      <Minus className="h-3.5 w-3.5" strokeWidth={3} />
    </button>
  );
}

/** "Add a widget": the clock and the widgets of apps on the screen that aren't shown yet. */
function AddWidgetDialog({
  open,
  onClose,
  onAdd,
  available,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (key: string) => void;
  /** CLOCK_KEY or app ids. */
  available: string[];
}) {
  const apps = enabledApps(useMiniappState().data);
  return (
    <Dialog open={open} onClose={onClose} title="Add a widget">
      <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
        {available.length === 0 && (
          <p className="text-sm text-ink-muted">
            Every widget is already on your screen.{' '}
            <Link to="/miniapps/store" onClick={onClose} className="text-accent hover:underline">
              Find more apps in the Store
            </Link>
            .
          </p>
        )}
        {available.map((k) => {
          const app = k === CLOCK_KEY ? null : apps.find((a) => a.id === k);
          if (k !== CLOCK_KEY && !app) return null;
          const Widget = app?.Widget;
          const name = app ? app.name : 'Clock';
          const ic = app ? app.icon : CLOCK_ICON;
          return (
            <section key={k}>
              <div className="flex items-center gap-3">
                <MiniappIcon glyph={ic.glyph} background={ic.background} size="sm" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-ink">{name}</p>
                  <p className="text-xs text-ink-faint">
                    {app ? 'Widget' : 'The time and date, large'}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onAdd(app ? widgetKey(app.id) : CLOCK_KEY)}
                  className="inline-flex h-8 items-center gap-1 rounded bg-accent-strong px-3 text-sm font-medium text-accent-ink hover:bg-accent-strong/85"
                >
                  <Plus className="h-4 w-4" strokeWidth={2.25} /> Add
                </button>
              </div>
              <div
                aria-hidden
                ref={(el) => el?.setAttribute('inert', '')}
                className="pointer-events-none mt-3 select-none rounded-lg border border-line bg-surface p-3"
              >
                {app && Widget ? (
                  <MiniappRuntime definition={app} place="widget">
                    <Widget />
                  </MiniappRuntime>
                ) : (
                  <ClockWidget ink="text-ink" />
                )}
              </div>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
