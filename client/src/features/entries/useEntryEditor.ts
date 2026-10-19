import { useQueryClient } from '@tanstack/react-query';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  CreateEntryRequest,
  EditConflictDetails,
  Entry,
  EntryKind,
} from '../../../../shared/types';
import { ApiError } from '../../lib/apiFetch';
import { keys } from '../../lib/keys';
import { readJSON, removeKey, writeJSON } from '../../lib/storage';
import { createEntry, patchEntry, useInvalidateEntryLists } from './api';

export interface Fields {
  title: string;
  body: string;
  date: string | null;
  tags: string[];
}

export type SaveStatus = 'new' | 'saved' | 'unsaved' | 'saving' | 'offline' | 'error' | 'conflict';

interface LocalDraft {
  fields: Fields;
  /** Server rev the draft was based on (0 for never-saved entries). */
  rev: number;
  at: number;
}

export type RestoreNotice =
  { type: 'restored' } | { type: 'older-draft'; draft: LocalDraft } | null;

const DEBOUNCE_MS = 900;
const MAX_WAIT_MS = 5000;
const RETRY_DELAYS = [3000, 8000, 20000, 45000];

const fieldsOf = (e: Entry): Fields => ({
  title: e.title,
  body: e.body,
  date: e.date,
  tags: e.tags,
});
const sameTags = (a: string[], b: string[]) =>
  a.length === b.length && a.every((t, i) => t === b[i]);
const equal = (a: Fields, b: Fields) =>
  a.title === b.title && a.body === b.body && a.date === b.date && sameTags(a.tags, b.tags);
const isBlank = (f: Fields) => !f.title.trim() && !f.body.trim() && f.tags.length === 0;
const draftKey = (kind: EntryKind, id: string | null) => `draft:${kind}:${id ?? 'new'}`;

/**
 * Owns the text of one entry while it is open:
 * - debounced autosave (and immediately when the tab is hidden or the editor closes)
 * - every keystroke also kept in localStorage, so a crash, reload or killed mobile tab loses nothing
 * - offline: keeps retrying with backoff and on reconnect
 * - optimistic concurrency via `rev`, surfacing edits made on another device as a conflict
 * - never-saved entries are created on the first non-empty save, so blank entries don't pile up
 */
