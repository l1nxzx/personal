import { addDays, dayKey } from '@miniapp/sdk';

/** Brushing data, saved to the account. */
export interface BrushData {
  v: 1;
  /** Day (YYYY-MM-DD, days start at 03:00) → when each brush was logged (ISO time). */
  days: Record<string, { m?: string; e?: string }>;
}

export const INITIAL: BrushData = { v: 1, days: {} };

/** A day runs 03:00–03:00, so brushing just after midnight still counts as the evening. */
export const DAY_START = 3;
export type Slot = 'm' | 'e';

export const todayKey = (now: Date) => dayKey(now, DAY_START);
/** Hours since the day started (03:00 = 0). */
const hourOfDay = (now: Date) => ((now.getHours() - DAY_START + 24) % 24) + now.getMinutes() / 60;
/** Morning until 15:00, evening after. */
export const currentSlot = (now: Date): Slot => (hourOfDay(now) < 12 ? 'm' : 'e');

const complete = (d?: { m?: string; e?: string }) => !!d?.m && !!d?.e;

export function setSlot(data: BrushData, day: string, slot: Slot, at: string | null): BrushData {
  const prev = data.days[day] ?? {};
  const next = { ...prev };
  if (at) next[slot] = at;
  else delete next[slot];
  const days = { ...data.days };
  if (next.m || next.e) days[day] = next;
  else delete days[day];
  return { ...data, days };
}

/** Both devices' logs together (after being offline): a brush logged anywhere counts. */
export function merge(a: BrushData, b: BrushData): BrushData {
  const days: BrushData['days'] = { ...a.days };
  for (const [k, v] of Object.entries(b.days)) days[k] = { ...days[k], ...v };
  return { v: 1, days };
}

export interface Stats {
  today: { m?: string; e?: string };
  yesterday: { m?: string; e?: string };
  /** Full days (morning and evening) in a row, up to today if today is full, else up to yesterday. */
  streak: number;
  best: number;
  total: number;
  /** Days in a row, before today, with at least one brush missing (since the first log). */
  missedDays: number;
  firstDay: string | null;
}

export function stats(data: BrushData, now: Date): Stats {
  const t = todayKey(now);
  const keys = Object.keys(data.days).sort();
  const firstDay = keys[0] ?? null;
  let streak = 0;
  for (
    let d = complete(data.days[t]) ? t : addDays(t, -1);
    complete(data.days[d]);
    d = addDays(d, -1)
  )
    streak++;
  let best = 0;
  let run = 0;
  if (firstDay)
    for (let d = firstDay; d <= t; d = addDays(d, 1)) {
      run = complete(data.days[d]) ? run + 1 : 0;
      best = Math.max(best, run);
    }
  let missedDays = 0;
  if (firstDay)
    for (let d = addDays(t, -1); d >= firstDay && !complete(data.days[d]); d = addDays(d, -1))
      missedDays++;
  const total = Object.values(data.days).reduce((n, v) => n + (v.m ? 1 : 0) + (v.e ? 1 : 0), 0);
  return {
    today: data.days[t] ?? {},
    yesterday: data.days[addDays(t, -1)] ?? {},
    streak,
    best,
    total,
    missedDays,
    firstDay,
  };
}

export type Mood = 'hello' | 'happy' | 'content' | 'waiting' | 'annoyed' | 'angry' | 'furious';

const LINES: Record<Mood, string[]> = {
  hello: ["Hi, I'm Molar. Brush me twice a day and we'll get along fine."],
  happy: [
    'Two for two. Sparkling.',
    'Look at that shine. Proud of you.',
    'Morning and evening. This is how legends are made.',
  ],
  content: [
    'Good start. See you tonight.',
    "Morning done. Don't forget me later.",
    'Fresh. Now keep it up this evening.',
  ],
  waiting: [
    'Morning! Brush before you do anything else.',
    'Rise and brush.',
    "I'm waiting. Toothbrush. Now.",
  ],
  annoyed: [
    "It's getting late. You know what to do.",
    'Bed without brushing? Over my enamel.',
    'I can still taste dinner. Can you? Brush.',
  ],
  angry: [
    'You skipped yesterday. I noticed. I always notice.',
    "Yesterday you forgot me. Today you won't.",
    'One missed brush becomes two. Brush now.',
  ],
  furious: [
    'Days without a full brush. Your enamel is filing a complaint.',
    "I've seen cavities with more discipline.",
    'This is an intervention. Toothbrush. NOW.',
  ],
};

/** How Molar feels, and what it says. The line changes each day, not each look. */
export function moodOf(s: Stats, now: Date): { mood: Mood; line: string } {
  const h = hourOfDay(now); // 0 = 03:00
  let mood: Mood;
  if (!s.firstDay) mood = 'hello';
  else if (s.today.m && s.today.e) mood = 'happy';
  else if (s.missedDays >= 2) mood = 'furious';
  else if (s.missedDays === 1) mood = 'angry';
  else if (s.today.m)
    mood = h >= 18 ? 'annoyed' : 'content'; // after 21:00, no evening yet
  else mood = h >= 8 ? 'annoyed' : 'waiting'; // after 11:00, no morning yet
  const lines = LINES[mood];
  const seed = Number(todayKey(now).replaceAll('-', '')) % lines.length;
  return { mood, line: lines[seed]! };
}
