import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock } from 'lucide-react';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type { FormEvent, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import type { SealedBox, SealedEntryContent, VaultMeta } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Field, Input } from '../../components/ui/Field';
import { useAuth } from '../../context/AuthContext';
import { apiFetch } from '../../lib/apiFetch';
import {
  deviceLabel,
  forgetPin,
  hasPin,
  isValidPin,
  OfflineError,
  PinGoneError,
  setUpPin,
  unlockWithPin,
  vaultKeyFrom,
  WrongPinError,
} from '../../lib/entryLockStore';
import { decryptJSON, encryptJSON, WrongPassphraseError } from '../../lib/vaultCrypto';
import { resealLegacyEntries } from './migrateEntries';

/**
 * Encrypted journal entries and writings. Their text is encrypted in the browser with the
 * entries key before it is sent, and decrypted here after it arrives; the server only ever holds
 * ciphertext (and the title). The entries key is opened with a PIN that the server checks
 * (`lib/entryLockStore.ts`, docs/DECISIONS.md 28) and kept in memory only, like the vault's: it
 * locks again after 10 minutes without activity, 5 minutes in the background, on reload and on
 * sign-out. Entries the vault key sealed (before the entries key existed) are re-sealed once
 * the passphrase is entered.
 */
export type EntryLockStatus = 'loading' | 'no-vault' | 'needs-pin' | 'locked' | 'unlocked';

interface EntryLockValue {
  status: EntryLockStatus;
  /**
   * Opens the PIN dialog if needed; resolves true once unlocked, false if cancelled.
   * `confirm`: ask for the PIN even if already unlocked (removing encryption, for instance).
   */
  requestUnlock: (opts: {
    /** The entry to open (its id, or 'new'): the PIN opens that one entry only. */
    scope: string;
    confirm?: boolean;
    upgrade?: boolean;
  }) => Promise<boolean>;
  /** Whether the PIN has opened this entry (id or 'new') since the last lock. */
  isOpen: (scope: string) => boolean;
  /** A new entry got its id: it stays open under it. */
  rescope: (from: string, to: string) => void;
  /** Entries still sealed with the vault key; opening them needs the passphrase once. */
  legacyLeft: number;
  /** Hides every locked entry at once; open editors still save, encrypted, in the background. */
  lock: () => void;
  /** Locked by hand ("Lock now"): screens don't pop up the PIN dialog by themselves. */
  lockedByHand: boolean;
  seal: (content: SealedEntryContent) => Promise<SealedBox>;
  open: (box: SealedBox) => Promise<SealedEntryContent>;
  /** An open locked editor registers its save here, so locking saves its text first. */
  registerFlush: (flush: () => Promise<void>) => () => void;
}

const EntryLockContext = createContext<EntryLockValue | null>(null);
const IDLE_LOCK_MS = 10 * 60 * 1000;
const HIDDEN_LOCK_MS = 5 * 60 * 1000;

export class LockedError extends Error {
  constructor() {
    super('Locked entries are locked. Enter your PIN.');
    this.name = 'LockedError';
  }
}

/** Sealed with the vault key, not yet re-sealed: needs the passphrase once. */
export class LegacyBoxError extends Error {
  constructor() {
    super('This entry still uses the old key. Enter the vault passphrase to finish the upgrade.');
    this.name = 'LegacyBoxError';
  }
}

type DialogMode = 'auto' | 'upgrade';

