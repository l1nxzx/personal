import { ChevronLeft, Download, ExternalLink, Star, Trash2, X } from 'lucide-react';
import { useId, useState } from 'react';
import type { DocumentFile } from '../../../../shared/types';
import { IconButton } from '../../components/ui/Button';
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

/** Side panel (full screen on phones) for one file: preview, details, links. Opened with `?doc=`. */
export function DocumentPreview({
  id,
  onClose,
  folders,
}: {
  id: string | null;
  onClose: () => void;
  folders: string[];
}) {
  return (
    <Dialog
      open={!!id}
      onClose={onClose}
      title="File"
      hideTitle
      placement="panel"
      className="sm:w-[34rem]"
    >
      {id && <Panel key={id} id={id} onClose={onClose} folders={folders} />}
    </Dialog>
  );
}

function Panel({ id, onClose, folders }: { id: string; onClose: () => void; folders: string[] }) {
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
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton label="Close" onClick={onClose} className="sm:hidden">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
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
              <Details doc={d} folders={folders} onSave={save} />
              <LinksPanel item={{ type: 'document', id }} className="mt-8" />
            </div>
          </>
        )}
      </div>
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
  folders,
  onSave,
}: {
  doc: DocumentFile;
  folders: string[];
  onSave: (patch: { name?: string; folder?: string | null }) => void;
}) {
  const [name, setName] = useState(doc.name);
  const [folder, setFolder] = useState(doc.folder ?? '');
  const listId = useId();
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
      <label className="block">
        <span className="text-[0.8125rem] text-ink-faint">Folder</span>
        <input
          value={folder}
          onChange={(e) => setFolder(e.target.value)}
          onBlur={() =>
            folder.trim() !== (doc.folder ?? '') && onSave({ folder: folder.trim() || null })
          }
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          list={listId}
          maxLength={60}
          placeholder="No folder"
          className={cn(controlClass, 'mt-1 h-10 sm:h-9')}
        />
        <datalist id={listId}>
          {folders.map((f) => (
            <option key={f} value={f} />
          ))}
        </datalist>
      </label>
      <p className="text-2xs text-ink-faint">
        {fileKind(doc.mime, doc.name)} · {formatSize(doc.size)} · uploaded{' '}
        {formatAgo(doc.createdAt)}
        {doc.mime.startsWith('image/') && ' · resized and stripped of location data on upload'}
      </p>
    </div>
  );
}
