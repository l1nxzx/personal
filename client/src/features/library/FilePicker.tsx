import { Search } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import type { DocumentFile, DocumentFolder } from '../../../../shared/types';
import { Dialog } from '../../components/ui/Dialog';
import type { AnchorRef } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { useDocumentSearch, useFolders, useRecentDocuments } from './api';
import { FileThumb, FolderGlyph } from './FileIcons';
import { buildTree, locationLabel, matchFolders } from './folderTree';

type Option =
  | { kind: 'file'; ref: AnchorRef; name: string; where: string; file: DocumentFile }
  | { kind: 'folder'; ref: AnchorRef; name: string; where: string; folder: DocumentFolder };

/** Choose one file or folder from the library, by search or from recent ones. */
export function FilePicker({
  open,
  onClose,
  onPick,
  words,
}: {
  open: boolean;
  onClose: () => void;
  onPick: (ref: AnchorRef, name: string) => void;
  /** The words being linked, shown as a reminder. */
  words: string;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Link to a file or folder"
      hideTitle
      placement="top"
      className="sm:max-h-[70vh]"
    >
      <Picker words={words} onPick={onPick} />
    </Dialog>
  );
}

function Picker({
  words,
  onPick,
}: {
  words: string;
  onPick: (ref: AnchorRef, name: string) => void;
}) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(q.trim()), 180);
    return () => clearTimeout(t);
  }, [q]);

  const searching = debounced.length >= 2;
  const found = useDocumentSearch(searching ? debounced : '');
  const recent = useRecentDocuments(!searching);
  const folders = useFolders();
  const tree = useMemo(() => buildTree(folders.data ?? []), [folders.data]);

  const fileOption = (f: DocumentFile): Option => ({
    kind: 'file',
    ref: { type: 'document', id: f.id },
    name: f.name,
    where: locationLabel(tree, f.folderId),
    file: f,
  });
  const folderOption = (f: DocumentFolder): Option => ({
    kind: 'folder',
    ref: { type: 'folder', id: f.id },
    name: f.name,
    where: locationLabel(tree, f.parentId),
    folder: f,
  });

  const options: Option[] = searching
    ? [
        ...matchFolders(folders.data ?? [], debounced)
          .slice(0, 8)
          .map(folderOption),
        ...(found.data ?? []).map(fileOption),
      ]
    : [
        ...(recent.data?.pages[0]?.items ?? []).slice(0, 10).map(fileOption),
        ...[...(folders.data ?? [])]
          .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
          .slice(0, 6)
          .map(folderOption),
      ];

  useEffect(() => setActive(0), [options.length, debounced]);
  const choose = (o: Option) => onPick(o.ref, o.name);

  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive((a) => Math.min(a + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === 'Enter' && options[active]) {
          e.preventDefault();
          choose(options[active]);
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="h-4 w-4 text-ink-faint" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Find a file or folder…"
          aria-label="Find a file or folder"
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-[1.0625rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none sm:h-12"
        />
      </div>
      {words && (
        <p className="truncate px-4 pt-3 text-[0.8125rem] text-ink-muted">
          Linking <span className="text-ink">“{words}”</span>
        </p>
      )}
      <div role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
        {!searching && options.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-2xs font-medium uppercase tracking-[0.12em] text-ink-faint">
            Recent
          </p>
        )}
        {searching && found.isSuccess && !found.isFetching && options.length === 0 && (
          <p className="px-4 py-3 text-sm text-ink-faint">
            No file or folder matches “{debounced}”.
          </p>
        )}
        {!searching && recent.isSuccess && options.length === 0 && (
          <p className="px-4 py-3 text-sm text-ink-faint">
            Nothing in the library yet. Upload files in Library → Documents.
          </p>
        )}
        {options.map((o, i) => (
          <button
            key={`${o.ref.type}:${o.ref.id}`}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(o)}
            className={cn(
              'mx-1 flex w-[calc(100%-0.5rem)] items-center gap-3 rounded px-3 py-2 text-left',
              i === active && 'bg-surface-2',
            )}
          >
            {o.kind === 'file' ? (
              <FileThumb doc={o.file} />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent/10">
                <FolderGlyph />
              </span>
            )}
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{o.name}</span>
              <span className="block truncate text-2xs text-ink-faint">
                {o.kind === 'folder' ? 'Folder' : 'File'} · {o.where}
              </span>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
