import { Check, Image, Upload } from 'lucide-react';
import { useRef } from 'react';
import { ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { useMiniappState, useSetWallpaper } from './api';
import { MiniappFrame } from './Frame';
import { MiniappIcon } from './MiniappIcon';
import { WALLPAPERS, wallpaperStyle } from './wallpapers';

/** The miniapps screen's background: a template, or a picture of one's own. */
export default function WallpaperPage() {
  const state = useMiniappState();
  const { template, upload } = useSetWallpaper();
  const toast = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const current = state.data?.settings.wallpaper;
  const busy = template.isPending || upload.isPending;
  const onError = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });

  const icon = (
    <MiniappIcon
      glyph={Image}
      background="linear-gradient(160deg, #b08ad6 0%, #6c4f99 100%)"
      size="sm"
    />
  );
  const swatch = 'relative block aspect-[9/16] w-full overflow-hidden rounded-lg border';

  return (
    <MiniappFrame title="Wallpaper" icon={icon}>
      {state.isLoading ? (
        <Loading />
      ) : state.isError ? (
        <ErrorNote onRetry={() => void state.refetch()}>{errorMessage(state.error)}</ErrorNote>
      ) : (
        <ul className="grid grid-cols-3 gap-3 sm:grid-cols-4">
          <li>
            <button
              type="button"
              disabled={busy}
              onClick={() => fileRef.current?.click()}
              className={cn(
                swatch,
                current?.kind === 'image'
                  ? 'border-accent ring-2 ring-accent'
                  : 'border-dashed border-line-strong',
              )}
              style={
                current?.kind === 'image'
                  ? { background: wallpaperStyle(current).background }
                  : undefined
              }
            >
              <span className="absolute inset-0 flex flex-col items-center justify-center gap-1.5 text-sm text-ink-muted">
                {current?.kind !== 'image' && <Upload className="h-5 w-5" />}
              </span>
              {current?.kind === 'image' && <Selected />}
            </button>
            <p className="mt-1.5 text-center text-2xs text-ink-muted">
              {upload.isPending ? 'Uploading…' : 'Your picture'}
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
          {WALLPAPERS.map((w) => {
            const on = current?.kind === 'template' && current.id === w.id;
            return (
              <li key={w.id}>
                <button
                  type="button"
                  disabled={busy}
                  aria-pressed={on}
                  aria-label={w.name}
                  onClick={() => template.mutate(w.id, { onError })}
                  className={cn(swatch, on ? 'border-accent ring-2 ring-accent' : 'border-line')}
                  style={{ background: w.background }}
                >
                  {on && <Selected />}
                </button>
                <p className="mt-1.5 text-center text-2xs text-ink-muted">{w.name}</p>
              </li>
            );
          })}
        </ul>
      )}
    </MiniappFrame>
  );
}

function Selected() {
  return (
    <span className="absolute bottom-2 right-2 flex h-6 w-6 items-center justify-center rounded-full bg-accent-strong text-accent-ink">
      <Check className="h-3.5 w-3.5" strokeWidth={2.5} />
    </span>
  );
}
