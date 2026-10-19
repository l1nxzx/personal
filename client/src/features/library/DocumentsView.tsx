import { useQueryClient } from '@tanstack/react-query';
import { FileText, Image as ImageIcon, LayoutGrid, List, Star, Upload } from 'lucide-react';
import { useDeferredValue, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DocumentFile } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Empty, ErrorNote, Loading } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatAgo } from '../../lib/dates';
import { readJSON, writeJSON } from '../../lib/storage';
import { FilterSearch } from '../entries/ListParts';
import { useSearch } from '../me/api';
import {
  fileKind,
  fileUrl,
  formatSize,
  uploadDocument,
  useDocuments,
  useFolders,
  useUpdateDocument,
} from './api';
import { DocumentPreview } from './DocumentPreview';

const MAX_BYTES = 25 * 1024 * 1024;

export function FileThumb({ doc, size = 'sm' }: { doc: DocumentFile; size?: 'sm' | 'lg' }) {
  const box = size === 'sm' ? 'h-10 w-10' : 'aspect-[4/3] w-full';
  if (doc.hasThumb) {
    return (
      <img
        src={fileUrl(doc.id, { thumb: true })}
        alt=""
        loading="lazy"
        className={cn(box, 'shrink-0 rounded-sm bg-surface-2 object-cover')}
      />
    );
  }
  const Icon = doc.mime.startsWith('image/') ? ImageIcon : FileText;
  return (
    <div
      className={cn(
        box,
        'flex shrink-0 items-center justify-center rounded-sm bg-surface-2 text-ink-faint',
      )}
    >
      <Icon className={size === 'sm' ? 'h-4 w-4' : 'h-6 w-6'} strokeWidth={1.5} />
    </div>
  );
}

