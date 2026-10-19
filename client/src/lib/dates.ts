/** Dates in the owner's local time zone. `LocalDate` strings are `YYYY-MM-DD`. */

const pad = (n: number) => String(n).padStart(2, '0');

export function toLocalDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export const today = () => toLocalDate(new Date());

export function localTime(d = new Date()): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Parses a LocalDate as local midnight (not UTC). */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y!, m! - 1, d!);
}

export function addDays(s: string, days: number): string {
  const d = parseLocalDate(s);
  d.setDate(d.getDate() + days);
  return toLocalDate(d);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((parseLocalDate(to).getTime() - parseLocalDate(from).getTime()) / 86_400_000);
}

/** The coming Monday (or the Monday after, if today is Monday). */
export function nextWeek(from = today()): string {
  const day = parseLocalDate(from).getDay(); // 0 = Sunday
  return addDays(from, (8 - day) % 7 || 7);
}

const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(undefined, opts);
const fmtWeekdayLong = fmt({ weekday: 'long' });
const fmtDayMonth = fmt({ day: 'numeric', month: 'short' });
const fmtDayMonthYear = fmt({ day: 'numeric', month: 'short', year: 'numeric' });
const fmtFull = fmt({ weekday: 'long', day: 'numeric', month: 'long' });
const fmtFullYear = fmt({ weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
const fmtMonthYear = fmt({ month: 'long', year: 'numeric' });
const fmtShortWeekday = fmt({ weekday: 'short' });
const fmtTime = fmt({ hour: 'numeric', minute: '2-digit' });

/** "Sunday, 19 October" (adds the year when it isn't this year). */
export function formatLongDate(s: string): string {
  const d = parseLocalDate(s);
  return d.getFullYear() === new Date().getFullYear() ? fmtFull.format(d) : fmtFullYear.format(d);
}

export const formatMonthYear = (s: string) => fmtMonthYear.format(parseLocalDate(s));
export const weekdayShort = (s: string) => fmtShortWeekday.format(parseLocalDate(s));

/** Today / Tomorrow / Yesterday / Friday (within a week) / 24 Oct / 24 Oct 2025. */
export function formatRelativeDay(s: string, base = today()): string {
  const diff = daysBetween(base, s);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Tomorrow';
  if (diff === -1) return 'Yesterday';
  const d = parseLocalDate(s);
  if (diff > 1 && diff < 7) return fmtWeekdayLong.format(d);
  return d.getFullYear() === parseLocalDate(base).getFullYear()
    ? fmtDayMonth.format(d)
    : fmtDayMonthYear.format(d);
}

/** formatRelativeDay for use mid-sentence: "today", "yesterday", "Friday", "16 Oct". */
export function relativeDayInline(s: string, base = today()): string {
  const r = formatRelativeDay(s, base);
  return ['Today', 'Tomorrow', 'Yesterday'].includes(r) ? r.toLowerCase() : r;
}

/** For timestamps: "just now", "12 min ago", "3:40 pm", "Yesterday", "24 Oct". */
export function formatAgo(iso: string): string {
  const d = new Date(iso);
  const mins = Math.round((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const local = toLocalDate(d);
  if (local === today()) return fmtTime.format(d);
  return formatRelativeDay(local);
}

export function greeting(d = new Date()): string {
  const h = d.getHours();
  if (h < 5) return 'Good evening';
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}
