import { Check, Flame, Moon, Sun } from 'lucide-react';
import { addDays, cn, dateOf, SectionLabel, useAppData, useNow, useToast } from '@miniapp/sdk';
import { Molar } from './Molar';
import { currentSlot, moodOf, setSlot, stats, todayKey, type BrushData, type Slot } from './logic';

const SLOT = {
  m: { label: 'Morning', Icon: Sun },
  e: { label: 'Evening', Icon: Moon },
} as const;
const time = (iso: string) =>
  new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

export default function TeethApp() {
  const { data, update, isLoading } = useAppData<BrushData>();
  const now = useNow();
  const toast = useToast();
  const today = todayKey(now);
  const s = stats(data, now);
  const { mood, line } = moodOf(s, now);
  const slotNow = currentSlot(now);

  if (isLoading) return <div className="h-64" />;

  const log = (day: string, slot: Slot) => {
    update((d) => setSlot(d, day, slot, new Date().toISOString()));
    toast({
      message: `${SLOT[slot].label} brush logged`,
      action: { label: 'Undo', onClick: () => update((d) => setSlot(d, day, slot, null)) },
    });
  };
  const unlog = (day: string, slot: Slot) => update((d) => setSlot(d, day, slot, null));

  const yesterday = addDays(today, -1);
  const yesterdayMissing =
    s.firstDay && s.firstDay <= yesterday
      ? (['m', 'e'] as const).filter((k) => !s.yesterday[k])
      : [];

  return (
    <div className="space-y-8">
      {/* Molar and what it thinks */}
      <div className="flex items-center gap-4">
        <Molar mood={mood} className="h-28 w-28 shrink-0" />
        <div
          className={cn(
            'relative rounded-lg border px-4 py-3 text-[0.9375rem] leading-6',
            mood === 'angry' || mood === 'furious'
              ? 'border-bad/40 bg-bad/10 text-ink'
              : mood === 'happy'
                ? 'border-ok/40 bg-ok/10 text-ink'
                : 'border-line bg-surface text-ink',
          )}
          data-testid="molar-line"
        >
          {line}
        </div>
      </div>

      {/* Today */}
      <div className="grid grid-cols-2 gap-3">
        {(['m', 'e'] as const).map((slot) => {
          const done = s.today[slot];
          const { label, Icon } = SLOT[slot];
          return (
            <div key={slot}>
              <button
                type="button"
                onClick={() => (done ? undefined : log(today, slot))}
                aria-pressed={!!done}
                className={cn(
                  'flex h-28 w-full flex-col items-center justify-center gap-1.5 rounded-lg border-2 transition-colors',
                  done
                    ? 'border-[#3fb39a] bg-[#3fb39a]/15 text-ink'
                    : slot === slotNow
                      ? 'border-accent bg-surface text-ink active:bg-surface-2'
                      : 'border-line bg-surface text-ink-muted active:bg-surface-2',
                )}
              >
                {done ? (
                  <Check className="h-7 w-7 text-[#3fb39a]" strokeWidth={2.5} />
                ) : (
                  <Icon className="h-7 w-7" strokeWidth={1.75} />
                )}
                <span className="font-medium">{label}</span>
                <span className="text-2xs text-ink-faint">
                  {done ? `Brushed ${time(done)}` : 'Tap when brushed'}
                </span>
              </button>
              {done && (
                <button
                  type="button"
                  onClick={() => unlog(today, slot)}
                  className="mt-1 w-full text-center text-2xs text-ink-faint hover:text-ink"
                >
                  Undo
                </button>
              )}
            </div>
          );
        })}
      </div>

      {yesterdayMissing.length > 0 && (
        <p className="text-sm text-ink-muted">
          Forgot to log yesterday?{' '}
          {yesterdayMissing.map((slot, i) => (
            <span key={slot}>
              {i > 0 && ' · '}
              <button
                type="button"
                className="text-accent hover:underline"
                onClick={() => log(yesterday, slot)}
              >
                I brushed yesterday {SLOT[slot].label.toLowerCase()}
              </button>
            </span>
          ))}
        </p>
      )}

      {/* Numbers */}
      <div className="grid grid-cols-3 gap-3 text-center">
        <Number value={s.streak} label="day streak" flame={s.streak > 0} />
        <Number value={s.best} label="best streak" />
        <Number value={s.total} label="brushes" />
      </div>

      {/* Last two weeks */}
      <section>
        <SectionLabel>Last two weeks</SectionLabel>
        <History data={data} today={today} />
      </section>
    </div>
  );
}

function Number({ value, label, flame }: { value: number; label: string; flame?: boolean }) {
  return (
    <div className="rounded-lg border border-line bg-surface px-2 py-3">
      <div className="flex items-center justify-center gap-1 font-serif text-[1.75rem] leading-none text-ink">
        {flame && <Flame className="h-5 w-5 text-[#f0954a]" strokeWidth={2} aria-hidden />}
        {value}
      </div>
      <div className="mt-1 text-2xs text-ink-faint">{label}</div>
    </div>
  );
}

function History({ data, today }: { data: BrushData; today: string }) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  return (
    <div
      className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1"
      aria-label="Brushing, last two weeks"
    >
      {days.map((d) => {
        const v = data.days[d];
        const weekday = dateOf(d).toLocaleDateString([], { weekday: 'narrow' });
        return (
          <div key={d} className="flex flex-col items-center gap-1" title={d}>
            {(['m', 'e'] as const).map((slot) => (
              <span
                key={slot}
                className={cn(
                  'h-4 w-full max-w-[1.25rem] rounded-sm',
                  v?.[slot] ? 'bg-[#3fb39a]' : 'bg-ink/10',
                  d === today && 'ring-1 ring-accent',
                )}
              />
            ))}
            <span className={cn('text-[0.625rem]', d === today ? 'text-ink' : 'text-ink-faint')}>
              {weekday}
            </span>
          </div>
        );
      })}
    </div>
  );
}