export function EntryLockProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const qc = useQueryClient();
  const meta = useQuery({
    queryKey: ['vault', 'meta', userId],
    queryFn: async () => (await apiFetch<{ meta: VaultMeta | null }>('/vault/meta')).meta,
    staleTime: Infinity,
    enabled: !!userId,
  });

  const keyRef = useRef<CryptoKey | null>(null);
  const keyIdRef = useRef<string | null>(null);
  /**
   * The entries the PIN has opened since the last lock. Each stays open (also after leaving it)
   * until the next lock; every other encrypted entry needs the PIN first, so a phone taken with
   * entries open gives access to those only.
   */
  const [openSet, setOpenSet] = useState<ReadonlySet<string>>(() => new Set());
  const openSetRef = useRef<ReadonlySet<string>>(new Set());
  const setOpen = (next: ReadonlySet<string>) => {
    openSetRef.current = next;
    setOpenSet(next);
  };
  const pendingScope = useRef<string | null>(null);
  /** The key while open editors finish saving after a lock; it can only encrypt, not open. */
  const closingKeyRef = useRef<CryptoKey | null>(null);
  const [lockedByHand, setLockedByHand] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const [pinSet, setPinSet] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [dialogMode, setDialogMode] = useState<DialogMode>('auto');
  /** Entries still sealed with the vault key after this unlock (the passphrase finishes them). */
  const [legacyLeft, setLegacyLeft] = useState(0);
  const waiters = useRef<((ok: boolean) => void)[]>([]);

  const vaultMeta = meta.data ?? null;
  useEffect(() => {
    setPinSet(null);
    if (!userId || !vaultMeta) return;
    let live = true;
    void hasPin(userId).then((v) => live && setPinSet(v));
    return () => {
      live = false;
    };
  }, [userId, vaultMeta]);

  const flushers = useRef(new Set<() => Promise<void>>());
  const registerFlush = useCallback((flush: () => Promise<void>) => {
    flushers.current.add(flush);
    return () => void flushers.current.delete(flush);
  }, []);

  // The text disappears at once. Open editors still save what was typed, encrypted, with a key
  // that is kept only for that (at most a few seconds) and can't open anything.
  const lockWith = useCallback((byHand: boolean) => {
    const key = keyRef.current;
    keyRef.current = null;
    openSetRef.current = new Set();
    setOpenSet(openSetRef.current);
    setUnlocked(false);
    setLegacyLeft(0);
    setLockedByHand(byHand);
    if (!key) return;
    closingKeyRef.current = key;
    const pending = [...flushers.current].map((f) => f().catch(() => {}));
    void Promise.race([Promise.all(pending), new Promise((r) => setTimeout(r, 5000))]).then(() => {
      if (closingKeyRef.current === key) closingKeyRef.current = null;
    });
  }, []);
  const lock = useCallback(() => lockWith(true), [lockWith]);
  const autoLock = useCallback(() => lockWith(false), [lockWith]);

  // Signing out locks, and forgets this device's PIN for the account that signed out.
  const lastUser = useRef<string | null>(null);
  useEffect(() => {
    if (lastUser.current && lastUser.current !== userId) void forgetPin(lastUser.current);
    lastUser.current = userId;
    autoLock();
  }, [userId, autoLock]);

  // Auto-lock: idle, or long in the background.
  const lastActive = useRef(Date.now());
  useEffect(() => {
    if (!unlocked) return;
    const touch = () => (lastActive.current = Date.now());
    let hiddenAt = 0;
    const onVis = () => {
      if (document.visibilityState === 'hidden') hiddenAt = Date.now();
      else if (hiddenAt && Date.now() - hiddenAt > HIDDEN_LOCK_MS) autoLock();
    };
    const t = setInterval(() => {
      if (Date.now() - lastActive.current > IDLE_LOCK_MS) autoLock();
    }, 30_000);
    touch();
    window.addEventListener('pointerdown', touch, { passive: true });
    window.addEventListener('keydown', touch);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [unlocked, autoLock]);

  const status: EntryLockStatus = !userId
    ? 'loading'
    : meta.isPending
      ? 'loading'
      : !vaultMeta
        ? 'no-vault'
        : unlocked
          ? 'unlocked'
          : pinSet === null
            ? 'loading'
            : pinSet
              ? 'locked'
              : 'needs-pin';

  const finish = useCallback((ok: boolean) => {
    setDialogOpen(false);
    const list = waiters.current;
    waiters.current = [];
    list.forEach((w) => w(ok));
  }, []);

  const requestUnlock = useCallback(
    (opts: { scope: string; confirm?: boolean; upgrade?: boolean }) => {
      if (keyRef.current && openSetRef.current.has(opts.scope) && !opts.confirm && !opts.upgrade)
        return Promise.resolve(true);
      pendingScope.current = opts.scope;
      setDialogMode(opts.upgrade ? 'upgrade' : 'auto');
      setDialogOpen(true);
      return new Promise<boolean>((resolve) => waiters.current.push(resolve));
    },
    [],
  );

  const isOpen = useCallback(
    (scope: string) => unlocked && openSet.has(scope),
    [unlocked, openSet],
  );
  const rescope = useCallback((from: string, to: string) => {
    if (!openSetRef.current.has(from)) return;
    const next = new Set(openSetRef.current);
    next.delete(from);
    next.add(to);
    setOpen(next);
  }, []);

  const accept = useCallback(
    (key: CryptoKey, keyId: string) => {
      keyRef.current = key;
      keyIdRef.current = keyId;
      if (pendingScope.current) setOpen(new Set([...openSetRef.current, pendingScope.current]));
      lastActive.current = Date.now();
      setLockedByHand(false);
      setUnlocked(true);
      setPinSet(true);
      finish(true);
    },
    [finish],
  );

  /** Entries the vault key sealed: re-sealed with the entries key, here, now. */
  const migrate = useCallback(
    async (vaultKey: CryptoKey, key: CryptoKey, keyId: string) => {
      if (await resealLegacyEntries(vaultKey, key, keyId)) {
        // Open entries and histories were read with the old boxes: read them again.
        await qc.invalidateQueries({ queryKey: ['entry'] });
        qc.removeQueries({ queryKey: ['version'] });
        void qc.invalidateQueries({ queryKey: ['versions'] });
      }
      setLegacyLeft(0);
    },
    [qc],
  );

  const value = useMemo<EntryLockValue>(
    () => ({
      status,
      requestUnlock,
      lock,
      lockedByHand,
      async seal(content) {
        const key = keyRef.current ?? closingKeyRef.current;
        if (!key || !keyIdRef.current) throw new LockedError();
        return { ...(await encryptJSON(key, content)), k: keyIdRef.current };
      },
      async open(box) {
        if (!keyRef.current) throw new LockedError();
        if (box.k !== keyIdRef.current) throw new LegacyBoxError();
        return decryptJSON<SealedEntryContent>(keyRef.current, box);
      },
      registerFlush,
      legacyLeft,
      isOpen,
      rescope,
    }),
    [status, requestUnlock, lock, lockedByHand, registerFlush, legacyLeft, isOpen, rescope],
  );

  return (
    <EntryLockContext.Provider value={value}>
      {children}
      <PinDialog
        open={dialogOpen}
        status={status}
        mode={dialogMode}
        onCancel={() => finish(false)}
        onPin={async (pin) => {
          if (!userId) return;
          try {
            const { key, keyId } = await unlockWithPin(userId, pin);
            accept(key, keyId);
            // Anything the vault key sealed (an unfinished upgrade, an old app version) waits
            // for the passphrase.
            void apiFetch<{ items: unknown[] }>('/entry-lock/legacy', { query: { keyId } })
              .then((r) => setLegacyLeft(r.items.length))
              .catch(() => {});
          } catch (err) {
            if (
              err instanceof PinGoneError ||
              (err instanceof WrongPinError && err.attemptsLeft <= 0)
            ) {
              // No PIN on this device any more, even while open: close everything.
              setPinSet(false);
              autoLock();
            }
            throw err;
          }
        }}
        onSetUp={async (passphrase, pin) => {
          if (!userId || !vaultMeta) return;
          const { key, keyId, vaultKey } = await setUpPin(
            userId,
            vaultMeta,
            passphrase,
            pin,
            deviceLabel(),
          );
          await migrate(vaultKey, key, keyId);
          accept(key, keyId);
        }}
        onUpgrade={async (passphrase) => {
          if (!vaultMeta || !keyRef.current || !keyIdRef.current) return;
          const vaultKey = await vaultKeyFrom(passphrase, vaultMeta);
          await migrate(vaultKey, keyRef.current, keyIdRef.current);
          finish(true);
        }}
      />
    </EntryLockContext.Provider>
  );
}

