import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import { defaultShouldDehydrateQuery } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';
import { del, get, set } from 'idb-keyval';
import { readJSON } from './storage';

/**
 * The query cache is kept in IndexedDB, so a launch shows the last data at once and refreshes it
 * in the background. It belongs to the signed-in owner only: it is dropped on sign-out and is
 * never restored on a device that isn't signed in.
 */
const STORAGE_KEY = 'query-cache';
export const PERSIST_MAX_AGE = 7 * 24 * 60 * 60_000;
/** Set by AuthContext while this device has a session (the tokens are httpOnly cookies). */
export const SIGNED_IN_HINT = 'auth:signed-in';

const idb = {
  getItem: async (key: string) => (await get<string>(key)) ?? null,
  setItem: (key: string, value: string) => set(key, value),
  removeItem: (key: string) => del(key),
};

const persister = createAsyncStoragePersister({
  storage: idb,
  key: STORAGE_KEY,
  throttleTime: 1000,
});

/**
 * Never stored: the vault, an entry open in the editor
 * (the editor must start from the server's latest text), old versions, and search or status
 * lookups.
 */
const SKIP_ROOT = new Set(['vault', 'entry', 'version']);
const SKIP_ANY = new Set(['search', 'status']);
function shouldPersist(query: Query): boolean {
  if (!defaultShouldDehydrateQuery(query)) return false;
  const [root, ...rest] = query.queryKey;
  if (typeof root === 'string' && (SKIP_ROOT.has(root) || SKIP_ANY.has(root))) return false;
  // Signed out: nothing to keep.
  if (root === 'me' && !query.state.data) return false;
  return !rest.some((part) => typeof part === 'string' && SKIP_ANY.has(part));
}

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: {
    persistClient: (client) => persister.persistClient(client),
    removeClient: () => persister.removeClient(),
    async restoreClient() {
      if (readJSON<boolean>(SIGNED_IN_HINT) !== true) {
        await persister.removeClient();
        return undefined;
      }
      return persister.restoreClient();
    },
  },
  maxAge: PERSIST_MAX_AGE,
  // A new deploy may change what the API returns; start from a clean cache.
  buster: __BUILD_ID__,
  dehydrateOptions: { shouldDehydrateQuery: shouldPersist },
};

/** Remove the stored cache (sign-out, or the session turned out to be gone). */
export function clearPersistedQueries(): Promise<void> {
  return del(STORAGE_KEY).catch(() => {});
}
