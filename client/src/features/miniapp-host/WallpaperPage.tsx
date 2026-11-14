import { Check, ImagePlus } from 'lucide-react';
import { useRef } from 'react';
import { ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { useMiniappState, useSetWallpaper } from './api';
import { WALLPAPER_ICON } from './builtins';
import { MiniappFrame } from './Frame';
import { MiniappIcon } from './MiniappIcon';
import { usePictureTone } from './pictureTone';
import { WALLPAPERS, wallpaperStyle } from './wallpapers';

/** The miniapps screen's background: the site's colours, a quiet solid, or a picture. */
export default function WallpaperPage() {
  const state = useMiniappState();
  const { template, upload } = useSetWallpaper();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const current = state.data?.settings.wallpaper;
  const tone = usePictureTone(current);
  const busy = template.isPending || upload.isPending;
  const onError = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });
  // An old or unknown template shows as Plain, which is what the screen falls back to.
  const currentId =
    current?.kind === 'image'
      ? 'picture'
      : (WALLPAPERS.find((w) => current?.kind === 'template' && w.id === current.id)?.id ??
        'plain');
  const swatch = 'relative block aspect-[9/16] w-full overflow-hidden rounded-md border';

  return (
    <MiniappFrame title="Wallpaper" icon={<MiniappIcon {...WALLPAPER_ICON} size="sm" />}>
      {state.isLoading ? (
        <Loading />
      ) : state.isError ? (
        <ErrorNote onRetry={() => void state.refetch()}>{errorMessage(state.error)}</ErrorNote>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          {WALLPAPERS.map((w) => {
            const on = currentId === w.id;
            return (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={w.name}
                  onClick={() => template.mutate(w.id, { onError })}
                  className={cn(swatch, on ? 'border-accent ring-1 ring-accent' : 'border-line')}
                  style={{ background: w.background }}
                >
                  {on && <Selected />}
                </button>
                <p className="mt-1.5 text-center text-2xs text-ink-muted">
                  {w.name}
                  {w.id === 'plain' && <span className="text-ink-faint"> (site)</span>}
                </p>
              </li>
            );
          })}
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              aria-label="Your picture"
              className={cn(
                swatch,
                currentId === 'picture'
                  ? 'border-accent ring-1 ring-accent'
                  : 'border-dashed border-line-strong bg-surface',
              )}
              style={
                current?.kind === 'image'
                  ? { background: wallpaperStyle(current, tone).background }
                  : undefined
              }
            >
              {currentId !== 'picture' && (
                <ImagePlus className="absolute left-1/2 top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 text-ink-faint" />
              )}
              {currentId === 'picture' && <Selected />}
            </button>
            <p className="mt-1.5 text-center text-2xs text-ink-muted">
              {upload.isPending
                ? 'Uploading…'
                : currentId === 'picture'
                  ? 'Change picture'
                  : 'Your picture'}
            </p>
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (f)
                  upload.mutate(f, {
                    onSuccess: () => toast({ message: 'Wallpaper set' }),
                    onError,
                  });
              }}
            />
          </li>
        </ul>
      )}
    </MiniappFrame>
  );
}

function Selected() {
  return (
    <span className="absolute bottom-1.5 right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-accent-strong text-accent-ink">
      <Check className="h-3 w-3" strokeWidth={2.75} />
    </span>
  );
}
