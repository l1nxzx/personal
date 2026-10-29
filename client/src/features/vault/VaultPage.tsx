import { Lock, LockKeyhole, Search } from 'lucide-react';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Field, Input } from '../../components/ui/Field';
import { ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { passphraseHint, WrongPassphraseError } from '../../lib/vaultCrypto';
import { useVault, type DecryptedItem, type VaultContent } from './VaultContext';
import { AccountsTab, DocumentsTab, EmergencyTab, TextTab, VaultSearch } from './VaultSections';

export type VaultTab = 'entries' | 'documents' | 'accounts' | 'instructions' | 'emergency';

/** The Private Vault: end-to-end encrypted with its own passphrase. */
export default function VaultPage() {
  const vault = useVault();
  return (
    <Page width="narrow">
      <PageHeader
        title="Private Vault"
        actions={
          vault.status === 'unlocked' && (
            <Button onClick={vault.lock}>
              <Lock className="h-4 w-4" /> Lock
            </Button>
          )
        }
      />
      {vault.status === 'loading' ? (
        // Shaped like the locked view, by far the usual one.
        <Skeleton className="mt-6 max-w-sm">
          <SkeletonText className="text-sm" width="10rem" />
          <SkeletonText className="mt-5 text-sm" width="7.5rem" />
          <SkeletonBlock className="mt-1.5 h-10 w-full sm:h-9" />
        </Skeleton>
      ) : vault.status === 'error' ? (
        <ErrorNote onRetry={vault.retryLoad}>{errorMessage(vault.loadError)}</ErrorNote>
      ) : vault.status === 'none' ? (
        <Setup />
      ) : vault.status === 'locked' ? (
        <Unlock />
      ) : (
        <Unlocked />
      )}
    </Page>
  );
}

function Explainer() {
  return (
    <div className="mt-4 max-w-prose space-y-3 text-[0.9375rem] leading-7 text-ink-muted">
      <p>
        The vault is for things that deserve more protection than ordinary notes: sensitive entries,
        private documents, an inventory of important accounts, and instructions for someone you
        trust.
      </p>
      <p>
        Everything in it is <span className="text-ink">encrypted on this device</span> with a key
        that only your vault passphrase can open, before it is saved. The server stores unreadable
        data. It cannot read, search or recover it, and neither can anyone with access to it.
      </p>
      <p className="text-ink-faint">
        This is not a password manager: keep passwords and recovery codes in Bitwarden, and note
        here where they are.
      </p>
    </div>
  );
}

function Setup() {
  const vault = useVault();
  const [pass, setPass] = useState('');
  const [again, setAgain] = useState('');
  const [understood, setUnderstood] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const hint = passphraseHint(pass);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!hint.ok) return setError(hint.text);
    if (pass !== again) return setError('The two passphrases don’t match.');
    if (!understood)
      return setError('Please confirm you understand the passphrase can’t be recovered.');
    setBusy(true);
    try {
      await vault.setup(pass);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <>
      <Explainer />
      <form onSubmit={submit} className="mt-8 max-w-sm space-y-4">
        <Field
          label="Vault passphrase"
          hint={pass ? hint.text : 'Different from your account password.'}
        >
          {(id) => (
            <Input
              id={id}
              type="password"
              value={pass}
              onChange={(e) => setPass(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
        <Field label="Same passphrase again">
          {(id) => (
            <Input
              id={id}
              type="password"
              value={again}
              onChange={(e) => setAgain(e.target.value)}
              autoComplete="new-password"
            />
          )}
        </Field>
        <label className="flex items-start gap-3 border-l-2 border-warn bg-surface py-3 pl-4 pr-3 text-sm text-ink">
          <input
            type="checkbox"
            checked={understood}
            onChange={(e) => setUnderstood(e.target.checked)}
            className="mt-1 h-4 w-4 accent-[rgb(var(--accent-strong))]"
          />
          <span>
            I understand that if I lose this passphrase, what’s in the vault{' '}
            <strong>cannot be recovered</strong> by anyone, including me. I’ll keep it somewhere
            safe, for example in my password manager.
          </span>
        </label>
        {error && (
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
        )}
        <Button type="submit" variant="primary" busy={busy}>
          {busy ? 'Creating…' : 'Create the vault'}
        </Button>
      </form>
    </>
  );
}

function Unlock() {
  const vault = useVault();
  const [pass, setPass] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [forgot, setForgot] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await vault.unlock(pass);
      setPass('');
    } catch (err) {
      setError(err instanceof WrongPassphraseError ? err.message : errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const denied = !!error && !busy;
  return (
    <div className="mt-6 max-w-sm">
      {/* The vault door: bolted panel, combination dial, restricted marking. */}
      <div className="relative overflow-hidden rounded-lg border border-line-strong bg-surface px-5 pb-6 pt-5 shadow-[inset_0_1px_0_rgb(var(--ink)/0.04),0_18px_40px_-20px_rgb(0_0_0/0.7)]">
        {[
          'left-2.5 top-2.5',
          'right-2.5 top-2.5',
          'bottom-2.5 left-2.5',
          'bottom-2.5 right-2.5',
        ].map((pos) => (
          <span
            key={pos}
            aria-hidden
            className={cn(
              'absolute h-2 w-2 rounded-full border border-line-strong bg-surface-2',
              pos,
            )}
          />
        ))}
        <div className="flex items-center justify-between font-mono text-2xs uppercase tracking-[0.2em]">
          <span className={denied ? 'text-bad' : 'text-ink-faint'}>
            {denied ? 'Access denied' : 'Restricted'}
          </span>
          <span className="text-ink-faint">AES-256</span>
        </div>
        <VaultDial state={busy ? 'turning' : denied ? 'denied' : 'locked'} />
        <p className="text-center font-mono text-2xs uppercase tracking-[0.25em] text-ink-muted">
          Encrypted vault
        </p>
        <p className="mt-1 text-center text-[0.8125rem] text-ink-faint">
          Authorised access only. Nothing here can be read without the passphrase.
        </p>

        <form onSubmit={submit} className="mt-5 space-y-3">
          <Field label="Passphrase" error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                value={pass}
                onChange={(e) => {
                  setPass(e.target.value);
                  setError(null);
                }}
                autoComplete="current-password"
                autoFocus
                className="font-mono tracking-[0.2em]"
              />
            )}
          </Field>
          <Button type="submit" variant="primary" busy={busy} disabled={!pass} className="w-full">
            <LockKeyhole className="h-4 w-4" /> {busy ? 'Unlocking…' : 'Unlock'}
          </Button>
        </form>
      </div>
      <p className="mt-4 text-2xs text-ink-faint">
        Unlocking happens on this device. The passphrase is never sent anywhere.
      </p>
      <button
        type="button"
        onClick={() => setForgot((f) => !f)}
        className="mt-6 text-[0.8125rem] text-ink-faint hover:text-ink-muted"
      >
        Forgot the passphrase?
      </button>
      {forgot && <ResetVault />}
    </div>
  );
}

/** The combination dial on the vault door. Turns while unlocking; shakes on a wrong passphrase. */
function VaultDial({ state }: { state: 'locked' | 'turning' | 'denied' }) {
  const ticks = Array.from({ length: 60 }, (_, i) => i);
  return (
    <div aria-hidden className={cn('mx-auto my-5 h-40 w-40', state === 'denied' && 'vault-shake')}>
      <svg viewBox="0 0 160 160" className="h-full w-full">
        <circle
          cx="80"
          cy="80"
          r="76"
          fill="rgb(var(--bg))"
          stroke="rgb(var(--line-strong))"
          strokeWidth="2"
        />
        <circle cx="80" cy="80" r="68" fill="none" stroke="rgb(var(--line))" strokeWidth="1" />
        <g
          className={state === 'turning' ? 'vault-spin' : undefined}
          style={{ transformOrigin: '80px 80px' }}
        >
          {ticks.map((i) => (
            <line
              key={i}
              x1="80"
              y1={i % 5 === 0 ? 14 : 17}
              x2="80"
              y2="22"
              stroke={i % 5 === 0 ? 'rgb(var(--ink-muted))' : 'rgb(var(--ink-faint) / 0.6)'}
              strokeWidth={i % 5 === 0 ? 1.5 : 1}
              transform={`rotate(${i * 6} 80 80)`}
            />
          ))}
          <circle
            cx="80"
            cy="80"
            r="46"
            fill="rgb(var(--surface-2))"
            stroke="rgb(var(--line-strong))"
            strokeWidth="1.5"
          />
          {[0, 120, 240].map((a) => (
            <rect
              key={a}
              x="77"
              y="38"
              width="6"
              height="26"
              rx="3"
              fill="rgb(var(--raised))"
              stroke="rgb(var(--line-strong))"
              transform={`rotate(${a} 80 80)`}
            />
          ))}
          <circle
            cx="80"
            cy="80"
            r="16"
            fill="rgb(var(--raised))"
            stroke="rgb(var(--line-strong))"
            strokeWidth="1.5"
          />
        </g>
        <path
          d="M80 4 l-4 7 h8 z"
          fill={state === 'denied' ? 'rgb(var(--bad))' : 'rgb(var(--accent))'}
        />
        <circle
          cx="80"
          cy="80"
          r="4"
          fill={state === 'denied' ? 'rgb(var(--bad))' : 'rgb(var(--accent) / 0.8)'}
        />
      </svg>
    </div>
  );
}

function ResetVault() {
  const vault = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="mt-3 border-l-2 border-bad/60 pl-4 text-sm text-ink-muted">
      <p>
        Without the passphrase the vault can’t be opened. All you can do is delete everything in it
        and start again. Your account password is needed for that.
      </p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          const ok = await confirm({
            title: 'Delete everything in the vault?',
            message:
              'Every entry, document, account note and instruction in it is deleted for good.',
            confirmLabel: 'Delete the vault',
            danger: true,
          });
          if (!ok) return;
          try {
            await vault.reset(password);
            toast({ message: 'The vault was deleted. You can set up a new one.' });
          } catch (err) {
            setError(errorMessage(err));
          }
        }}
        className="mt-3 flex flex-wrap items-end gap-2"
      >
        <Field label="Account password" error={error}>
          {(id) => (
            <Input
              id={id}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
          )}
        </Field>
        <Button type="submit" variant="danger" disabled={!password}>
          Delete vault
        </Button>
      </form>
    </div>
  );
}