export function useEntryLock(): EntryLockValue {
  const ctx = useContext(EntryLockContext);
  if (!ctx) throw new Error('useEntryLock must be used inside EntryLockProvider');
  return ctx;
}

const pinInputProps = {
  type: 'password',
  inputMode: 'numeric',
  pattern: '[0-9]*',
  autoComplete: 'off',
  maxLength: 12,
  className: 'tracking-[0.4em]',
} as const;

/** One dialog for every way in: PIN, first-time setup on this device, or no vault yet. */
function PinDialog({
  open,
  status,
  mode,
  onCancel,
  onPin,
  onSetUp,
  onUpgrade,
}: {
  open: boolean;
  status: EntryLockStatus;
  mode: DialogMode;
  onCancel: () => void;
  onPin: (pin: string) => Promise<void>;
  onSetUp: (passphrase: string, pin: string) => Promise<void>;
  onUpgrade: (passphrase: string) => Promise<void>;
}) {
  const [usePassphrase, setUsePassphrase] = useState(false);
  const [pin, setPin] = useState('');
  const [pin2, setPin2] = useState('');
  const [passphrase, setPassphrase] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pinRef = useRef<HTMLInputElement>(null);
  const passRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    setPin('');
    setPin2('');
    setPassphrase('');
    setError(null);
    setUsePassphrase(false);
  }, [open]);

  const upgrade = mode === 'upgrade' && status === 'unlocked';
  const [pinGone, setPinGone] = useState(false);
  useEffect(() => {
    if (open) setPinGone(false);
  }, [open]);
  const setup = !upgrade && (status === 'needs-pin' || usePassphrase || pinGone);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setError(null);
    if (setup) {
      if (!isValidPin(pin)) return setError('Choose a PIN of 4 to 12 digits.');
      if (pin !== pin2) return setError('The two PINs are different.');
    } else if (!upgrade && !pin) return;
    setBusy(true);
    try {
      if (upgrade) await onUpgrade(passphrase);
      else if (setup) await onSetUp(passphrase, pin);
      else await onPin(pin);
    } catch (err) {
      if (err instanceof PinGoneError || (err instanceof WrongPinError && err.attemptsLeft <= 0))
        setPinGone(true);
      setError(
        err instanceof WrongPassphraseError ||
          err instanceof WrongPinError ||
          err instanceof PinGoneError ||
          err instanceof OfflineError
          ? err.message
          : 'Something went wrong. Try again.',
      );
      setPin('');
      if (!setup && !upgrade) pinRef.current?.focus();
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onClose={onCancel}
      title="Locked entries"
      initialFocus={setup || upgrade ? passRef : pinRef}
      className="sm:w-[26rem]"
    >
      <div className="overflow-y-auto p-4">
        {status === 'no-vault' ? (
          <>
            <p className="flex gap-2 text-sm text-ink-muted">
              <Lock className="mt-0.5 h-4 w-4 shrink-0 text-accent" strokeWidth={2} aria-hidden />
              Locked entries are encrypted with the key of your private vault. Set up the vault
              first; then you can choose a PIN for this device.
            </p>
            <div className="mt-5 flex justify-end gap-2">
              <Button variant="ghost" onClick={onCancel}>
                Cancel
              </Button>
              <Link
                to="/vault"
                onClick={onCancel}
                className="inline-flex h-10 items-center rounded bg-accent-strong px-4 text-sm font-medium text-accent-ink hover:bg-accent-strong/85 active:bg-accent-strong/75 sm:h-9"
              >
                Set up the vault
              </Link>
            </div>
          </>
        ) : status === 'loading' ? (
          <p className="text-sm text-ink-faint">Loading…</p>
        ) : (
          <form onSubmit={submit} className="space-y-4">
            {upgrade ? (
              <>
                <p className="text-sm text-ink-muted">
                  Some encrypted entries still use the old key. Enter your vault passphrase once to
                  re-encrypt them with the new one.
                </p>
                <Field label="Vault passphrase">
                  {(id) => (
                    <Input
                      ref={passRef}
                      id={id}
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      autoComplete="current-password"
                      autoFocus
                    />
                  )}
                </Field>
              </>
            ) : setup ? (
              <>
                <p className="text-sm text-ink-muted">
                  Enter your vault passphrase once on this device, then choose a PIN to open
                  encrypted entries here. The PIN works only on this device, and only with a
                  connection: the server checks it and allows five tries.
                </p>
                <Field label="Vault passphrase">
                  {(id) => (
                    <Input
                      ref={passRef}
                      id={id}
                      type="password"
                      value={passphrase}
                      onChange={(e) => setPassphrase(e.target.value)}
                      autoComplete="current-password"
                      autoFocus
                    />
                  )}
                </Field>
                <Field label="New PIN" hint="4 to 12 digits.">
                  {(id) => (
                    <Input
                      id={id}
                      {...pinInputProps}
                      value={pin}
                      onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    />
                  )}
                </Field>
                <Field label="PIN again">
                  {(id) => (
                    <Input
                      id={id}
                      {...pinInputProps}
                      value={pin2}
                      onChange={(e) => setPin2(e.target.value.replace(/\D/g, ''))}
                    />
                  )}
                </Field>
              </>
            ) : (
              <Field label="Enter your PIN">
                {(id) => (
                  <Input
                    ref={pinRef}
                    id={id}
                    {...pinInputProps}
                    value={pin}
                    onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))}
                    autoFocus
                  />
                )}
              </Field>
            )}
            {error && (
              <p className="text-sm text-bad" role="alert">
                {error}
              </p>
            )}
            <div className="flex flex-wrap items-center justify-between gap-2">
              {!setup && !upgrade ? (
                <button
                  type="button"
                  onClick={() => {
                    setUsePassphrase(true);
                    setError(null);
                    setPin('');
                  }}
                  className="text-sm text-ink-muted hover:text-ink"
                >
                  Forgot the PIN?
                </button>
              ) : (
                <span />
              )}
              <div className="flex gap-2">
                <Button variant="ghost" onClick={onCancel}>
                  Cancel
                </Button>
                <Button type="submit" variant="primary" busy={busy}>
                  {busy ? 'Opening…' : upgrade ? 'Finish' : setup ? 'Set PIN and unlock' : 'Unlock'}
                </Button>
              </div>
            </div>
          </form>
        )}
      </div>
    </Dialog>
  );
}
