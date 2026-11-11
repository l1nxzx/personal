import { Check, Flame, Moon, Sun } from 'lucide-react';
import { cn, useAppData, useMiniapp, useNow } from '@miniapp/sdk';
import { Molar } from './Molar';
import { moodOf, setSlot, stats, todayKey, type BrushData } from './logic';

/** Home widget: Molar, today's two brushes (tap to log), the streak. */
export default function TeethWidget() {
  const { data, update, isLoading } = useAppData<BrushData>();
  const { open } = useMiniapp();
  const now = useNow();
  if (isLoading) return <div className="h-14" />;
  const s = stats(data, now);
  const { mood, line } = moodOf(s, now);
  const today = todayKey(now);

  return (
    <div className="flex items-center gap-3">
      <button type="button" onClick={open} aria-label="Open Brush" className="shrink-0">
        <Molar mood={mood} className="h-14 w-14" />
      </button>
      <div className="min-w-0 flex-1">
        <p className="line-clamp-2 text-sm text-ink" data-testid="molar-line">
          {line}
        </p>
        <div className="mt-2 flex items-center gap-2">
          {(['m', 'e'] as const).map((slot) => {
            const done = !!s.today[slot];
            const Icon = done ? Check : slot === 'm' ? Sun : Moon;
            return (
              <button
                key={slot}
                type="button"
                disabled={done}
                onClick={() => update((d) => setSlot(d, today, slot, new Date().toISOString()))}
                aria-pressed={done}
                className={cn(
                  'inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs',
                  done
                    ? 'border-ok/50 bg-ok/10 text-ink'
                    : 'border-line-strong text-ink-muted active:bg-surface-2',
                )}
              >
                <Icon className={cn('h-3.5 w-3.5', done && 'text-ok')} strokeWidth={2.25} />
                {slot === 'm' ? 'Morning' : 'Evening'}
              </button>
            );
          })}
          {s.streak > 0 && (
            <span className="ml-auto inline-flex items-center gap-1 text-sm text-ink">
              <Flame className="h-4 w-4 text-warn" strokeWidth={2} aria-hidden />
              {s.streak}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
