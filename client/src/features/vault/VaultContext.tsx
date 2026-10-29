import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { ReactNode } from 'react';
import type { VaultItem, VaultMeta } from '../../../../shared/types';
import { useAuth } from '../../context/AuthContext';
import { API_BASE, apiFetch } from '../../lib/apiFetch';
import {
  createVault,
  decryptBytes,
  decryptJSON,
  encryptBytes,
  encryptJSON,
  rewrapVault,
  unlockVault,
} from '../../lib/vaultCrypto';

/** What lives inside an encrypted vault item (never sent anywhere in this form). */
export type VaultContent =
  | { kind: 'entry'; title: string; body: string; date: string }
  | { kind: 'document'; name: string; mime: string; size: number; note: string }
  | {
      kind: 'account';
      service: string;
      url: string;
      email: string;
      username: string;
      twoFactor: string;
      recoveryLocation: string;
      notes: string;
    }
  | { kind: 'instructions'; title: string; body: string }
  | {
      kind: 'emergency';
      body: string;
      trustedPeople: string;
      passphraseAccess: string;
      otherCopies: string;
    };

export interface DecryptedItem {
  id: string;
  content: VaultContent;
  createdAt: string;
  updatedAt: string;
}

type Status = 'loading' | 'error' | 'none' | 'locked' | 'unlocked';

interface VaultValue {
  status: Status;
  /** Why the vault's status couldn't be loaded (status 'error'). */
  loadError: unknown;
  retryLoad: () => void;
  items: DecryptedItem[];
  setup: (passphrase: string) => Promise<void>;
  unlock: (passphrase: string) => Promise<void>;
  lock: () => void;
  save: (
    id: string | null,
    content: VaultContent,
    expectedUpdatedAt?: string,
  ) => Promise<DecryptedItem>;
  remove: (id: string) => Promise<void>;
  uploadFile: (file: File, note?: string) => Promise<DecryptedItem>;
  openFile: (item: DecryptedItem) => Promise<Blob>;
  changePassphrase: (oldPass: string, newPass: string, accountPassword: string) => Promise<void>;
  reset: (accountPassword: string) => Promise<void>;
  /** Restart the inactivity timer (called on user activity). */
  touch: () => void;
}

const VaultContext = createContext<VaultValue | null>(null);
const IDLE_LOCK_MS = 10 * 60 * 1000;
const HIDDEN_LOCK_MS = 5 * 60 * 1000;

/**
 * Holds the unwrapped vault key in memory only (never storage), and the decrypted items while
 * unlocked. Locks after 10 minutes without activity, after 5 minutes in a background tab, on
 * reload, and when signing out.
 */
