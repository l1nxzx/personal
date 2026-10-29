import { ChevronLeft, Download, FileText, Plus, Trash2, Upload, X } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { controlClass, Field, Input } from '../../components/ui/Field';
import { Empty } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { ApiError, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, formatLongDate, today } from '../../lib/dates';
import { formatSize } from '../documents/api';
import { usePrefs } from '../me/api';
import { MarkdownEditor } from '../entries/MarkdownEditor';
import { useVault, type DecryptedItem, type VaultContent } from './VaultContext';

type TextKind = 'entry' | 'instructions';
type ContentOf<K extends VaultContent['kind']> = Extract<VaultContent, { kind: K }>;

const byNewest = (a: DecryptedItem, b: DecryptedItem) => b.updatedAt.localeCompare(a.updatedAt);

// ---------------------------------------------------------------- entries & instructions

/** Sensitive journal entries, or important instructions: a list, and a simple editor. */
export function TextTab({ kind, initialId }: { kind: TextKind; initialId?: string | null }) {
  const vault = useVault();
  const [open, setOpen] = useState<string | 'new' | null>(initialId ?? null);
  const items = vault.items.filter((i) => i.content.kind === kind).sort(byNewest);

  if (open) {
    const item = open === 'new' ? null : (vault.items.find((i) => i.id === open) ?? null);
    return <TextEditor kind={kind} item={item} onBack={() => setOpen(null)} />;
  }

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-ink-muted">
          {kind === 'entry'
            ? 'Journal entries that should stay private even if someone gets into your account.'
            : 'Important instructions and information you want to keep, encrypted.'}
        </p>
        <Button onClick={() => setOpen('new')}>
          <Plus className="h-4 w-4" /> New
        </Button>
      </div>
      {!items.length ? (
        <Empty>Nothing here yet.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
          {items.map((i) => {
            const c = i.content as ContentOf<'entry'> | ContentOf<'instructions'>;
            return (
              <li key={i.id}>
                <button
                  type="button"
                  onClick={() => setOpen(i.id)}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-3 text-left hover:bg-surface/70"
                >
                  <span className="block truncate font-serif text-[1.0625rem] text-ink">
                    {c.title || 'Untitled'}
                  </span>
                  <span className="mt-0.5 block truncate text-2xs text-ink-faint">
                    {c.kind === 'entry'
                      ? formatLongDate(c.date)
                      : `Edited ${formatAgo(i.updatedAt)}`}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/**
 * Vault editor. Saves (encrypted) a moment after you stop typing. Unsaved text is kept in memory
 * only, never in local storage, so nothing readable is left on the device.
 */
function TextEditor({
  kind,
  item,
  onBack,
}: {
  kind: TextKind;
  item: DecryptedItem | null;
  onBack: () => void;
}) {
  const vault = useVault();
  const confirm = useConfirm();
  const toast = useToast();
  const prefs = usePrefs();
  const initial = item?.content as ContentOf<'entry'> | ContentOf<'instructions'> | undefined;
  const [title, setTitle] = useState(initial?.title ?? '');
  const [body, setBody] = useState(initial?.body ?? '');
  const [date, setDate] = useState(initial?.kind === 'entry' ? initial.date : today());
  const [status, setStatus] = useState<'saved' | 'editing' | 'saving' | 'error' | 'conflict'>(
    'saved',
  );
  const ref = useRef({ id: item?.id ?? null, updatedAt: item?.updatedAt });
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ title, body, date });
  latest.current = { title, body, date };
  const dirty = useRef(false);

  const save = async () => {
    clearTimeout(timer.current);
    if (!dirty.current) return;
    const { title: t, body: b, date: d } = latest.current;
    if (!ref.current.id && !t.trim() && !b.trim()) return;
    dirty.current = false;
    setStatus('saving');
    try {
      const content: VaultContent =
        kind === 'entry' ? { kind, title: t, body: b, date: d } : { kind, title: t, body: b };
      const saved = await vault.save(ref.current.id, content, ref.current.updatedAt);
      ref.current = { id: saved.id, updatedAt: saved.updatedAt };
      setStatus(dirty.current ? 'editing' : 'saved');
    } catch (err) {
      dirty.current = true;
      setStatus(err instanceof ApiError && err.code === 'EDIT_CONFLICT' ? 'conflict' : 'error');
    }
  };

  const change = (patch: Partial<{ title: string; body: string; date: string }>) => {
    if (patch.title !== undefined) setTitle(patch.title);
    if (patch.body !== undefined) setBody(patch.body);
    if (patch.date !== undefined) setDate(patch.date);
    latest.current = { ...latest.current, ...patch };
    dirty.current = true;
    if (status !== 'conflict') setStatus('editing');
    clearTimeout(timer.current);
    timer.current = setTimeout(() => void save(), 1200);
  };

  // Save on leaving; warn on closing the tab with unsaved text (there is no local copy).
  useEffect(() => {
    const onUnload = (e: BeforeUnloadEvent) => {
      if (dirty.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
      if (dirty.current) void save();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const titleRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(titleRef, title);

  return (
    <div className="mt-4">
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={() => void save().then(onBack)}
          className="-ml-2 flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-8"
        >
          <ChevronLeft className="h-4 w-4" /> Back
        </button>
        <span
          className={cn(
            'ml-2 flex-1 text-[0.8125rem]',
            status === 'error' || status === 'conflict' ? 'text-bad' : 'text-ink-faint',
          )}
          aria-live="polite"
        >
          {status === 'saving'
            ? 'Encrypting and saving…'
            : status === 'editing'
              ? 'Editing'
              : status === 'error'
                ? 'Not saved. Check your connection.'
                : status === 'conflict'
                  ? 'Changed on another device. Copy your text, go back and reopen.'
                  : ref.current.id
                    ? 'Saved, encrypted'
                    : 'Not saved yet'}
        </span>
        {status === 'error' && (
          <Button size="sm" onClick={() => void save()}>
            Retry
          </Button>
        )}
        {ref.current.id && (
          <IconButton
            label="Delete"
            onClick={async () => {
              if (
                !(await confirm({
                  title: 'Delete this for good?',
                  confirmLabel: 'Delete',
                  danger: true,
                }))
              )
                return;
              try {
                await vault.remove(ref.current.id!);
                dirty.current = false;
                onBack();
              } catch (err) {
                toast({ message: errorMessage(err), tone: 'error' });
              }
            }}
          >
            <Trash2 className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      {kind === 'entry' && (
        <input
          type="date"
          value={date}
          onChange={(e) => e.target.value && change({ date: e.target.value })}
          aria-label="Date"
          className="mt-4 h-9 rounded border border-line bg-transparent px-2 text-sm text-ink-muted sm:h-8"
        />
      )}
      <textarea
        ref={titleRef}
        value={title}
        rows={1}
        onChange={(e) => change({ title: e.target.value.replace(/\n/g, ' ') })}
        placeholder={kind === 'entry' ? 'Title (optional)' : 'Title'}
        aria-label="Title"
        className="mt-4 block w-full resize-none overflow-hidden bg-transparent font-serif text-[1.625rem] font-medium leading-tight text-ink placeholder:text-ink-faint/70 focus:outline-none focus-visible:outline-none"
      />
      <div className="mt-5">
        <MarkdownEditor
          value={body}
          onChange={(b) => change({ body: b })}
          font={prefs.data?.writingFont ?? 'serif'}
          ariaLabel="Text"
          placeholder="Write…"
          minRows={6}
        />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------- documents

export function DocumentsTab() {
  const vault = useVault();
  const toast = useToast();
  const confirm = useConfirm();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ item: DecryptedItem; url: string; mime: string } | null>(
    null,
  );
  const docs = vault.items.filter((i) => i.content.kind === 'document').sort(byNewest);

  useEffect(
    () => () => {
      if (preview) URL.revokeObjectURL(preview.url);
    },
    [preview],
  );

  const upload = async (files: FileList) => {
    setBusy(true);
    for (const f of [...files]) {
      if (f.size > 25 * 1024 * 1024) {
        toast({ message: `${f.name}: over 25 MB, not added`, tone: 'error' });
        continue;
      }
      try {
        await vault.uploadFile(f);
      } catch (err) {
        toast({ message: `${f.name}: ${errorMessage(err)}`, tone: 'error' });
      }
    }
    setBusy(false);
  };

  const open = async (item: DecryptedItem, download = false) => {
    try {
      const blob = await vault.openFile(item);
      const url = URL.createObjectURL(blob);
      const c = item.content as ContentOf<'document'>;
      if (download || !(c.mime.startsWith('image/') || c.mime === 'application/pdf')) {
        const a = document.createElement('a');
        a.href = url;
        a.download = c.name;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 10_000);
      } else {
        setPreview({ item, url, mime: c.mime });
      }
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-ink-muted">
          Encrypted on this device before upload, decrypted only here when you open them.
        </p>
        <Button onClick={() => input.current?.click()} busy={busy}>
          <Upload className="h-4 w-4" /> {busy ? 'Encrypting…' : 'Add files'}
        </Button>
        <input
          ref={input}
          type="file"
          multiple
          className="sr-only"
          tabIndex={-1}
          aria-hidden
          onChange={(e) => {
            if (e.target.files?.length) void upload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>
      {!docs.length ? (
        <Empty>No private documents yet.</Empty>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
          {docs.map((d) => {
            const c = d.content as ContentOf<'document'>;
            return (
              <li key={d.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => void open(d)}
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-2.5 text-left hover:bg-surface/70"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-faint">
                    <FileText className="h-4 w-4" strokeWidth={1.5} />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] text-ink">{c.name}</span>
                    <span className="block text-2xs text-ink-faint">
                      {formatSize(c.size)} · added {formatAgo(d.createdAt)}
                    </span>
                  </span>
                </button>
                <IconButton label={`Download ${c.name}`} onClick={() => void open(d, true)}>
                  <Download className="h-4 w-4" />
                </IconButton>
                <IconButton
                  label={`Delete ${c.name}`}
                  onClick={async () => {
                    if (
                      await confirm({
                        title: `Delete ${c.name}?`,
                        message: 'It is removed from the vault for good.',
                        confirmLabel: 'Delete',
                        danger: true,
                      })
                    ) {
                      await vault
                        .remove(d.id)
                        .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
                    }
                  }}
                >
                  <Trash2 className="h-4 w-4" />
                </IconButton>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={!!preview}
        onClose={() => setPreview(null)}
        title="Document"
        hideTitle
        placement="panel"
        className="sm:w-[40rem]"
      >
        {preview && (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
              <span className="min-w-0 flex-1 truncate pl-2 text-sm text-ink-faint">
                {(preview.item.content as ContentOf<'document'>).name}
              </span>
              <IconButton label="Close" onClick={() => setPreview(null)}>
                <X className="h-4 w-4" />
              </IconButton>
            </div>
            <div className="min-h-0 flex-1 bg-surface">
              {preview.mime.startsWith('image/') ? (
                <img
                  src={preview.url}
                  alt=""
                  className="mx-auto max-h-full w-auto object-contain"
                />
              ) : (
                <iframe
                  src={preview.url}
                  title="Document"
                  className="h-full w-full border-0 bg-white"
                />
              )}
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}

// ---------------------------------------------------------------- accounts

const EMPTY_ACCOUNT: ContentOf<'account'> = {
  kind: 'account',
  service: '',
  url: '',
  email: '',
  username: '',
  twoFactor: '',
  recoveryLocation: '',
  notes: '',
};

/** An inventory of important accounts. Never passwords or recovery codes: only where they are. */
export function AccountsTab({ initialId }: { initialId?: string | null }) {
  const vault = useVault();
  const [editing, setEditing] = useState<DecryptedItem | 'new' | null>(
    () => vault.items.find((i) => i.id === initialId) ?? null,
  );
  const accounts = vault.items
    .filter((i) => i.content.kind === 'account')
    .sort((a, b) =>
      (a.content as ContentOf<'account'>).service.localeCompare(
        (b.content as ContentOf<'account'>).service,
      ),
    );

  return (
    <div className="mt-4">
      <div className="flex items-center gap-3">
        <p className="flex-1 text-sm text-ink-muted">
          Which accounts matter, which email they use, and where their recovery codes are kept.{' '}
          <span className="text-ink">
            Passwords and codes belong in your password manager, not here.
          </span>
        </p>
        <Button onClick={() => setEditing('new')}>
          <Plus className="h-4 w-4" /> Add
        </Button>
      </div>
      {!accounts.length ? (
        <Empty>
          No accounts listed yet. Start with email, bank, domain registrar and payment platforms.
        </Empty>
      ) : (
        <ul className="mt-4 divide-y divide-line/70 border-y border-line/70">
          {accounts.map((a) => {
            const c = a.content as ContentOf<'account'>;
            return (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setEditing(a)}
                  className="-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-3 text-left hover:bg-surface/70"
                >
                  <span className="block text-[0.9375rem] font-medium text-ink">
                    {c.service || 'Unnamed account'}
                  </span>
                  <span className="block truncate text-[0.8125rem] text-ink-muted">
                    {[c.email, c.username].filter(Boolean).join(' · ') || '—'}
                  </span>
                  {(c.twoFactor || c.recoveryLocation) && (
                    <span className="block truncate text-2xs text-ink-faint">
                      {[
                        c.twoFactor && `2FA: ${c.twoFactor}`,
                        c.recoveryLocation && `Recovery: ${c.recoveryLocation}`,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <Dialog
        open={!!editing}
        onClose={() => setEditing(null)}
        title={editing === 'new' ? 'Add account' : 'Edit account'}
        placement="top"
      >
        {editing && (
          <AccountForm item={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />
        )}
      </Dialog>
    </div>
  );
}

function AccountForm({ item, onDone }: { item: DecryptedItem | null; onDone: () => void }) {
  const vault = useVault();
  const confirm = useConfirm();
  const [a, setA] = useState<ContentOf<'account'>>(
    (item?.content as ContentOf<'account'>) ?? EMPTY_ACCOUNT,
  );
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set =
    (k: keyof ContentOf<'account'>) =>
    (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setA({ ...a, [k]: e.target.value });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!a.service.trim()) return setError('Which service is this?');
    setBusy(true);
    try {
      await vault.save(item?.id ?? null, a, item?.updatedAt);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="max-h-[75dvh] space-y-3 overflow-y-auto p-4">
      <Field label="Service">
        {(id) => (
          <Input
            id={id}
            value={a.service}
            onChange={set('service')}
            placeholder="e.g. Gmail, PayPal, Namecheap"
            autoFocus
          />
        )}
      </Field>
      <Field label="Website (optional)">
        {(id) => (
          <Input
            id={id}
            value={a.url}
            onChange={set('url')}
            inputMode="url"
            autoCapitalize="none"
          />
        )}
      </Field>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Email used">
          {(id) => (
            <Input
              id={id}
              value={a.email}
              onChange={set('email')}
              inputMode="email"
              autoCapitalize="none"
            />
          )}
        </Field>
        <Field label="Username (optional)">
          {(id) => (
            <Input id={id} value={a.username} onChange={set('username')} autoCapitalize="none" />
          )}
        </Field>
      </div>
      <Field label="Two-factor method" hint="e.g. Authenticator app on my phone, hardware key">
        {(id) => <Input id={id} value={a.twoFactor} onChange={set('twoFactor')} />}
      </Field>
      <Field
        label="Where the recovery codes are"
        hint="A location, not the codes. e.g. Bitwarden note “Gmail recovery”, or the printed sheet in the desk drawer"
      >
        {(id) => <Input id={id} value={a.recoveryLocation} onChange={set('recoveryLocation')} />}
      </Field>
      <Field label="Notes">
        {(id) => (
          <textarea
            id={id}
            value={a.notes}
            onChange={set('notes')}
            rows={3}
            className={controlClass}
          />
        )}
      </Field>
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="flex items-center gap-2">
        {item && (
          <button
            type="button"
            onClick={async () => {
              if (
                await confirm({
                  title: `Remove ${a.service || 'this account'} from the list?`,
                  confirmLabel: 'Remove',
                  danger: true,
                })
              ) {
                await vault.remove(item.id);
                onDone();
              }
            }}
            className="mr-auto text-[0.8125rem] text-bad hover:underline"
          >
            Remove
          </button>
        )}
        <Button variant="ghost" onClick={onDone} className="ml-auto">
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={busy}>
          Save
        </Button>
      </div>
    </form>
  );
}

// ---------------------------------------------------------------- emergency

const EMPTY_EMERGENCY: ContentOf<'emergency'> = {
  kind: 'emergency',
  body: '',
  trustedPeople: '',
  passphraseAccess: '',
  otherCopies: '',
};

function Block({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint: string;
  value: string;
  onChange: (v: string) => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useAutosize(ref, value, 3);
  return (
    <label className="block">
      <span className="text-[0.9375rem] font-medium text-ink">{label}</span>
      <span className="mt-0.5 block text-2xs text-ink-faint">{hint}</span>
      <textarea
        ref={ref}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={3}
        className={cn(controlClass, 'mt-2 resize-none overflow-hidden leading-6')}
      />
    </label>
  );
}

/**
 * "If something happens to me". Encrypted like everything else, which means a trusted person
 * cannot read it unless they can open the vault. So the page also plans how they would get it.
 */
export function EmergencyTab() {
  const vault = useVault();
  const toast = useToast();
  const item = vault.items.find((i) => i.content.kind === 'emergency') ?? null;
  const [e, setE] = useState<ContentOf<'emergency'>>(
    (item?.content as ContentOf<'emergency'>) ?? EMPTY_EMERGENCY,
  );
  const [busy, setBusy] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(item?.updatedAt ?? null);
  const ref = useRef({ id: item?.id ?? null, updatedAt: item?.updatedAt });

  const save = async () => {
    setBusy(true);
    try {
      const saved = await vault.save(ref.current.id, e, ref.current.updatedAt);
      ref.current = { id: saved.id, updatedAt: saved.updatedAt };
      setSavedAt(saved.updatedAt);
      toast({ message: 'Saved, encrypted' });
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    } finally {
      setBusy(false);
    }
  };

  const exportText = () => {
    const text = [
      'IF SOMETHING HAPPENS TO ME',
      `Written ${new Date().toLocaleDateString()}`,
      '',
      e.body,
      '',
      '— People I trust —',
      e.trustedPeople,
      '',
      '— How to get into my encrypted vault —',
      e.passphraseAccess,
      '',
      '— Other copies of this —',
      e.otherCopies,
      '',
    ].join('\n');
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain;charset=utf-8' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = 'if-something-happens-to-me.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  };

  return (
    <div className="mt-4">
      <div className="border-l-2 border-warn bg-surface py-3 pl-4 pr-3 text-sm leading-6 text-ink-muted">
        <p className="text-ink">Encryption and access pull in opposite directions.</p>
        <p className="mt-1">
          This page is encrypted, so nobody can read it here without the vault passphrase, including
          the people it is for. Plan separately how they would actually get it: for example a
          printed copy in a sealed envelope with someone you trust or a lawyer, or Bitwarden’s
          Emergency Access with the passphrase stored there.
        </p>
      </div>
      <div className="mt-6 space-y-6">
        <Block
          label="What they should know and do"
          hint="Practical steps: who to contact, which accounts matter, bills, what to close or keep."
          value={e.body}
          onChange={(body) => setE({ ...e, body })}
        />
        <Block
          label="People I trust"
          hint="Who should be told first, and how to reach them."
          value={e.trustedPeople}
          onChange={(trustedPeople) => setE({ ...e, trustedPeople })}
        />
        <Block
          label="How they could open this vault"
          hint="Where the vault passphrase can be found by them, and nobody else. Don't write the passphrase here."
          value={e.passphraseAccess}
          onChange={(passphraseAccess) => setE({ ...e, passphraseAccess })}
        />
        <Block
          label="Other copies"
          hint="Where printed or exported copies of this page are kept, and when you last updated them."
          value={e.otherCopies}
          onChange={(otherCopies) => setE({ ...e, otherCopies })}
        />
      </div>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Button variant="primary" onClick={() => void save()} busy={busy}>
          Save
        </Button>
        <Button onClick={exportText}>
          <Download className="h-4 w-4" /> Download as plain text
        </Button>
        {savedAt && (
          <span className="text-2xs text-ink-faint">Last saved {formatAgo(savedAt)}</span>
        )}
      </div>
      <p className="mt-3 text-2xs text-ink-faint">
        The download is not encrypted. Print it or store it where only the right people can reach
        it, then delete the file from this device.
      </p>
    </div>
  );
}

// ---------------------------------------------------------------- search (vault only)

function searchText(c: VaultContent): string {
  switch (c.kind) {
    case 'entry':
    case 'instructions':
      return `${c.title} ${c.body}`;
    case 'document':
      return `${c.name} ${c.note}`;
    case 'account':
      return `${c.service} ${c.url} ${c.email} ${c.username} ${c.twoFactor} ${c.recoveryLocation} ${c.notes}`;
    case 'emergency':
      return `${c.body} ${c.trustedPeople} ${c.passphraseAccess} ${c.otherCopies}`;
  }
}

const KIND_LABEL: Record<VaultContent['kind'], string> = {
  entry: 'Entry',
  document: 'Document',
  account: 'Account',
  instructions: 'Instructions',
  emergency: 'Emergency page',
};

/** Searches the decrypted vault in memory, on this device only. Never part of universal search. */
export function VaultSearch({ onOpen }: { onOpen: (item: DecryptedItem) => void }) {
  const vault = useVault();
  const [q, setQ] = useState('');
  const fold = (s: string) => s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
  const terms = fold(q).split(/\s+/).filter(Boolean);
  const results = terms.length
    ? vault.items.filter((i) => terms.every((t) => fold(searchText(i.content)).includes(t)))
    : [];

  return (
    <div className="mt-4">
      <Input
        autoFocus
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search inside the vault"
        aria-label="Search inside the vault"
      />
      <p className="mt-2 text-2xs text-ink-faint">
        This search runs on this device, over the unlocked vault only.
      </p>
      {terms.length > 0 && !results.length && <Empty>Nothing in the vault matches.</Empty>}
      <ul className="mt-3 divide-y divide-line/70">
        {results.map((i) => {
          const c = i.content;
          const title =
            c.kind === 'account'
              ? c.service
              : c.kind === 'document'
                ? c.name
                : c.kind === 'emergency'
                  ? 'If something happens to me'
                  : c.title || 'Untitled';
          return (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => onOpen(i)}
                className="-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded px-2 py-2.5 text-left hover:bg-surface/70"
              >
                <span className="w-24 shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
                  {KIND_LABEL[c.kind]}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm text-ink">{title}</span>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
