import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ChevronLeft, X } from 'lucide-react';
import { useState } from 'react';
import type { EntryKind, EntryVersion, EntryVersionSummary } from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { controlClass } from '../../components/ui/Field';
import { Loading, Segmented } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { apiFetch, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { proseDiff } from '../../lib/diff';
import { ENTRY_API } from '../../lib/routes';

const when = (iso: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(iso),
  );

interface Current {
  title: string;
  body: string;
  tags: string[];
}

/**
 * Earlier versions of a piece of writing: taken automatically every so often while editing,
 * or kept by hand. Read one, compare it with the current text, or bring it back.
 */
export function VersionHistory({
  open,
  onClose,
  kind,
  entryId,
  current,
  onRestore,
}: {
  open: boolean;
  onClose: () => void;
  kind: EntryKind;
  entryId: string;
  current: Current;
  onRestore: (v: Current) => void;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Version history"
      hideTitle
      placement="panel"
      className="sm:w-[40rem]"
    >
      {open && (
        <Panel
          kind={kind}
          entryId={entryId}
          current={current}
          onRestore={onRestore}
          onClose={onClose}
        />
      )}
    </Dialog>
  );
}

function Panel({
  kind,
  entryId,
  current,
  onRestore,
  onClose,
}: {
  kind: EntryKind;
  entryId: string;
  current: Current;
  onRestore: (v: Current) => void;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const toast = useToast();
  const confirm = useConfirm();
  const key = ['versions', kind, entryId];
  const list = useQuery({
    queryKey: key,
    queryFn: async () =>
      (await apiFetch<{ items: EntryVersionSummary[] }>(`${ENTRY_API[kind]}/${entryId}/versions`))
        .items,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const keep = useMutation({
    mutationFn: (l: string | null) =>
      apiFetch<{ version: EntryVersionSummary }>(`${ENTRY_API[kind]}/${entryId}/versions`, {
        method: 'POST',
        body: { label: l },
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: key }),
  });

  const restore = async (v: EntryVersion) => {
    const ok = await confirm({
      title: 'Bring back this version?',
      message: 'The current text is kept as a version first, so nothing is lost.',
      confirmLabel: 'Restore',
    });
    if (!ok) return;
    try {
      await keep.mutateAsync('Before restoring an earlier version');
      onRestore({ title: v.title, body: v.body, tags: v.tags });
      toast({ message: `Restored the version from ${when(v.savedAt)}` });
      onClose();
    } catch (err) {
      toast({ message: errorMessage(err), tone: 'error' });
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton
          label={selected ? 'Back to versions' : 'Close'}
          onClick={() => (selected ? setSelected(null) : onClose())}
          className={selected ? '' : 'sm:hidden'}
        >
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <span className="flex-1 pl-2 text-sm text-ink-faint">Version history</span>
        <IconButton label="Close" onClick={onClose} className="hidden sm:inline-flex">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-4">
        {selected ? (
          <VersionView id={selected} current={current} onRestore={restore} />
        ) : (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                keep.mutate(label.trim() || null, {
                  onSuccess: () => {
                    setLabel('');
                    toast({ message: 'Version kept' });
                  },
                  onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                });
              }}
              className="flex gap-2"
            >
              <input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                maxLength={120}
                placeholder="Label (optional), e.g. Sent to Martin"
                aria-label="Version label"
                className={cn(controlClass, 'h-10 sm:h-9')}
              />
              <Button type="submit" busy={keep.isPending}>
                Keep this version
              </Button>
            </form>
            <p className="mt-2 text-2xs text-ink-faint">
              Earlier text is also kept automatically every half hour or so while you edit.
            </p>
            {list.isLoading ? (
              <Loading />
            ) : !list.data?.length ? (
              <p className="mt-6 text-sm text-ink-faint">No earlier versions yet.</p>
            ) : (
              <ul className="mt-5 divide-y divide-line/70 border-y border-line/70">
                {list.data.map((v) => (
                  <li key={v.id}>
                    <button
                      type="button"
                      onClick={() => setSelected(v.id)}
                      className="-mx-2 block w-[calc(100%+1rem)] rounded px-2 py-3 text-left hover:bg-surface/70"
                    >
                      <span className="block text-sm text-ink">{when(v.savedAt)}</span>
                      <span className="block truncate text-2xs text-ink-faint">
                        {v.label ? `${v.label} · ` : ''}
                        {v.wordCount.toLocaleString()} words{v.title ? ` · ${v.title}` : ''}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}

function VersionView({
  id,
  current,
  onRestore,
}: {
  id: string;
  current: Current;
  onRestore: (v: EntryVersion) => void;
}) {
  const [mode, setMode] = useState<'compare' | 'read'>('compare');
  const q = useQuery({
    queryKey: ['version', id],
    queryFn: async () => (await apiFetch<{ version: EntryVersion }>(`/versions/${id}`)).version,
    staleTime: Infinity,
  });
  if (!q.data)
    return q.isError ? <p className="text-sm text-bad">{errorMessage(q.error)}</p> : <Loading />;
  const v = q.data;
  const blocks = proseDiff(v.body, current.body);
  const unchanged = v.body === current.body && v.title === current.title;

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm text-ink">{when(v.savedAt)}</div>
          {v.label && <div className="text-2xs text-ink-faint">{v.label}</div>}
        </div>
        <Segmented
          label="View"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'compare', label: 'Compare with now' },
            { value: 'read', label: 'Read' },
          ]}
        />
      </div>
      {mode === 'compare' && (
        <p className="mt-3 flex flex-wrap gap-x-4 text-2xs text-ink-faint">
          <span>
            <span className="rounded-sm bg-bad/15 px-1 text-ink-muted line-through decoration-bad/70">
              removed
            </span>{' '}
            since then
          </span>
          <span>
            <span className="rounded-sm bg-ok/15 px-1 text-ink">added</span> since then
          </span>
        </p>
      )}
      {v.title !== current.title && (
        <p className="mt-4 text-sm text-ink-muted">
          Title then: <span className="text-ink">{v.title || 'Untitled'}</span>
        </p>
      )}
      <div
        className="mt-4 whitespace-pre-wrap font-serif text-[1.0625rem] leading-relaxed text-ink"
        style={{ fontVariationSettings: "'opsz' 16" }}
      >
        {mode === 'read' ? (
          v.body || <span className="italic text-ink-faint">Empty</span>
        ) : unchanged ? (
          <span className="font-sans text-sm text-ink-faint">Same as the current text.</span>
        ) : (
          blocks.map((b, i) =>
            b.kind === 'same' ? (
              <span key={i}>
                {b.text}
                {'\n'}
              </span>
            ) : (
              <span key={i}>
                {b.words!.map((w, j) =>
                  w.type === 'same' ? (
                    <span key={j}>{w.value}</span>
                  ) : w.type === 'removed' ? (
                    <span key={j}>
                      <del className="rounded-sm bg-bad/15 text-ink-muted line-through decoration-bad/70">
                        {w.value}
                      </del>
                      {b.words![j + 1]?.type === 'added' && !/\s$/.test(w.value) && ' '}
                    </span>
                  ) : (
                    <ins key={j} className="rounded-sm bg-ok/15 text-ink no-underline">
                      {w.value}
                    </ins>
                  ),
                )}
                {'\n'}
              </span>
            ),
          )
        )}
      </div>
      {!unchanged && (
        <div className="mt-8">
          <Button variant="primary" onClick={() => onRestore(v)}>
            Restore this version
          </Button>
        </div>
      )}
    </div>
  );
}
