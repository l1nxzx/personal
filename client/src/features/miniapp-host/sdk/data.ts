import { useQuery, useQueryClient } from '@tanstack/react-query';
import type { QueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useSyncExternalStore } from 'react';
import type { MiniappData } from '../../../../../shared/types';
import { ApiError, apiFetch } from '../../../lib/apiFetch';
import { readJSON, removeKey, writeJSON } from '../../../lib/storage';
import { useMiniapp } from './context';
import type { MiniappDefinition } from './types';

/**
 * A miniapp's saved data, synced to the account. Changes show at once (optimistic), are saved
 * in the background, survive going offline (kept on the device until saved), and never
 * overwrite a newer save from another device: the changes are re-applied on top of it.
 */
const keyOf = (id: string) => ['miniapps', 'data', id] as const;
const pendingKey = (id: string) => `miniapp:pending:${id}`;

type Updater = (prev: unknown) => unknown;

interface Engine {
  pending: Updater[];
  timer?: ReturnType<typeof setTimeout>;
  inFlight: boolean;
  saving: boolean;
  listeners: Set<() => void>;
  restored: boolean;
}
const engines = new Map<string, Engine>();
const engineOf = (id: string): Engine => {
  let e = engines.get(id);
  if (!e) {
    e = { pending: [], inFlight: false, saving: false, listeners: new Set(), restored: false };
    engines.set(id, e);
  }
  return e;
};
const setSaving = (e: Engine, v: boolean) => {
  e.saving = v;
  e.listeners.forEach((l) => l());
};

const applyAll = (base: unknown, fns: Updater[]) => fns.reduce((v, fn) => fn(v), base);

async function fetchData(def: MiniappDefinition): Promise<MiniappData> {
  const res = await apiFetch<MiniappData>(`/miniapps/apps/${def.id}/data`);
  const e = engineOf(def.id);
  // Changes not saved yet stay on top of whatever the server has now.
  if (e.pending.length) return { ...res, data: applyAll(res.data ?? def.initialData, e.pending) };
  return res;
}

function schedule(qc: QueryClient, def: MiniappDefinition, delay = 400) {
  const e = engineOf(def.id);
  clearTimeout(e.timer);
  e.timer = setTimeout(() => void flush(qc, def), delay);
}

async function flush(qc: QueryClient, def: MiniappDefinition): Promise<void> {
  const e = engineOf(def.id);
  if (e.inFlight || !e.pending.length) return;
  e.inFlight = true;
  setSaving(e, true);
  const key = keyOf(def.id);
  try {
    while (e.pending.length) {
      const sent = e.pending.length;
      const current = qc.getQueryData<MiniappData>(key) ?? { data: null, rev: 0, updatedAt: null };
      try {
        const res = await apiFetch<{ rev: number; updatedAt: string }>(
          `/miniapps/apps/${def.id}/data`,
          { method: 'PUT', body: { data: current.data, rev: current.rev } },
        );
        e.pending.splice(0, sent);
        qc.setQueryData<MiniappData>(key, (d) => ({
          data: d?.data ?? current.data,
          rev: res.rev,
          updatedAt: res.updatedAt,
        }));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 409)) {
          // Offline or server trouble: kept on the device, tried again soon.
          schedule(qc, def, 8000);
          return;
        }
        // Saved elsewhere meanwhile: start from that and re-apply this device's changes.
        const server = await apiFetch<MiniappData>(`/miniapps/apps/${def.id}/data`);
        qc.setQueryData<MiniappData>(key, {
          ...server,
          data: applyAll(server.data ?? def.initialData, e.pending),
        });
      }
    }
  } catch {
    schedule(qc, def, 8000);
  } finally {
    e.inFlight = false;
    if (e.pending.length) writeJSON(pendingKey(def.id), qc.getQueryData(key));
    else removeKey(pendingKey(def.id));
    setSaving(e, e.pending.length > 0);
  }
}

/**
 * After a reload: changes this device made but never saved come back from local storage and
 * are saved now (merged with newer data from another device, if the app knows how).
 */
function restorePending(qc: QueryClient, def: MiniappDefinition) {
  const e = engineOf(def.id);
  if (e.restored) return;
  e.restored = true;
  const local = readJSON<MiniappData>(pendingKey(def.id));
  if (!local) return;
  const server = qc.getQueryData<MiniappData>(keyOf(def.id));
  const mine = local.data;
  e.pending.push((serverData) =>
    def.merge && server && server.rev !== local.rev
      ? def.merge(serverData ?? def.initialData, mine)
      : mine,
  );
  qc.setQueryData<MiniappData>(keyOf(def.id), (d) => ({
    data: applyAll(d?.data ?? def.initialData, e.pending),
    rev: d?.rev ?? 0,
    updatedAt: d?.updatedAt ?? null,
  }));
  schedule(qc, def, 0);
}

/** The query an app's data lives in (the host reads it for badges). */
export const appDataQuery = (def: MiniappDefinition) => ({
  queryKey: keyOf(def.id),
  queryFn: () => fetchData(def),
  staleTime: 30_000,
});

export interface AppData<T> {
  /** The current data (the app's `initialData` until something is saved). */
  data: T;
  /** Change it: `update((d) => ({ ...d, count: d.count + 1 }))`. Saved automatically. */
  update: (fn: (prev: T) => T) => void;
  /** First load in progress (show a placeholder). */
  isLoading: boolean;
  /** Changes waiting to be saved (offline, say). */
  isSaving: boolean;
  error: unknown;
}

/** This miniapp's own data, synced to the account. */
export function useAppData<T>(): AppData<T> {
  const { definition } = useMiniapp();
  const def = definition as MiniappDefinition<T> & MiniappDefinition;
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: keyOf(def.id),
    queryFn: () => fetchData(def),
    // Shown at once from the cache, then checked with the server each time the app opens, so a
    // change made on another device shows up.
    staleTime: 0,
  });
  useEffect(() => {
    if (q.isSuccess) restorePending(qc, def);
  }, [q.isSuccess, qc, def]);
  useEffect(() => {
    const retry = () => schedule(qc, def, 0);
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [qc, def]);

  const e = engineOf(def.id);
  const isSaving = useSyncExternalStore(
    useCallback(
      (cb: () => void) => {
        e.listeners.add(cb);
        return () => void e.listeners.delete(cb);
      },
      [e],
    ),
    () => e.saving,
  );

  const update = useCallback(
    (fn: (prev: T) => T) => {
      const eng = engineOf(def.id);
      const updater = fn as Updater;
      eng.pending.push(updater);
      qc.setQueryData<MiniappData>(keyOf(def.id), (d) => ({
        data: updater(d?.data ?? def.initialData),
        rev: d?.rev ?? 0,
        updatedAt: d?.updatedAt ?? null,
      }));
      writeJSON(pendingKey(def.id), qc.getQueryData(keyOf(def.id)));
      setSaving(eng, true);
      schedule(qc, def);
    },
    [qc, def],
  );

  return {
    data: (q.data?.data ?? def.initialData) as T,
    update,
    isLoading: q.isLoading,
    isSaving,
    error: q.error,
  };
}
