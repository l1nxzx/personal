import { useQueryClient } from '@tanstack/react-query';
import {
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Download,
  ExternalLink,
  FileText,
  FolderInput,
  Star,
  Trash2,
  X,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { DocumentFile } from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { controlClass } from '../../components/ui/Field';
import { Dialog } from '../../components/ui/Dialog';
import { Loading } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import {
  fileKind,
  fileUrl,
  formatSize,
  useDeleteDocument,
  useDocument,
  useUpdateDocument,
} from './api';
import { FolderGlyph } from './FileIcons';
import { FileMetadata } from './ItemMetadata';
import { locationLabel, type FolderTree } from './folderTree';

interface PreviewProps {
  id: string | null;
  tree: FolderTree;
  onClose: () => void;
  onMove: (doc: DocumentFile) => void;
  onShowFolder: (folderId: string | null) => void;
  /** The files listed around this one, in display order (for previous / next). */
  siblings: DocumentFile[];
  onNavigate: (id: string) => void;
}

interface Nav {
  /** 1-based position among the siblings, or null when the file isn't in the list. */
  position: number | null;
  total: number;
  go: (step: -1 | 1) => void;
}

const typingOrMedia = (el: EventTarget | null) =>
  el instanceof HTMLElement &&
  !!el.closest('input, textarea, select, [contenteditable="true"], video, audio');

/**
 * Side panel (full screen on phones) for one file: preview, details, links. Opened with `?doc=`.
 * Arrow keys (up/down, or left/right) step to the previous / next file in the list.
 */
export function DocumentPreview({ id, onClose, siblings, onNavigate, ...rest }: PreviewProps) {
  const qc = useQueryClient();
  const index = id ? siblings.findIndex((f) => f.id === id) : -1;

  const go = (step: -1 | 1) => {
    const next = index === -1 ? undefined : siblings[index + step];
    if (!next) return;
    // Show what the list already knows straight away; the panel refreshes it.
    if (!qc.getQueryData(['document', next.id])) qc.setQueryData(['document', next.id], next);
    onNavigate(next.id);
  };
  const goRef = useRef(go);
  goRef.current = go;

  useEffect(() => {
    if (!id) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
      const step =
        e.key === 'ArrowUp' || e.key === 'ArrowLeft'
          ? -1
          : e.key === 'ArrowDown' || e.key === 'ArrowRight'
            ? 1
            : 0;
      if (!step || typingOrMedia(e.target)) return;
      // Not while a confirmation, the move dialog or a menu sits on top of the preview.
      if (document.querySelectorAll('[role="dialog"]').length > 1) return;
      if (document.querySelector('[role="menu"]')) return;
      e.preventDefault();
      goRef.current(step);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [id]);

  // Stepping replaces the panel's contents; keep keyboard focus inside the preview.
  useEffect(() => {
    if (id && document.activeElement === document.body) {
      document
        .querySelector<HTMLElement>('[role="dialog"][aria-label="File"]')
        ?.focus({ preventScroll: true });
    }
  }, [id]);

  // Warm the browser cache with the neighbouring images so stepping through photos is instant.
  useEffect(() => {
    if (index === -1) return;
    for (const f of [siblings[index - 1], siblings[index + 1]]) {
      if (f?.previewable && f.mime.startsWith('image/')) new Image().src = fileUrl(f.id);
    }
  }, [index, siblings]);

  const nav: Nav = { position: index === -1 ? null : index + 1, total: siblings.length, go };
  return (
    <Dialog
      open={!!id}
      onClose={onClose}
      title="File"
      hideTitle
      placement="panel"
      className="sm:w-[34rem]"
    >
      {id && <Panel key={id} id={id} onClose={onClose} nav={nav} {...rest} />}
    </Dialog>
  );
}

function Panel({
  id,
  onClose,
  tree,
  onMove,
  onShowFolder,
  nav,
}: Omit<PreviewProps, 'id' | 'siblings' | 'onNavigate'> & { id: string; nav: Nav }) {
  const doc = useDocument(id);
  const update = useUpdateDocument();
  const del = useDeleteDocument();
  const confirm = useConfirm();
  const toast = useToast();

  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate(
      { id, patch },
      { onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }) },
    );

  const remove = async (d: DocumentFile) => {
    const ok = await confirm({
      title: `Delete “${d.name}”?`,
      message: 'The file is removed for good.',
      confirmLabel: 'Delete',
      danger: true,
    });
    if (!ok) return;
    await del
      .mutateAsync(id)
      .then(() => {
        toast({ message: 'File deleted' });
        onClose();
      })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
  };

  const d = doc.data;
  const [metaOpen, setMetaOpen] = useState(false);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton label="Close" onClick={onClose} className="sm:hidden">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        {nav.position !== null && nav.total > 1 && (
          <>
            <IconButton
              label="Previous file (↑)"
              onClick={() => nav.go(-1)}
              disabled={nav.position === 1}
            >
              <ChevronUp className="h-4 w-4" />
            </IconButton>
            <IconButton
              label="Next file (↓)"
              onClick={() => nav.go(1)}
              disabled={nav.position === nav.total}
            >
              <ChevronDown className="h-4 w-4" />
            </IconButton>
            <span className="hidden shrink-0 pl-1 text-2xs tabular-nums text-ink-faint sm:inline">
              {nav.position} of {nav.total}
            </span>
          </>
        )}
        <span className="min-w-0 flex-1 truncate pl-2 text-sm text-ink-faint">
          {d?.name ?? 'File'}
        </span>
        {d && (
          <>
            <IconButton
              label={d.favorite ? 'Remove from favorites' : 'Add to favorites'}
              onClick={() => save({ favorite: !d.favorite })}
            >
              <Star className={cn('h-4 w-4', d.favorite && 'fill-warn text-warn')} />
            </IconButton>
            <a
              href={fileUrl(id, { download: true })}
              aria-label="Download"
              title="Download"
              className="inline-flex h-10 w-10 items-center justify-center rounded text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-8 sm:w-8"
            >
              <Download className="h-4 w-4" />
            </a>
            <IconButton label="Metadata" onClick={() => setMetaOpen(true)}>
              <FileText className="h-4 w-4" />
            </IconButton>
            <IconButton label="Delete file" onClick={() => void remove(d)}>
              <Trash2 className="h-4 w-4" />
            </IconButton>
          </>
        )}
        <IconButton label="Close" onClick={onClose} className="hidden sm:inline-flex">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto">
        {!d ? (
          doc.isError ? (
            <p className="p-5 text-sm text-ink-muted">{errorMessage(doc.error)}</p>
          ) : (
            <Loading className="px-5" />
          )
        ) : (
          <>
            <Preview doc={d} />
            <div className="px-5 pb-10 pt-4">
              <Details
                doc={d}
                location={locationLabel(tree, d.folderId)}
                onSave={save}
                onMove={() => onMove(d)}
                onShowFolder={() => onShowFolder(d.folderId)}
              />
              <LinksPanel item={{ type: 'document', id }} className="mt-8" />
            </div>
          </>
        )}
      </div>
      <FileMetadata
        file={metaOpen ? (d ?? null) : null}
        tree={tree}
        onClose={() => setMetaOpen(false)}
      />
    </div>
  );
}