export function useEntryEditor(
  kind: EntryKind,
  entry: Entry | null,
  opts: {
    newFields?: Fields;
    onCreated?: (entry: Entry) => void;
    /** Extra fields sent when a new entry is first created (e.g. a note's type and topic). */
    createExtra?: () => Partial<CreateEntryRequest>;
  },
) {
  const qc = useQueryClient();
  const invalidateLists = useInvalidateEntryLists();

  const idRef = useRef<string | null>(entry?.id ?? null);
  const revRef = useRef(entry?.rev ?? 0);
  const blankNew: Fields = opts.newFields ?? { title: '', body: '', date: null, tags: [] };
  // For a new entry the baseline is its starting text (e.g. a reflection prompt), so an
  // untouched new entry is never saved.
  const savedRef = useRef<Fields>(entry ? fieldsOf(entry) : blankNew);

  // Decide the initial text once: server version, or a newer local draft from this device.
  const [initial] = useState(() => {
    const local = readJSON<LocalDraft>(draftKey(kind, idRef.current));
    const server = entry ? fieldsOf(entry) : blankNew;
    if (!local || equal(local.fields, server) || isBlank(local.fields)) {
      return { fields: server, notice: null as RestoreNotice };
    }
    if (!entry || local.rev === entry.rev)
      return { fields: local.fields, notice: { type: 'restored' } as RestoreNotice };
    return { fields: server, notice: { type: 'older-draft', draft: local } as RestoreNotice };
  });

  const [fields, setFieldsState] = useState<Fields>(initial.fields);
  const fieldsRef = useRef(initial.fields);
  const [status, setStatusState] = useState<SaveStatus>(() =>
    !equal(initial.fields, savedRef.current) ? 'unsaved' : entry ? 'saved' : 'new',
  );
  const statusRef = useRef(status);
  const [notice, setNotice] = useState<RestoreNotice>(initial.notice);
  const [conflict, setConflict] = useState<Entry | null>(null);
  const [errorText, setErrorText] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<number | null>(entry ? Date.parse(entry.updatedAt) : null);

  const inFlight = useRef(false);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const draftTimer = useRef<ReturnType<typeof setTimeout>>();
  const dirtySince = useRef<number | null>(null);
  const retries = useRef(0);

  const setStatus = (s: SaveStatus) => {
    statusRef.current = s;
    setStatusState(s);
  };

  const writeDraftNow = useCallback(() => {
    clearTimeout(draftTimer.current);
    const f = fieldsRef.current;
    if (equal(f, savedRef.current)) removeKey(draftKey(kind, idRef.current));
    else
      writeJSON(draftKey(kind, idRef.current), {
        fields: f,
        rev: revRef.current,
        at: Date.now(),
      } satisfies LocalDraft);
  }, [kind]);

  const flush = useCallback(async (): Promise<void> => {
    clearTimeout(timer.current);
    if (inFlight.current || statusRef.current === 'conflict') return;

    const snapshot = fieldsRef.current;
    const saved = savedRef.current;
    if (equal(snapshot, saved)) {
      dirtySince.current = null;
      if (statusRef.current !== 'new') setStatus('saved');
      return;
    }
    if (!idRef.current && isBlank(snapshot)) return; // nothing worth creating yet

    inFlight.current = true;
    setStatus('saving');
    try {
      if (!idRef.current) {
        const created = await createEntry(kind, {
          ...opts.createExtra?.(),
          title: snapshot.title,
          body: snapshot.body,
          tags: snapshot.tags,
          ...(kind === 'journal' && snapshot.date ? { date: snapshot.date } : {}),
        });
        removeKey(draftKey(kind, null));
        idRef.current = created.id;
        revRef.current = created.rev;
        qc.setQueryData(keys.entry(kind, created.id), created);
        opts.onCreated?.(created);
      } else {
        const meta = await patchEntry(kind, idRef.current, {
          rev: revRef.current,
          ...(snapshot.title !== saved.title && { title: snapshot.title }),
          ...(snapshot.body !== saved.body && { body: snapshot.body }),
          ...(snapshot.date !== saved.date && snapshot.date && { date: snapshot.date }),
          ...(!sameTags(snapshot.tags, saved.tags) && { tags: snapshot.tags }),
        });
        revRef.current = meta.rev;
        qc.setQueryData(keys.entry(kind, meta.id), { ...meta, body: snapshot.body });
      }
      savedRef.current = snapshot;
      retries.current = 0;
      setErrorText(null);
      setSavedAt(Date.now());
      invalidateLists(kind);

      if (equal(fieldsRef.current, snapshot)) {
        dirtySince.current = null;
        setStatus('saved');
        removeKey(draftKey(kind, idRef.current));
      } else {
        setStatus('unsaved');
        writeDraftNow();
        timer.current = setTimeout(() => void flush(), 300);
      }
    } catch (err) {
      writeDraftNow();
      if (err instanceof ApiError && err.code === 'EDIT_CONFLICT') {
        setConflict((err.details as EditConflictDetails).current);
        setStatus('conflict');
      } else if (err instanceof ApiError && err.status === 404) {
        setErrorText('This entry was deleted somewhere else. Your text is still here.');
        setStatus('error');
      } else if (
        err instanceof ApiError &&
        err.status < 500 &&
        err.status !== 401 &&
        err.status !== 429
      ) {
        setErrorText(err.message);
        setStatus('error');
      } else {
        // Offline or server trouble: keep the text locally and keep trying.
        setStatus(err instanceof ApiError ? 'error' : 'offline');
        setErrorText(err instanceof ApiError ? 'The server had a problem. Retrying…' : null);
        const delay = RETRY_DELAYS[Math.min(retries.current++, RETRY_DELAYS.length - 1)]!;
        timer.current = setTimeout(() => void flush(), delay);
      }
    } finally {
      inFlight.current = false;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, qc, writeDraftNow]);

  const setFields = useCallback(
    (patch: Partial<Fields>) => {
      const next = { ...fieldsRef.current, ...patch };
      fieldsRef.current = next;
      setFieldsState(next);
      if (statusRef.current === 'conflict') return writeDraftNow();
      if (statusRef.current !== 'saving')
        setStatus(equal(next, savedRef.current) ? (idRef.current ? 'saved' : 'new') : 'unsaved');

      clearTimeout(draftTimer.current);
      draftTimer.current = setTimeout(writeDraftNow, 300);

      dirtySince.current ??= Date.now();
      clearTimeout(timer.current);
      const waited = Date.now() - dirtySince.current;
      timer.current = setTimeout(() => void flush(), waited > MAX_WAIT_MS ? 0 : DEBOUNCE_MS);
    },
    [flush, writeDraftNow],
  );

  // Save right away when the tab is hidden, the phone locks, or the connection returns.
  useEffect(() => {
    const onHide = () => {
      if (document.visibilityState === 'hidden') {
        writeDraftNow();
        void flush();
      }
    };
    const onOnline = () => {
      retries.current = 0;
      void flush();
    };
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      writeDraftNow();
      if (
        !equal(fieldsRef.current, savedRef.current) &&
        !(!idRef.current && isBlank(fieldsRef.current))
      ) {
        e.preventDefault();
      }
    };
    document.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', writeDraftNow);
    window.addEventListener('online', onOnline);
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => {
      document.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', writeDraftNow);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('beforeunload', onBeforeUnload);
    };
  }, [flush, writeDraftNow]);

  // Leaving the editor (navigating away): persist locally and save in the background.
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      writeDraftNow();
      void flush();
    },
    [flush, writeDraftNow],
  );

  // If a restored draft differs from the server, save it soon.
  useEffect(() => {
    if (statusRef.current === 'unsaved' && initial.notice?.type === 'restored') {
      timer.current = setTimeout(() => void flush(), DEBOUNCE_MS);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** A newer version arrived from another device while this editor is open. */
  const applyRemote = useCallback((remote: Entry) => {
    if (remote.id !== idRef.current || remote.rev <= revRef.current || inFlight.current) return;
    if (!equal(fieldsRef.current, savedRef.current)) return; // local edits: the next save reports a conflict
    const f = fieldsOf(remote);
    revRef.current = remote.rev;
    savedRef.current = f;
    fieldsRef.current = f;
    setFieldsState(f);
    setSavedAt(Date.parse(remote.updatedAt));
  }, []);

  const resolveConflict = useCallback(
    (choice: 'mine' | 'theirs') => {
      if (!conflict) return;
      revRef.current = conflict.rev;
      savedRef.current = fieldsOf(conflict);
      setConflict(null);
      if (choice === 'theirs') {
        fieldsRef.current = fieldsOf(conflict);
        setFieldsState(fieldsRef.current);
        removeKey(draftKey(kind, idRef.current));
        setStatus('saved');
      } else {
        setStatus('unsaved');
        void flush();
      }
    },
    [conflict, flush, kind],
  );

  const restoreOlderDraft = useCallback(() => {
    if (notice?.type !== 'older-draft') return;
    setNotice(null);
    setFields(notice.draft.fields);
  }, [notice, setFields]);

  /** Throws away the device's draft and shows the saved version (or a fresh entry). */
  const discardLocalDraft = useCallback(() => {
    setNotice(null);
    clearTimeout(timer.current);
    removeKey(draftKey(kind, idRef.current));
    if (!equal(fieldsRef.current, savedRef.current)) {
      fieldsRef.current = savedRef.current;
      setFieldsState(savedRef.current);
      setStatus(idRef.current ? 'saved' : 'new');
    }
  }, [kind]);

  /** For "saved as a new copy" after the entry was deleted elsewhere. */
  const saveAsNew = useCallback(() => {
    idRef.current = null;
    revRef.current = 0;
    savedRef.current = { title: '', body: '', date: null, tags: [] };
    setErrorText(null);
    setStatus('unsaved');
    void flush();
  }, [flush]);

  const retry = useCallback(() => {
    retries.current = 0;
    setStatus('unsaved');
    void flush();
  }, [flush]);

  /** Forgets local state before deleting the entry. */
  const forget = useCallback(() => {
    clearTimeout(timer.current);
    clearTimeout(draftTimer.current);
    savedRef.current = fieldsRef.current;
    removeKey(draftKey(kind, idRef.current));
  }, [kind]);

  return {
    id: idRef.current,
    fields,
    setFields,
    status,
    savedAt,
    errorText,
    conflict,
    notice,
    flush,
    retry,
    applyRemote,
    resolveConflict,
    restoreOlderDraft,
    discardLocalDraft,
    dismissNotice: () => setNotice(null),
    saveAsNew,
    forget,
  };
}
