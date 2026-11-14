import { Check, ChevronLeft, ChevronRight, Moon, Sun } from 'lucide-react';
import { useState } from 'react';
import { addDays, cn, dateOf, IconButton, SectionLabel } from '@miniapp/sdk';
import { pastTime, setSlot, tally, type BrushData, type Slot } from './logic';

const SLOTS = [
  { slot: 'm', label: 'Morning', Icon: Sun },
  { slot: 'e', label: 'Evening', Icon: Moon },
] as const;

const monthKey = (day: string) => day.slice(0, 7);
const longDay = (day: string) =>
  dateOf(day).toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' });

/**
 * The record: the last two weeks as a strip (as before), or, with "Show more", a calendar a
 * month at a time. Tapping a day opens it below, to log or remove a brush that was forgotten.
 */
export function History({
  data,
  today,
  firstDay,
  update,
}: {
  data: BrushData;
  today: string;
  firstDay: string | null;
  update: (fn: (d: BrushData) => BrushData) => void;
}) {
  const [more, setMore] = useState(false);
  const [month, setMonth] = useState(monthKey(today));
  const [picked, setPicked] = useState<string | null>(null);
  const pick = (d: string) => setPicked((p) => (p === d ? null : d));

  return (
    <section>
      <div className="flex items-center justify-between">
        <SectionLabel>{more ? 'History' : 'Last two weeks'}</SectionLabel>
        <button
          type="button"
          onClick={() => {
            setMore((v) => !v);
            setMonth(monthKey(picked ?? today));
          }}
          className="-mt-2 text-xs text-accent hover:underline"
        >
          {more ? 'Show less' : 'Show more'}
        </button>
      </div>

      {more ? (
        <Month
          data={data}
          month={month}
          today={today}
          firstDay={firstDay}
          picked={picked}
          onPick={pick}
          onMonth={setMonth}
        />
      ) : (
        <Strip data={data} today={today} picked={picked} onPick={pick} />
      )}

      {picked ? (
        <DayEditor day={picked} data={data} today={today} update={update} />
      ) : (
        <p className="mt-3 text-2xs text-ink-faint">Forgot one? Tap the day to add it.</p>
      )}
    </section>
  );
}