export function VaultProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const { user } = useAuth();
  const meta = useQuery({
    queryKey: ['vault', 'meta', user?.id],
    queryFn: async () => (await apiFetch<{ meta: VaultMeta | null }>('/vault/meta')).meta,
    staleTime: Infinity,
    enabled: !!user,
  });
  const refetchMeta = meta.refetch;
  const keyRef = useRef<CryptoKey | null>(null);
  const [unlocked, setUnlocked] = useState(false);
  const [items, setItems] = useState<DecryptedItem[]>([]);
  const idleTimer = useRef<ReturnType<typeof setTimeout>>();

  const lock = useCallback(() => {
    keyRef.current = null;
    setItems([]);
    setUnlocked(false);
    clearTimeout(idleTimer.current);
  }, []);

  const touch = useCallback(() => {
    if (!keyRef.current) return;
    clearTimeout(idleTimer.current);
    idleTimer.current = setTimeout(lock, IDLE_LOCK_MS);
  }, [lock]);

  const decryptAll = useCallback(async (key: CryptoKey) => {
    const raw = (await apiFetch<{ items: VaultItem[] }>('/vault/items')).items;
    const out: DecryptedItem[] = [];
    for (const r of raw) {
      try {
        out.push({
          id: r.id,
          content: await decryptJSON<VaultContent>(key, r),
          createdAt: r.createdAt,
          updatedAt: r.updatedAt,
        });
      } catch {
        // An item that can't be decrypted is skipped (shown nowhere, never logged).
      }
    }
    setItems(out);
  }, []);

  const unlockWith = useCallback(
    async (key: CryptoKey) => {
      keyRef.current = key;
      await decryptAll(key);
      setUnlocked(true);
      touch();
    },
    [decryptAll, touch],
  );

  const value = useMemo<VaultValue>(() => {
    const requireKey = () => {
      if (!keyRef.current) throw new Error('The vault is locked');
      touch();
      return keyRef.current;
    };
    const save: VaultValue['save'] = async (id, content, expectedUpdatedAt) => {
      const key = requireKey();
      const body = {
        ...(await encryptJSON(key, content)),
        ...(expectedUpdatedAt && { expectedUpdatedAt }),
      };
      const { item } = id
        ? await apiFetch<{ item: VaultItem }>(`/vault/items/${id}`, { method: 'PUT', body })
        : await apiFetch<{ item: VaultItem }>('/vault/items', { method: 'POST', body });
      const next = { id: item.id, content, createdAt: item.createdAt, updatedAt: item.updatedAt };
      setItems((list) => [...list.filter((x) => x.id !== item.id), next]);
      return next;
    };
    const remove: VaultValue['remove'] = async (id) => {
      requireKey();
      await apiFetch(`/vault/items/${id}`, { method: 'DELETE' });
      setItems((list) => list.filter((x) => x.id !== id));
    };
    return {
      // A failed load is not "no vault": offering setup then would be wrong.
      status: meta.isLoading
        ? 'loading'
        : meta.isError && meta.data === undefined
          ? 'error'
          : !meta.data
            ? 'none'
            : unlocked
              ? 'unlocked'
              : 'locked',
      loadError: meta.error,
      retryLoad: () => void refetchMeta(),
      items,
      touch,
      lock,
      save,
      remove,
      async setup(passphrase) {
        const { meta: m, key } = await createVault(passphrase);
        await apiFetch('/vault/meta', { method: 'POST', body: m });
        await qc.invalidateQueries({ queryKey: ['vault', 'meta'] });
        await unlockWith(key);
      },
      async unlock(passphrase) {
        const m = meta.data ?? (await apiFetch<{ meta: VaultMeta | null }>('/vault/meta')).meta;
        if (!m) throw new Error('There is no vault yet');
        await unlockWith(await unlockVault(passphrase, m));
      },
      async uploadFile(file, note = '') {
        const key = requireKey();
        // Encrypt first; only then create the item, so a failure leaves nothing behind.
        const cipher = await encryptBytes(key, await file.arrayBuffer());
        const item = await save(null, {
          kind: 'document',
          name: file.name,
          mime: file.type || 'application/octet-stream',
          size: file.size,
          note,
        });
        try {
          await apiFetch(`/vault/files/${item.id}`, {
            method: 'PUT',
            body: new Blob([cipher], { type: 'application/octet-stream' }),
            headers: { 'Content-Type': 'application/octet-stream' },
          });
        } catch (err) {
          await remove(item.id).catch(() => undefined);
          throw err;
        }
        return item;
      },
      async openFile(item) {
        const key = requireKey();
        const res = await fetch(`${API_BASE}/vault/files/${item.id}`, { credentials: 'include' });
        if (!res.ok) throw new Error('This file could not be loaded');
        const plain = await decryptBytes(key, await res.arrayBuffer());
        return new Blob([plain], {
          type: item.content.kind === 'document' ? item.content.mime : 'application/octet-stream',
        });
      },
      async changePassphrase(oldPass, newPass, accountPassword) {
        if (!meta.data) throw new Error('There is no vault yet');
        const next = await rewrapVault(oldPass, newPass, meta.data);
        await apiFetch('/vault/meta', {
          method: 'PUT',
          body: { ...next, password: accountPassword },
        });
        await qc.invalidateQueries({ queryKey: ['vault', 'meta'] });
      },
      async reset(accountPassword) {
        await apiFetch('/vault/reset', { method: 'POST', body: { password: accountPassword } });
        lock();
        await qc.invalidateQueries({ queryKey: ['vault', 'meta'] });
      },
    };
  }, [
    meta.isLoading,
    meta.isError,
    meta.error,
    meta.data,
    refetchMeta,
    unlocked,
    items,
    touch,
    lock,
    qc,
    unlockWith,
  ]);

  // Signing out (or switching user) always locks.
  useEffect(() => {
    lock();
  }, [user?.id, lock]);

  // Lock after a while in the background.
  useEffect(() => {
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_LOCK_MS) lock();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => document.removeEventListener('visibilitychange', onVis);
  }, [lock]);

  // Changes from another device: refresh the decrypted list while unlocked.
  const metaUpdated = meta.dataUpdatedAt;
  useEffect(() => {
    const unsubscribe = qc.getQueryCache().subscribe((e) => {
      if (
        e.type === 'updated' &&
        e.query.queryKey[0] === 'vault' &&
        e.query.queryKey[1] === 'meta' &&
        keyRef.current
      ) {
        void decryptAll(keyRef.current);
      }
    });
    return unsubscribe;
  }, [qc, decryptAll, metaUpdated]);

  return <VaultContext.Provider value={value}>{children}</VaultContext.Provider>;
}

export function useVault(): VaultValue {
  const ctx = useContext(VaultContext);
  if (!ctx) throw new Error('useVault must be used inside VaultProvider');
  return ctx;
}
