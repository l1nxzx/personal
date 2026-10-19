import {
  Archive,
  ArchiveRestore,
  ChevronLeft,
  Ellipsis,
  Eye,
  History,
  Maximize2,
  Milestone,
  Minimize2,
  PenLine,
  Pin,
  PinOff,
  Trash2,
  Type,
} from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom';
import type { Entry, EntryKind, NoteMeta, NoteType } from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Loading } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { ApiError, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo, formatLongDate, today } from '../../lib/dates';
import { isMod, useKeydown } from '../../lib/hotkeys';
import { ENTRY_LIST } from '../../lib/routes';
import { readJSON, writeJSON } from '../../lib/storage';
import { LinksPanel } from '../links/LinksPanel';
import { usePrefs } from '../me/api';
import { useDeleteEntry, useEntry, usePatchEntryMeta, useSetEntryFlags } from './api';
import { FormatBar, MarkdownEditor, type MarkdownEditorHandle } from './MarkdownEditor';
import { MomentDialog } from '../timeline/MomentDialog';
import { DecisionPanel, NotePanel, PerspectivesPanel } from './NoteDetails';
import { TagInput } from './TagInput';
import { useEntryEditor, type SaveStatus } from './useEntryEditor';
import { VersionHistory } from './VersionHistory';

const MarkdownView = lazy(() => import('./MarkdownView'));

const LIST_PATH = ENTRY_LIST;
const SECTION_LABEL: Record<EntryKind, string> = {
  journal: 'Journal',
  writing: 'Writing',
  note: 'Ideas',
};

/** What other pages can pass when opening a new entry. */
export interface NewEntrySeed {
  title?: string;
  body?: string;
  prompt?: string;
  date?: string;
  noteType?: NoteType;
  topic?: string;
}

export function EditorPage({ kind }: { kind: EntryKind }) {
  const { id = 'new' } = useParams();
  const location = useLocation();
  if (id === 'new') {
    return (
      <Editor
        key={location.key}
        kind={kind}
        entry={null}
        seed={(location.state as NewEntrySeed | null) ?? undefined}
      />
    );
  }
  return <ExistingEntry key={id} kind={kind} id={id} />;
}

function ExistingEntry({ kind, id }: { kind: EntryKind; id: string }) {
  const query = useEntry(kind, id);
  if (query.data) return <Editor kind={kind} entry={query.data} />;
  return (
    <div className="mx-auto max-w-[42rem] px-5 pt-safe">
      <div className="flex h-14 items-center">
        <Link
          to={LIST_PATH[kind]}
          className="-ml-2 flex items-center gap-1 rounded px-2 py-2 text-sm text-ink-muted hover:text-ink"
        >
          <ChevronLeft className="h-4 w-4" /> {SECTION_LABEL[kind]}
        </Link>
      </div>
      {query.isError ? (
        <p className="py-8 text-ink-muted">
          {query.error instanceof ApiError && query.error.status === 404
            ? "This entry doesn't exist any more."
            : errorMessage(query.error)}
        </p>
      ) : (
        <Loading />
      )}
    </div>
  );
}

function statusLabel(status: SaveStatus, savedAt: number | null): { text: string; tone: string } {
  switch (status) {
    case 'new':
      return { text: 'Not saved yet', tone: 'text-ink-faint' };
    case 'saved':
      return {
        text: savedAt ? `Saved ${formatAgo(new Date(savedAt).toISOString())}` : 'Saved',
        tone: 'text-ink-faint',
      };
    case 'unsaved':
      return { text: 'Editing', tone: 'text-ink-faint' };
    case 'saving':
      return { text: 'Saving…', tone: 'text-ink-faint' };
    case 'offline':
      return { text: 'Offline · kept on this device', tone: 'text-warn' };
    case 'error':
      return { text: 'Not saved', tone: 'text-bad' };
    case 'conflict':
      return { text: 'Changed elsewhere', tone: 'text-bad' };
  }
}