const TAB_OF: Record<VaultContent['kind'], VaultTab> = {
  entry: 'entries',
  document: 'documents',
  account: 'accounts',
  instructions: 'instructions',
  emergency: 'emergency',
};

const TABS: { value: VaultTab; label: string }[] = [
  { value: 'entries', label: 'Entries' },
  { value: 'documents', label: 'Documents' },
  { value: 'accounts', label: 'Accounts' },
  { value: 'instructions', label: 'Instructions' },
  { value: 'emergency', label: 'If something happens' },
];

function Unlocked() {
  const vault = useVault();
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as VaultTab | null) ?? 'entries';
  const [searching, setSearching] = useState(false);
  // The item picked in search, opened once (kept out of the URL so it doesn't reopen later).
  const [itemId, setItemId] = useState<string | null>(null);

  const openFromSearch = (item: DecryptedItem) => {
    setSearching(false);
    setItemId(item.id);
    setParams({ tab: TAB_OF[item.content.kind] }, { replace: true });
  };

  return (
    <div onPointerDown={vault.touch} onKeyDown={vault.touch}>
      <p className="mt-1 text-2xs text-ink-faint">
        Unlocked on this device. Locks after 10 minutes without activity.
      </p>
      <div className="mt-4 flex items-end gap-2">
        <nav
          className="scrollbar-none -mx-4 flex min-w-0 flex-1 gap-1 overflow-x-auto border-b border-line px-4 sm:mx-0 sm:px-0"
          aria-label="Vault sections"
        >
          {TABS.map((t) => (
            <Link
              key={t.value}
              to={`/vault?tab=${t.value}`}
              replace
              aria-current={tab === t.value && !searching ? 'page' : undefined}
              onClick={() => {
                setSearching(false);
                setItemId(null);
              }}
              className={cn(
                '-mb-px whitespace-nowrap border-b-2 px-2 py-2.5 text-sm first:pl-0 sm:py-2',
                tab === t.value && !searching
                  ? 'border-accent font-medium text-ink'
                  : 'border-transparent text-ink-muted hover:text-ink',
              )}
            >
              {t.label}
            </Link>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => setSearching((s) => !s)}
          aria-pressed={searching}
          aria-label="Search the vault"
          className={cn(
            'mb-1 flex h-10 w-10 shrink-0 items-center justify-center rounded sm:h-8 sm:w-8',
            searching ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:text-ink',
          )}
        >
          <Search className="h-4 w-4" />
        </button>
      </div>
      {searching ? (
        <VaultSearch onOpen={openFromSearch} />
      ) : tab === 'documents' ? (
        <DocumentsTab />
      ) : tab === 'accounts' ? (
        <AccountsTab initialId={itemId} key={itemId} />
      ) : tab === 'emergency' ? (
        <EmergencyTab />
      ) : (
        <TextTab
          kind={tab === 'instructions' ? 'instructions' : 'entry'}
          initialId={itemId}
          key={`${tab}:${itemId}`}
        />
      )}
      <VaultSettings />
    </div>
  );
}

function VaultSettings() {
  const vault = useVault();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [oldPass, setOldPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  return (
    <section className="mt-16 border-t border-line pt-6">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[0.8125rem] text-ink-faint hover:text-ink-muted"
      >
        {open ? 'Hide vault settings' : 'Vault settings'}
      </button>
      {open && (
        <form
          onSubmit={async (e) => {
            e.preventDefault();
            setError(null);
            const hint = passphraseHint(newPass);
            if (!hint.ok) return setError(hint.text);
            setBusy(true);
            try {
              await vault.changePassphrase(oldPass, newPass, password);
              setOldPass('');
              setNewPass('');
              setPassword('');
              toast({ message: 'Vault passphrase changed' });
            } catch (err) {
              setError(
                err instanceof WrongPassphraseError
                  ? 'The current vault passphrase is wrong.'
                  : errorMessage(err),
              );
            } finally {
              setBusy(false);
            }
          }}
          className="mt-4 max-w-sm space-y-4"
        >
          <h2 className="font-medium text-ink">Change the vault passphrase</h2>
          <Field label="Current vault passphrase">
            {(id) => (
              <Input
                id={id}
                type="password"
                value={oldPass}
                onChange={(e) => setOldPass(e.target.value)}
                autoComplete="current-password"
              />
            )}
          </Field>
          <Field
            label="New vault passphrase"
            hint={newPass ? passphraseHint(newPass).text : undefined}
          >
            {(id) => (
              <Input
                id={id}
                type="password"
                value={newPass}
                onChange={(e) => setNewPass(e.target.value)}
                autoComplete="new-password"
              />
            )}
          </Field>
          <Field label="Account password" error={error}>
            {(id) => (
              <Input
                id={id}
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
              />
            )}
          </Field>
          <Button type="submit" busy={busy} disabled={!oldPass || !newPass || !password}>
            Change passphrase
          </Button>
          <p className="text-2xs text-ink-faint">
            Nothing is re-encrypted: the vault key is simply locked with the new passphrase.
          </p>
        </form>
      )}
    </section>
  );
}