function Preview({ doc }: { doc: DocumentFile }) {
  const url = fileUrl(doc.id);
  if (doc.mime.startsWith('image/') && doc.previewable) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="block bg-surface">
        <img src={url} alt={doc.name} className="mx-auto max-h-[55vh] w-auto object-contain" />
      </a>
    );
  }
  if (doc.previewable && doc.mime.startsWith('video/')) {
    return (
      <div className="bg-black">
        <video src={url} controls playsInline preload="metadata" className="max-h-[60vh] w-full">
          <track kind="captions" />
        </video>
      </div>
    );
  }
  if (doc.previewable && doc.mime.startsWith('audio/')) {
    return (
      <div className="bg-surface px-5 py-6">
        <audio src={url} controls preload="metadata" className="w-full" />
      </div>
    );
  }
  if (doc.mime === 'application/pdf' || doc.mime === 'text/plain') {
    return (
      <div className="bg-surface">
        <iframe src={url} title={doc.name} className="h-[60vh] w-full border-0 bg-white" />
        <a
          href={url}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-5 py-2 text-[0.8125rem] text-accent hover:underline"
        >
          <ExternalLink className="h-3.5 w-3.5" /> Open in a new tab
        </a>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-start gap-3 bg-surface px-5 py-8 text-sm text-ink-muted">
      <p>This kind of file can&apos;t be previewed here.</p>
      <a
        href={fileUrl(doc.id, { download: true })}
        className="inline-flex h-10 items-center gap-2 rounded border border-line-strong px-4 text-ink hover:bg-surface-2 sm:h-9"
      >
        <Download className="h-4 w-4" /> Download
      </a>
    </div>
  );
}

function Details({
  doc,
  location,
  onSave,
  onMove,
  onShowFolder,
}: {
  doc: DocumentFile;
  location: string;
  onSave: (patch: { name?: string }) => void;
  onMove: () => void;
  onShowFolder: () => void;
}) {
  const [name, setName] = useState(doc.name);
  return (
    <div className="space-y-4">
      <label className="block">
        <span className="text-[0.8125rem] text-ink-faint">Name</span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => name.trim() && name.trim() !== doc.name && onSave({ name: name.trim() })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          maxLength={200}
          className={cn(controlClass, 'mt-1 h-10 sm:h-9')}
        />
      </label>
      <div>
        <span className="text-[0.8125rem] text-ink-faint">Location</span>
        <div className="mt-1 flex items-center gap-2">
          <button
            type="button"
            onClick={onShowFolder}
            title="Show in folder"
            className="flex h-10 min-w-0 flex-1 items-center gap-2 rounded border border-line px-3 text-left text-sm text-ink hover:bg-surface-2 sm:h-9"
          >
            <FolderGlyph className="h-4 w-4" />
            <span className="truncate">{location}</span>
          </button>
          <Button onClick={onMove}>
            <FolderInput className="h-4 w-4" /> Move
          </Button>
        </div>
      </div>
      <p className="text-2xs text-ink-faint">
        {fileKind(doc.mime, doc.name)} · {formatSize(doc.size)} · uploaded{' '}
        {formatAgo(doc.createdAt)}
        {doc.mime.startsWith('image/') && ' · resized and stripped of location data on upload'}
      </p>
    </div>
  );
}