function countWords(s: string) {
  return s.match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

function Editor({
  kind,
  entry,
  seed,
}: {
  kind: EntryKind;
  entry: Entry | null;
  seed?: NewEntrySeed;
}) {
  const navigate = useNavigate();
  const location = useLocation();
  const confirm = useConfirm();
  const toast = useToast();
  const prefs = usePrefs();
  const font = prefs.data?.writingFont ?? 'serif';

  const newFields = useMemo(
    () => ({
      title: seed?.title ?? '',
      body: seed?.prompt ? `> ${seed.prompt}\n\n` : (seed?.body ?? ''),
      date: kind === 'journal' ? (seed?.date ?? today()) : null,
      tags: [],
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  // A new note's kind/topic/sources are kept here until its first save creates it.
  const [pendingNote, setPendingNote] = useState<Pick<NoteMeta, 'noteType' | 'topic' | 'sources'>>({
    noteType: seed?.noteType ?? 'note',
    topic: seed?.topic ?? null,
    sources: [],
  });
  const pendingNoteRef = useRef(pendingNote);
  pendingNoteRef.current = pendingNote;

  const ed = useEntryEditor(kind, entry, {
    newFields,
    createExtra: () => (kind === 'note' ? pendingNoteRef.current : {}),
    // Swap /journal/new for the real URL without remounting (keeps focus and caret).
    onCreated: (created) =>
      window.history.replaceState(window.history.state, '', `${LIST_PATH[kind]}/${created.id}`),
  });

  // Keep pinned/archived current (they can change from the list or another device).
  const live = useEntry(kind, ed.id).data ?? entry;
  useEffect(() => {
    if (entry) ed.applyRemote(entry);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry]);

  const [mode, setMode] = useState<'write' | 'read'>('write');
  const [focusMode, setFocusMode] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [momentOpen, setMomentOpen] = useState(false);
  const [showFormat, setShowFormat] = useState(
    () => readJSON<boolean>('editor:formatbar') ?? false,
  );
  const editorRef = useRef<MarkdownEditorHandle>(null);
  const titleRef = useRef<HTMLTextAreaElement>(null);
  useAutosize(titleRef, ed.fields.title);

  const flags = useSetEntryFlags(kind);
  const patchMeta = usePatchEntryMeta(kind);
  const noteMeta: NoteMeta = live?.note ?? { ...pendingNote, perspectives: [], decision: null };
  const changeNote = (patch: Partial<NoteMeta>) => {
    if (!ed.id) return setPendingNote((p) => ({ ...p, ...patch }));
    patchMeta.mutate(
      { id: ed.id, patch },
      { onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }) },
    );
  };
  const del = useDeleteEntry(kind);

  // Start typing straight away in a new entry.
  useEffect(() => {
    if (!entry) setTimeout(() => editorRef.current?.focus(), 0);
  }, [entry]);

  useKeydown((e) => {
    if (isMod(e) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      void ed.flush();
    } else if (isMod(e) && e.shiftKey && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setFocusMode((f) => !f);
    } else if (e.key === 'Escape' && focusMode && !e.defaultPrevented) {
      setFocusMode(false);
    }
  });

  const goBack = () => {
    // Back if we came from inside the app, otherwise to the list.
    if (location.key !== 'default' && window.history.length > 1) navigate(-1);
    else navigate(LIST_PATH[kind]);
  };

  const remove = async () => {
    if (!ed.id) {
      ed.forget();
      ed.discardLocalDraft();
      navigate(LIST_PATH[kind], { replace: true });
      return;
    }
    const ok = await confirm({
      title:
        kind === 'journal'
          ? 'Delete this journal entry?'
          : kind === 'note'
            ? 'Delete this note?'
            : 'Delete this piece of writing?',
      message: 'It will be gone for good. This cannot be undone.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    ed.forget();
    // Promise, not callbacks: removing the entry's query unmounts this editor.
    await del
      .mutateAsync(ed.id)
      .then(() => {
        toast({ message: 'Deleted' });
        navigate(LIST_PATH[kind], { replace: true });
      })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
  };

  const setFlag = (patch: { pinned?: boolean; archived?: boolean }) => {
    if (!ed.id) return;
    flags.mutate(
      { id: ed.id, flags: patch },
      {
        onSuccess: () =>
          toast({
            message:
              patch.archived === true
                ? 'Archived'
                : patch.archived === false
                  ? 'Moved back to Writing'
                  : patch.pinned
                    ? 'Pinned'
                    : 'Unpinned',
          }),
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  const toggleFormat = () => {
    setShowFormat((s) => {
      writeJSON('editor:formatbar', !s);
      return !s;
    });
  };

  const words = countWords(ed.fields.body);
  const status = statusLabel(ed.status, ed.savedAt);
  const label = SECTION_LABEL[kind];

  return (
    <div className={cn('min-h-dvh bg-bg', focusMode && 'fixed inset-0 z-40 overflow-y-auto')}>
      {/* Top bar */}
      <div className="pt-safe sticky top-0 z-20 bg-bg/95 backdrop-blur-[2px]">
        <div className="mx-auto flex h-14 max-w-[52rem] items-center gap-1 px-2 sm:px-4">
          {!focusMode && (
            <button
              type="button"
              onClick={goBack}
              className="flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-8"
            >
              <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" />
              <span className="hidden sm:inline">{label}</span>
            </button>
          )}
          <p
            className={cn('ml-2 min-w-0 flex-1 truncate text-[0.8125rem]', status.tone)}
            aria-live="polite"
            title={ed.savedAt ? new Date(ed.savedAt).toLocaleString() : undefined}
          >
            {status.text}
            <span className="hidden text-ink-faint sm:inline">
              {words > 0 && ` · ${words.toLocaleString()} ${words === 1 ? 'word' : 'words'}`}
            </span>
          </p>
          {mode === 'write' && !focusMode && (
            <IconButton
              label={showFormat ? 'Hide formatting' : 'Formatting'}
              active={showFormat}
              onClick={toggleFormat}
            >
              <Type className="h-4 w-4" />
            </IconButton>
          )}
          <IconButton
            label={mode === 'write' ? 'Read view' : 'Edit'}
            onClick={() => setMode((m) => (m === 'write' ? 'read' : 'write'))}
          >
            {mode === 'write' ? <Eye className="h-4 w-4" /> : <PenLine className="h-4 w-4" />}
          </IconButton>
          <IconButton
            label={focusMode ? 'Leave focus mode' : 'Focus mode'}
            onClick={() => setFocusMode((f) => !f)}
          >
            {focusMode ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
          </IconButton>
          {!focusMode && (
            <Menu
              trigger={(p) => (
                <IconButton label="More actions" {...p}>
                  <Ellipsis className="h-4 w-4" />
                </IconButton>
              )}
              items={[
                ...(kind !== 'journal' && live
                  ? [
                      {
                        label: live.pinned ? 'Unpin' : 'Pin to top',
                        icon: live.pinned ? <PinOff /> : <Pin />,
                        onSelect: () => setFlag({ pinned: !live.pinned }),
                      },
                    ]
                  : []),
                ...(kind === 'writing' && live
                  ? [
                      {
                        label: live.archived ? 'Unarchive' : 'Archive',
                        icon: live.archived ? <ArchiveRestore /> : <Archive />,
                        onSelect: () => setFlag({ archived: !live.archived }),
                      },
                    ]
                  : []),
                ...(ed.id
                  ? [
                      {
                        label: 'Version history',
                        icon: <History />,
                        // Save first, so the history compares against what's on screen.
                        onSelect: () => void ed.flush().then(() => setHistoryOpen(true)),
                      },
                      {
                        label: 'Add to timeline…',
                        icon: <Milestone />,
                        onSelect: () => setMomentOpen(true),
                      },
                    ]
                  : []),
                {
                  label: ed.id ? 'Delete…' : 'Discard',
                  icon: <Trash2 />,
                  danger: true,
                  onSelect: () => void remove(),
                },
              ]}
            />
          )}
        </div>
        {showFormat && mode === 'write' && !focusMode && (
          <div className="mx-auto max-w-[52rem] border-t border-line px-2 py-1 sm:px-4">
            <FormatBar onFormat={(a) => editorRef.current?.format(a)} />
          </div>
        )}
      </div>

      <article className="mx-auto w-full max-w-[42rem] px-5 pb-[45vh] pt-4 sm:px-8 sm:pt-10">
        <Notices ed={ed} />

        {kind === 'journal' && ed.fields.date && (
          <DateField value={ed.fields.date} onChange={(date) => ed.setFields({ date })} />
        )}
        {live?.archived && (
          <p className="mb-2 text-2xs uppercase tracking-[0.12em] text-ink-faint">Archived</p>
        )}

        {mode === 'write' ? (
          <>
            <textarea
              ref={titleRef}
              value={ed.fields.title}
              onChange={(e) => ed.setFields({ title: e.target.value.replace(/\n/g, ' ') })}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  editorRef.current?.focus();
                }
              }}
              rows={1}
              maxLength={300}
              placeholder={kind === 'journal' ? 'Title (optional)' : 'Untitled'}
              aria-label="Title"
              className="block w-full resize-none overflow-hidden bg-transparent font-serif text-[1.625rem] font-medium leading-tight tracking-[-0.01em] text-ink placeholder:text-ink-faint/70 focus:outline-none focus-visible:outline-none sm:text-[1.875rem]"
              style={{ fontVariationSettings: "'opsz' 48" }}
            />
            {!focusMode && (
              <div className="mt-3">
                <TagInput
                  kind={kind}
                  tags={ed.fields.tags}
                  onChange={(tags) => ed.setFields({ tags })}
                />
              </div>
            )}
            {kind === 'note' && !focusMode && (
              <NotePanel key={ed.id ?? 'new'} meta={noteMeta} onChange={changeNote} />
            )}
            <div className="mt-6">
              <MarkdownEditor
                ref={editorRef}
                value={ed.fields.body}
                onChange={(body) => ed.setFields({ body })}
                font={font}
                ariaLabel={kind === 'journal' ? 'Journal entry' : kind === 'note' ? 'Note' : 'Text'}
                minRows={kind === 'note' ? 3 : 8}
                placeholder={
                  kind === 'journal'
                    ? 'Write about your day, or anything at all…'
                    : kind === 'note'
                      ? 'Write it out: an explanation, an argument, a question, a passage…'
                      : 'Start writing…'
                }
              />
            </div>
          </>
        ) : (
          <>
            <h1
              className={cn(
                'font-serif text-[1.625rem] font-medium leading-tight sm:text-[1.875rem]',
                !ed.fields.title && 'text-ink-faint',
              )}
              style={{ fontVariationSettings: "'opsz' 48" }}
            >
              {ed.fields.title ||
                (kind === 'journal' ? formatLongDate(ed.fields.date ?? today()) : 'Untitled')}
            </h1>
            {ed.fields.tags.length > 0 && (
              <p className="mt-2 text-[0.8125rem] text-ink-faint">
                {ed.fields.tags.map((t) => `#${t}`).join('  ')}
              </p>
            )}
            <Suspense fallback={<Loading />}>
              <MarkdownView
                source={ed.fields.body || '_Nothing written yet._'}
                font={font}
                className="mt-6"
              />
            </Suspense>
          </>
        )}

        {kind === 'note' && noteMeta.noteType === 'belief' && !focusMode && (
          <PerspectivesPanel
            perspectives={noteMeta.perspectives}
            onChange={(perspectives) =>
              ed.id
                ? changeNote({ perspectives })
                : toast({ message: 'Write a line first, so the note exists.', tone: 'error' })
            }
          />
        )}
        {kind === 'note' && noteMeta.noteType === 'decision' && !focusMode && (
          <DecisionPanel
            decision={noteMeta.decision}
            onChange={(decision) =>
              ed.id
                ? changeNote({ decision })
                : toast({ message: 'Write a line first, so the note exists.', tone: 'error' })
            }
          />
        )}
        {!focusMode && ed.id && <LinksPanel item={{ type: kind, id: ed.id }} className="mt-14" />}
      </article>

      {ed.id && (
        <>
          <VersionHistory
            open={historyOpen}
            onClose={() => setHistoryOpen(false)}
            kind={kind}
            entryId={ed.id}
            current={{ title: ed.fields.title, body: ed.fields.body, tags: ed.fields.tags }}
            onRestore={(v) => ed.setFields(v)}
          />
          <MomentDialog
            open={momentOpen}
            onClose={() => setMomentOpen(false)}
            initial={{
              date: ed.fields.date ?? today(),
              title: ed.fields.title,
              ref: { type: kind, id: ed.id },
            }}
          />
        </>
      )}
    </div>
  );
}

/** The journal date reads as text; tapping it opens the native date picker. */
function DateField({ value, onChange }: { value: string; onChange: (d: string) => void }) {
  return (
    <label className="relative mb-3 inline-flex cursor-pointer items-center text-[0.8125rem] font-medium uppercase tracking-[0.1em] text-ink-faint hover:text-ink-muted">
      {formatLongDate(value)}
      <input
        type="date"
        value={value}
        max="9999-12-31"
        onChange={(e) => e.target.value && onChange(e.target.value)}
        aria-label="Entry date"
        className="absolute inset-0 cursor-pointer opacity-0"
      />
    </label>
  );
}

function Banner({
  tone = 'muted',
  children,
  actions,
}: {
  tone?: 'muted' | 'bad' | 'warn';
  children: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      role={tone === 'bad' ? 'alert' : 'status'}
      className={cn(
        'mb-6 border-l-2 bg-surface py-3 pl-4 pr-3 text-sm',
        tone === 'bad' ? 'border-bad' : tone === 'warn' ? 'border-warn' : 'border-accent/60',
      )}
    >
      <p className="text-ink-muted">{children}</p>
      {actions && <div className="mt-2 flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

function Notices({ ed }: { ed: ReturnType<typeof useEntryEditor> }) {
  if (ed.conflict) {
    return (
      <Banner
        tone="bad"
        actions={
          <>
            <Button size="sm" variant="primary" onClick={() => ed.resolveConflict('mine')}>
              Keep my version
            </Button>
            <Button size="sm" onClick={() => ed.resolveConflict('theirs')}>
              Use the other version
            </Button>
          </>
        }
      >
        This was changed on another device ({formatAgo(ed.conflict.updatedAt)},{' '}
        {countWords(ed.conflict.body).toLocaleString()} words) while you were editing here. Your
        text is safe on this device. Which version should be kept?
      </Banner>
    );
  }
  if (ed.status === 'error') {
    const deleted = ed.errorText?.startsWith('This entry was deleted');
    return (
      <Banner
        tone="bad"
        actions={
          deleted ? (
            <Button size="sm" variant="primary" onClick={ed.saveAsNew}>
              Save as a new entry
            </Button>
          ) : (
            <Button size="sm" onClick={ed.retry}>
              Try again
            </Button>
          )
        }
      >
        {ed.errorText ?? 'Your latest changes could not be saved.'}{' '}
        {!deleted && 'They are kept on this device.'}
      </Banner>
    );
  }
  if (ed.status === 'offline') {
    return (
      <Banner tone="warn">
        You&apos;re offline. Everything you write is kept on this device and will be saved when the
        connection returns.
      </Banner>
    );
  }
  if (ed.notice?.type === 'restored') {
    return (
      <Banner
        actions={
          <>
            <Button size="sm" onClick={ed.dismissNotice}>
              OK
            </Button>
            <Button size="sm" variant="ghost" onClick={ed.discardLocalDraft}>
              Discard them
            </Button>
          </>
        }
      >
        Restored unsaved changes from this device.
      </Banner>
    );
  }
  if (ed.notice?.type === 'older-draft') {
    return (
      <Banner
        tone="warn"
        actions={
          <>
            <Button size="sm" onClick={ed.restoreOlderDraft}>
              Restore them
            </Button>
            <Button size="sm" variant="ghost" onClick={ed.discardLocalDraft}>
              Discard
            </Button>
          </>
        }
      >
        This device has unsaved changes from {formatAgo(new Date(ed.notice.draft.at).toISOString())}
        , made before a newer version was saved elsewhere. Restoring them replaces the newer
        version.
      </Banner>
    );
  }
  return null;
}