/** Documents and files. Compact list by default; a grid when browsing pictures helps. */
export function DocumentsView() {
  const [params, setParams] = useSearchParams();
  const folder = params.get('folder') ?? undefined;
  const favorite = params.get('fav') === '1';
  const openId = params.get('doc');
  const q = params.get('q') ?? '';
  const deferredQ = useDeferredValue(q);
  const searching = deferredQ.trim().length >= 2;

  const set = (key: string, value: string | undefined) =>
    setParams(
      (p) => {
        if (value) p.set(key, value);
        else p.delete(key);
        return p;
      },
      { replace: key !== 'doc' },
    );

  const docs = useDocuments({ folder, favorite });
  const folders = useFolders();
  const search = useSearch(deferredQ);
  const update = useUpdateDocument();
  const qc = useQueryClient();
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<'list' | 'grid'>(() => readJSON('docs:view') ?? 'list');
  const [uploading, setUploading] = useState<{ done: number; total: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  const items = docs.data?.pages.flatMap((p) => p.items) ?? [];
  const searchIds = new Set(
    (search.data ?? []).filter((r) => r.type === 'document').map((r) => r.id),
  );

  const upload = async (files: FileList | File[]) => {
    const list = [...files];
    const tooBig = list.filter((f) => f.size > MAX_BYTES);
    const ok = list.filter((f) => f.size <= MAX_BYTES);
    if (tooBig.length)
      toast({
        message: `${tooBig.map((f) => f.name).join(', ')}: over 25 MB, not uploaded`,
        tone: 'error',
      });
    if (!ok.length) return;
    setUploading({ done: 0, total: ok.length });
    let failed = 0;
    for (const [i, f] of ok.entries()) {
      try {
        await uploadDocument(f, folder);
      } catch (err) {
        failed++;
        toast({ message: `${f.name}: ${errorMessage(err)}`, tone: 'error' });
      }
      setUploading({ done: i + 1, total: ok.length });
    }
    setUploading(null);
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    const n = ok.length - failed;
    if (n)
      toast({
        message: `Uploaded ${n} ${n === 1 ? 'file' : 'files'}${folder ? ` to ${folder}` : ''}`,
      });
  };

  const toggleView = (v: 'list' | 'grid') => {
    setView(v);
    writeJSON('docs:view', v);
  };

  const shown = searching ? [] : items;

  return (
    <div
      className={cn(
        'relative mt-4',
        dragging && 'outline-dashed outline-2 outline-offset-8 outline-accent/60',
      )}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes('Files')) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(e) => e.currentTarget === e.target && setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (e.dataTransfer.files.length) void upload(e.dataTransfer.files);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <FilterSearch value={q} onChange={(v) => set('q', v)} placeholder="Search files by name" />
        <div className="flex rounded border border-line p-0.5" role="radiogroup" aria-label="View">
          {(['list', 'grid'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={view === v}
              aria-label={v === 'list' ? 'List' : 'Grid'}
              onClick={() => toggleView(v)}
              className={cn(
                'flex h-9 w-9 items-center justify-center rounded-sm sm:h-7 sm:w-7',
                view === v ? 'bg-surface-2 text-ink' : 'text-ink-faint hover:text-ink',
              )}
            >
              {v === 'list' ? <List className="h-4 w-4" /> : <LayoutGrid className="h-4 w-4" />}
            </button>
          ))}
        </div>
        <Button variant="primary" onClick={() => fileInput.current?.click()} busy={!!uploading}>
          <Upload className="h-4 w-4" />
          {uploading ? `Uploading ${uploading.done + 1} of ${uploading.total}…` : 'Upload'}
        </Button>
        <input
          ref={fileInput}
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

      {!searching && (
        <div
          className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
          role="group"
          aria-label="Folders"
        >
          <Chip on={!folder && !favorite} onClick={() => setParams({}, { replace: true })}>
            All files
          </Chip>
          <Chip
            on={favorite}
            onClick={() => setParams(favorite ? {} : { fav: '1' }, { replace: true })}
          >
            <Star className="h-3 w-3" /> Favorites
          </Chip>
          {folders.data?.map((f) => (
            <Chip
              key={f.folder}
              on={folder === f.folder}
              onClick={() =>
                setParams(folder === f.folder ? {} : { folder: f.folder }, { replace: true })
              }
            >
              {f.folder} <span className="text-ink-faint">{f.count}</span>
            </Chip>
          ))}
        </div>
      )}

      <p className="mt-3 text-2xs text-ink-faint">
        Files are stored privately on your server, not encrypted. Truly sensitive documents belong
        in the Private Vault.
        {folder && ` New uploads go to “${folder}”.`}
      </p>

      <div className="mt-3">
        {searching ? (
          search.isLoading ? (
            <Loading label="Searching…" />
          ) : !searchIds.size ? (
            <Empty>No file names match “{deferredQ.trim()}”.</Empty>
          ) : (
            <SearchList
              ids={[...searchIds]}
              results={search.data ?? []}
              onOpen={(id) => set('doc', id)}
            />
          )
        ) : docs.isLoading ? (
          <Loading />
        ) : docs.isError ? (
          <ErrorNote onRetry={() => void docs.refetch()}>{errorMessage(docs.error)}</ErrorNote>
        ) : !shown.length ? (
          <Empty
            action={
              <button
                type="button"
                onClick={() => fileInput.current?.click()}
                className="text-accent hover:underline"
              >
                Upload a file
              </button>
            }
          >
            {folder
              ? `Nothing in “${folder}” yet.`
              : favorite
                ? 'Star a file to keep it here.'
                : 'PDFs, images, scans, anything worth keeping. You can also drop files here.'}
          </Empty>
        ) : view === 'list' ? (
          <ul className="divide-y divide-line/70 border-y border-line/70">
            {shown.map((d) => (
              <li key={d.id} className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => set('doc', d.id)}
                  className="-mx-2 flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-2.5 text-left hover:bg-surface/70"
                >
                  <FileThumb doc={d} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[0.9375rem] text-ink">{d.name}</span>
                    <span className="block truncate text-2xs text-ink-faint">
                      {fileKind(d.mime, d.name)} · {formatSize(d.size)} · {formatAgo(d.createdAt)}
                      {d.folder && !folder && ` · ${d.folder}`}
                    </span>
                  </span>
                </button>
                <button
                  type="button"
                  aria-label={
                    d.favorite ? `Remove ${d.name} from favorites` : `Add ${d.name} to favorites`
                  }
                  aria-pressed={d.favorite}
                  onClick={() => update.mutate({ id: d.id, patch: { favorite: !d.favorite } })}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-ink-faint hover:bg-surface-2 hover:text-ink sm:h-8 sm:w-8"
                >
                  <Star className={cn('h-4 w-4', d.favorite && 'fill-warn text-warn')} />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {shown.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => set('doc', d.id)}
                  className="block w-full text-left"
                >
                  <FileThumb doc={d} size="lg" />
                  <span className="mt-1.5 block truncate text-sm text-ink">{d.name}</span>
                  <span className="block truncate text-2xs text-ink-faint">
                    {fileKind(d.mime, d.name)} · {formatSize(d.size)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {!searching && docs.hasNextPage && (
          <Button
            className="mt-6"
            onClick={() => void docs.fetchNextPage()}
            busy={docs.isFetchingNextPage}
          >
            Show more
          </Button>
        )}
      </div>

      <DocumentPreview
        id={openId}
        onClose={() => set('doc', undefined)}
        folders={folders.data?.map((f) => f.folder) ?? []}
      />
    </div>
  );
}

function Chip({
  on,
  onClick,
  children,
}: {
  on: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-sm px-2.5 text-[0.8125rem] sm:h-7',
        on
          ? 'bg-accent/15 text-ink ring-1 ring-accent/50'
          : 'bg-surface-2/60 text-ink-muted hover:text-ink',
      )}
    >
      {children}
    </button>
  );
}

function SearchList({
  ids,
  results,
  onOpen,
}: {
  ids: string[];
  results: { id: string; title: string; snippet: string; date: string }[];
  onOpen: (id: string) => void;
}) {
  return (
    <ul className="divide-y divide-line/70 border-y border-line/70">
      {results
        .filter((r) => ids.includes(r.id))
        .map((r) => (
          <li key={r.id}>
            <button
              type="button"
              onClick={() => onOpen(r.id)}
              className="-mx-2 block w-full rounded px-2 py-3 text-left hover:bg-surface/70"
            >
              <span className="block truncate text-[0.9375rem] text-ink">{r.title}</span>
              <span className="block truncate text-2xs text-ink-faint">
                {r.snippet ? `${r.snippet} · ` : ''}
                {formatAgo(r.date)}
              </span>
            </button>
          </li>
        ))}
    </ul>
  );
}