/** Two marks a day (morning above, evening below) for the last 14 days. */
function Strip({
  data,
  today,
  picked,
  onPick,
}: {
  data: BrushData;
  today: string;
  picked: string | null;
  onPick: (d: string) => void;
}) {
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  return (
    <div className="grid grid-cols-[repeat(14,minmax(0,1fr))] gap-1">
      {days.map((d) => {
        const v = data.days[d];
        const weekday = dateOf(d).toLocaleDateString([], { weekday: 'narrow' });
        return (
          <button
            key={d}
            type="button"
            onClick={() => onPick(d)}
            aria-label={longDay(d)}
            aria-pressed={picked === d}
            className={cn(
              'flex flex-col items-center gap-1 rounded py-1',
              picked === d ? 'bg-accent/15' : 'active:bg-surface-2',
            )}
          >
            {(['m', 'e'] as const).map((slot) => (
              <span
                key={slot}
                className={cn(
                  'h-4 w-full max-w-[1.25rem] rounded-sm',
                  v?.[slot] ? 'bg-ok/80' : 'bg-ink/10',
                  d === today && 'ring-1 ring-accent',
                )}
              />
            ))}
            <span className={cn('text-[0.625rem]', d === today ? 'text-ink' : 'text-ink-faint')}>
              {weekday}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** A month: each day shows its date and two small marks; how much of the month was brushed. */
function Month({
  data,
  month,
  today,
  firstDay,
  picked,
  onPick,
  onMonth,
}: {
  data: BrushData;
  month: string;
  today: string;
  firstDay: string | null;
  picked: string | null;
  onPick: (d: string) => void;
  onMonth: (m: string) => void;
}) {
  const first = `${month}-01`;
  const start = dateOf(first);
  const length = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
  const days = Array.from({ length }, (_, i) => addDays(first, i));
  // Weeks start on Monday.
  const lead = (start.getDay() + 6) % 7;
  const weekdays = Array.from({ length: 7 }, (_, i) =>
    dateOf(addDays('2024-01-01', i)).toLocaleDateString([], { weekday: 'narrow' }),
  );
  const shift = (n: number) => monthKey(addDays(first, n > 0 ? length : -1));
  const earliest = monthKey(firstDay ?? today);
  const { done, possible } = tally(data, days, today, firstDay);

  return (
    <div>
      <div className="mb-2 flex items-center gap-1">
        <IconButton
          label="Previous month"
          disabled={month <= earliest}
          onClick={() => onMonth(shift(-1))}
        >
          <ChevronLeft className="h-4 w-4" />
        </IconButton>
        <p className="flex-1 text-center font-serif text-[1.0625rem] text-ink">
          {start.toLocaleDateString([], { month: 'long', year: 'numeric' })}
        </p>
        <IconButton
          label="Next month"
          disabled={month >= monthKey(today)}
          onClick={() => onMonth(shift(1))}
        >
          <ChevronRight className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-1 text-center">
        {weekdays.map((w, i) => (
          <span key={i} className="pb-1 text-[0.625rem] text-ink-faint">
            {w}
          </span>
        ))}
        {Array.from({ length: lead }, (_, i) => (
          <span key={`lead${i}`} />
        ))}
        {days.map((d) => {
          const v = data.days[d];
          const future = d > today;
          const full = !!v?.m && !!v?.e;
          return (
            <button
              key={d}
              type="button"
              disabled={future}
              onClick={() => onPick(d)}
              aria-label={longDay(d)}
              aria-pressed={picked === d}
              className={cn(
                'flex aspect-square flex-col items-center justify-center gap-1 rounded-md border text-xs tabular-nums transition-colors',
                picked === d
                  ? 'border-accent bg-accent/10'
                  : full
                    ? 'border-ok/30 bg-ok/10'
                    : 'border-transparent active:bg-surface-2',
                d === today ? 'font-semibold text-accent' : 'text-ink',
                future && 'opacity-35',
              )}
            >
              {Number(d.slice(8))}
              <span className="flex gap-0.5">
                {(['m', 'e'] as const).map((slot) => (
                  <span
                    key={slot}
                    className={cn('h-1 w-2 rounded-full', v?.[slot] ? 'bg-ok' : 'bg-ink/15')}
                  />
                ))}
              </span>
            </button>
          );
        })}
      </div>
      {possible > 0 && (
        <p className="mt-2 text-center text-2xs text-ink-faint">
          {done} of {possible} brushes · {Math.round((done / possible) * 100)}%
        </p>
      )}
    </div>
  );
}

/** One day, opened from the record: add or remove its morning and evening brush. */
function DayEditor({
  day,
  data,
  today,
  update,
}: {
  day: string;
  data: BrushData;
  today: string;
  update: (fn: (d: BrushData) => BrushData) => void;
}) {
  const v = data.days[day] ?? {};
  const toggle = (slot: Slot) =>
    update((d) =>
      setSlot(
        d,
        day,
        slot,
        d.days[day]?.[slot] ? null : day === today ? new Date().toISOString() : pastTime(day, slot),
      ),
    );
  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 rounded-md border border-line bg-surface px-3 py-2.5">
      <p className="mr-auto text-sm text-ink">{day === today ? 'Today' : longDay(day)}</p>
      {SLOTS.map(({ slot, label, Icon }) => {
        const done = !!v[slot];
        return (
          <button
            key={slot}
            type="button"
            onClick={() => toggle(slot)}
            aria-pressed={done}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded border px-2.5 text-xs',
              done
                ? 'border-ok/50 bg-ok/10 text-ink'
                : 'border-line-strong text-ink-muted active:bg-surface-2',
            )}
          >
            {done ? (
              <Check className="h-3.5 w-3.5 text-ok" strokeWidth={2.25} />
            ) : (
              <Icon className="h-3.5 w-3.5" strokeWidth={2} />
            )}
            {label}
          </button>
        );
      })}
    </div>
  );
}
