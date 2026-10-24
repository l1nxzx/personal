import { useEffect } from 'react';
import type { ActivityBeat } from '../../../../shared/types';
import { ApiError, apiFetch } from '../../lib/apiFetch';
import { toLocalDate } from '../../lib/dates';
import { keysWithPrefix, readJSON, removeKey, writeJSON } from '../../lib/storage';

/**
 * Active time: counts while a tab of the site is visible (`document.visibilityState`), whether
 * or not anyone types, clicks or scrolls — there is no idle timeout — and pauses as soon as the
 * tab is hidden (another tab, minimised, another app, screen off on phones).
 *
 * Counted time is kept as continuous stretches ("beats"), saved to localStorage every few
 * seconds and sent every minute and whenever the tab is hidden or closed. A beat that doesn't
 * get through (offline, signed out, browser closed mid-request or crashed) stays stored and is
 * sent on the next visit. Every beat has an id, so sending one twice is harmless, and the server
 * drops time already counted by another tab or device. Nothing about what is on the page or
 * typed is recorded: only how long, when, and the local date.
 */
const TICK_MS = 5_000;
const SEND_EVERY_MS = 60_000;
/** A longer pause between ticks means the computer slept or the tab was frozen: not counted. */
const MAX_TICK_GAP_MS = 20_000;
/** An unfinished beat untouched for this long belongs to a tab that is gone (closed, crashed). */
const ORPHAN_AFTER_MS = 60_000;
/** The server refuses beats older than a week. */
const KEEP_FOR_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_PER_REQUEST = 20;
const PREFIX = 'activity:';

interface StoredBeat {
  /** Whose time it is; another account signing in on this device never sends it. */
  uid: string;
  id: string;
  ms: number;
  /** When the stretch ended (this device's clock). */
  endedAt: number;
  /** Finished; anything after it starts a new beat. */
  sealed: boolean;
}

const newId = () =>
  typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;

const isBeat = (b: unknown): b is StoredBeat =>
  !!b &&
  typeof (b as StoredBeat).id === 'string' &&
  typeof (b as StoredBeat).ms === 'number' &&
  typeof (b as StoredBeat).endedAt === 'number';

/** Starts counting for `uid`; returns a function that stops (and sends what was counted). */
export function startActivityTracking(uid: string): () => void {
  let current: StoredBeat | null = null;
  /** When visible time was last added up; null while hidden. */
  let lastTick: number | null = null;
  /** This tab's finished beats, also kept here in case localStorage is unavailable. */
  const mine = new Map<string, StoredBeat>();
  const inFlight = new Set<string>();

  const save = (b: StoredBeat) => writeJSON(PREFIX + b.id, b);
  const forget = (id: string) => {
    mine.delete(id);
    removeKey(PREFIX + id);
  };

  function seal() {
    if (!current) return;
    current.sealed = true;
    if (current.ms >= 1000) {
      mine.set(current.id, current);
      save(current);
    } else {
      forget(current.id);
    }
    current = null;
  }

  /** Adds the time since the last tick to the current beat. */
  function account(now: number) {
    if (lastTick === null) return;
    const delta = now - lastTick;
    lastTick = now;
    if (delta <= 0) return;
    if (delta > MAX_TICK_GAP_MS) {
      seal(); // the gap isn't counted, and a beat must be one continuous stretch
      return;
    }
    current ??= { uid, id: newId(), ms: 0, endedAt: now, sealed: false };
    current.ms += delta;
    current.endedAt = now;
    save(current);
  }

  /** Finished beats of this account, from this tab and from tabs that are gone. */
  function due(now: number): StoredBeat[] {
    const found = new Map(mine);
    for (const key of keysWithPrefix(PREFIX)) {
      const b = readJSON<StoredBeat>(key);
      if (!isBeat(b) || now - b.endedAt > KEEP_FOR_MS || b.ms < 1000) {
        removeKey(key);
        continue;
      }
      if (b.uid !== uid || b.id === current?.id) continue;
      if (!b.sealed && now - b.endedAt < ORPHAN_AFTER_MS) continue; // another tab, still counting
      found.set(b.id, b);
    }
    return [...found.values()].filter((b) => !inFlight.has(b.id)).slice(0, MAX_PER_REQUEST);
  }

  async function send(keepalive = false) {
    const now = Date.now();
    const batch = due(now);
    if (!batch.length) return;
    batch.forEach((b) => inFlight.add(b.id));
    const beats: ActivityBeat[] = batch.map((b) => ({
      id: b.id,
      seconds: Math.min(120, Math.round(b.ms / 1000)),
      ago: Math.max(0, Math.round((now - b.endedAt) / 1000)),
      date: toLocalDate(new Date(b.endedAt)),
    }));
    try {
      // keepalive lets the request finish while the tab closes.
      await apiFetch('/me/activity', { method: 'POST', body: { beats }, keepalive });
      batch.forEach((b) => forget(b.id));
    } catch (err) {
      // A malformed batch would be refused forever; anything else is tried again later.
      if (err instanceof ApiError && err.status === 400) batch.forEach((b) => forget(b.id));
    } finally {
      batch.forEach((b) => inFlight.delete(b.id));
    }
  }

  function onTick() {
    if (document.visibilityState !== 'visible') return;
    const now = Date.now();
    if (lastTick === null) lastTick = now;
    else account(now);
    if (current && current.ms >= SEND_EVERY_MS) {
      seal();
      void send();
    }
  }

  function pause() {
    account(Date.now());
    lastTick = null;
    seal();
    void send(true);
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') {
      lastTick = Date.now();
      void send();
    } else {
      pause();
    }
  }

  if (document.visibilityState === 'visible') lastTick = Date.now();
  void send(); // anything left from earlier visits
  const timer = window.setInterval(onTick, TICK_MS);
  document.addEventListener('visibilitychange', onVisibilityChange);
  window.addEventListener('pagehide', pause);

  return () => {
    window.clearInterval(timer);
    document.removeEventListener('visibilitychange', onVisibilityChange);
    window.removeEventListener('pagehide', pause);
    pause();
  };
}

/** Counts active time for the signed-in user while the app shell is mounted. */
export function useActivityTracking(uid: string | undefined) {
  useEffect(() => (uid ? startActivityTracking(uid) : undefined), [uid]);
}
