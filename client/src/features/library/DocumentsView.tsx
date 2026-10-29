import {
  Download,
  Eye,
  FileText,
  FolderInput,
  FolderOpen,
  FolderPlus,
  Pencil,
  Info,
  SquareCheck,
  Star,
  StarOff,
  Trash2,
  Upload,
} from 'lucide-react';
import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { DocumentFile, DocumentFolder, FolderUsage } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { PointMenu, type MenuItem } from '../../components/ui/Menu';
import { Empty, ErrorNote } from '../../components/ui/misc';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { readJSON, writeJSON } from '../../lib/storage';
import {
  fileUrl,
  formatSize,
  folderUsage,
  useCreateFolder,
  useDeleteFolder,
  useDeleteItems,
  useDocumentSearch,
  useFolderDocuments,
  useFolderSizes,
  useFolders,
  useMoveItems,
  useRecentDocuments,
  useStarredDocuments,
  useUpdateDocument,
  useUpdateFolder,
} from './api';
import { countLabel, DeleteFolderDialog, usageLabel } from './DeleteFolderDialog';
import { DocumentPreview } from './DocumentPreview';
import { FolderPanel } from './FolderPanel';
import {
  buildTree,
  defaultDir,
  fileItemKey,
  folderItemKey,
  locationLabel,
  matchFolders,
  SORT_LABEL,
  sortFiles,
  sortFolders,
  splitKeys,
  type ItemKey,
  type Sort,
  type SortKey,
} from './folderTree';
import {
  DRAG_TYPE,
  entryName,
  GridView,
  ItemsSkeleton,
  ListView,
  type Entry,
  type ItemHandlers,
} from './LibraryItems';
import { FileMetadata, FolderMetadata } from './ItemMetadata';
import { Breadcrumbs, ScopeTabs, SelectionBar, Toolbar, type Scope } from './LibraryToolbar';
import { MoveDialog, type MoveTarget } from './MoveDialog';
import { NameDialog } from './NameDialog';
import { MAX_UPLOAD_BYTES, UploadPanel, useUploadQueue } from './UploadQueue';

type Naming =
  | { kind: 'newFolder'; parentId: string | null }
  | { kind: 'renameFolder'; folder: DocumentFolder }
  | { kind: 'renameFile'; file: DocumentFile };

const folderEntry = (folder: DocumentFolder): Entry => ({
  kind: 'folder',
  key: folderItemKey(folder.id),
  folder,
});
const fileEntry = (file: DocumentFile): Entry => ({
  kind: 'file',
  key: fileItemKey(file.id),
  file,
});
const parentOf = (e: Entry) => (e.kind === 'folder' ? e.folder.parentId : e.file.folderId);

function storedSort(): Sort {
  const s = readJSON<Sort>('docs:sort');
  return s && s.key in SORT_LABEL && (s.dir === 'asc' || s.dir === 'desc')
    ? s
    : { key: 'name', dir: 'asc' };
}

function download(file: DocumentFile) {
  const a = document.createElement('a');
  a.href = fileUrl(file.id, { download: true });
  a.download = file.name;
  document.body.append(a);
  a.click();
  a.remove();
}

/** Parses a library drag payload, ignoring anything that isn't a list of item keys. */
function draggedKeys(ev: React.DragEvent): ItemKey[] | null {
  const raw = ev.dataTransfer.getData(DRAG_TYPE);
  if (!raw) return null;
  try {
    const keys: unknown = JSON.parse(raw);
    return Array.isArray(keys)
      ? keys.filter((k): k is ItemKey => typeof k === 'string' && /^[df]:[\w-]+$/.test(k))
      : null;
  } catch {
    return null;
  }
}

/**
 * The file manager: folders you can nest, files in them, and Recent / Starred views across all
 * of them. Everything lives in the URL (`folder`, `view`, `q`, `doc`) so Back and links work.
 */
export function DocumentsView() {
  const [params, setParams] = useSearchParams();
  const viewParam = params.get('view');
  const scope: Scope =
    viewParam === 'recent'
      ? 'recent'
      : viewParam === 'starred' || params.get('fav') === '1'
        ? 'starred'
        : 'files';
  const folderId = scope === 'files' ? params.get('folder') : null;
  const openId = params.get('doc');
  const q = params.get('q') ?? '';
  const deferredQ = useDeferredValue(q.trim());
  const searching = deferredQ.length >= 2;

  /** Moving around (folder, view, preview) adds history; typing a search replaces it. */
  const update = useCallback(
    (changes: Record<string, string | null>, push: boolean) =>
      setParams(
        (p) => {
          for (const [k, v] of Object.entries(changes)) {
            if (v) p.set(k, v);
            else p.delete(k);
          }
          return p;
        },
        { replace: !push },
      ),
    [setParams],
  );
  const goFolder = (id: string | null) =>
    update({ folder: id, view: null, fav: null, q: null, doc: null }, true);
  const goScope = (s: Scope) =>
    update({ view: s === 'files' ? null : s, fav: null, folder: null, q: null }, true);
  const openFile = (id: string) => update({ doc: id }, true);

  const folders = useFolders();
  const sizes = useFolderSizes();
  const tree = useMemo(() => buildTree(folders.data ?? []), [folders.data]);
  const current = folderId ? tree.byId.get(folderId) : undefined;
  const missing = !!folderId && folders.isSuccess && !current;
  /** Where uploads and new folders go from this view. */
  const here = scope === 'files' && !missing ? folderId : null;

  const inFolder = useFolderDocuments(folderId, scope === 'files' && !searching && !missing);
  const recent = useRecentDocuments(scope === 'recent' && !searching);
  const starred = useStarredDocuments(scope === 'starred' && !searching);
  const found = useDocumentSearch(searching ? deferredQ : '');

  const [view, setView] = useState<'list' | 'grid'>(() =>
    readJSON('docs:view') === 'grid' ? 'grid' : 'list',
  );
  const [sort, setSort] = useState<Sort>(storedSort);
  const changeView = (v: 'list' | 'grid') => {
    setView(v);
    writeJSON('docs:view', v);
  };
  const changeSort = (s: Sort) => {
    setSort(s);
    writeJSON('docs:sort', s);
  };
  const sortBy = (key: SortKey) =>
    changeSort(
      sort.key === key
        ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' }
        : { key, dir: defaultDir(key) },
    );

  // ---------------------------------------------------------------- what is shown
  const sortable = searching || scope !== 'recent';
  const source = searching
    ? found
    : scope === 'files'
      ? inFolder
      : scope === 'starred'
        ? starred
        : recent;
  const shownFolders = searching
    ? matchFolders(folders.data ?? [], deferredQ)
    : scope === 'files'
      ? tree.children(folderId)
      : [];
  const shownFiles = searching
    ? (found.data ?? [])
    : scope === 'files'
      ? (inFolder.data ?? [])
      : scope === 'starred'
        ? (starred.data ?? [])
        : (recent.data?.pages.flatMap((p) => p.items) ?? []);
  const entries: Entry[] = sortable
    ? [
        ...sortFolders(shownFolders, sort).map(folderEntry),
        ...sortFiles(shownFiles, sort).map(fileEntry),
      ]
    : [...shownFolders.map(folderEntry), ...shownFiles.map(fileEntry)];
  const loading = source.isLoading || (scope === 'files' && folders.isLoading);
  const error = source.isError ? source.error : folders.isError ? folders.error : null;
  const showLocation = searching || scope !== 'files';

  // ---------------------------------------------------------------- selection
  const [selected, setSelected] = useState<Set<ItemKey>>(() => new Set());
  const anchor = useRef<ItemKey | null>(null);
  const place = `${scope}|${folderId}|${deferredQ}`;
  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
  }, [place]);
  // Only what is on screen counts (deleted or moved-away items drop out by themselves).
  const chosen = entries.filter((e) => selected.has(e.key));
  const selecting = chosen.length > 0;
  const allSelected = entries.length > 0 && chosen.length === entries.length;
  const clearSelection = () => setSelected(new Set());

  const toggle = (e: Entry, range: boolean) => {
    const from = anchor.current;
    const keys = entries.map((x) => x.key);
    setSelected((prev) => {
      const next = new Set([...prev].filter((k) => keys.includes(k)));
      if (range && from && keys.includes(from)) {
        const [i, j] = [keys.indexOf(from), keys.indexOf(e.key)];
        for (const k of keys.slice(Math.min(i, j), Math.max(i, j) + 1)) next.add(k);
      } else if (next.has(e.key)) next.delete(e.key);
      else next.add(e.key);
      return next;
    });
    if (!range) anchor.current = e.key;
  };
  const toggleAll = () => setSelected(allSelected ? new Set() : new Set(entries.map((e) => e.key)));

  // ---------------------------------------------------------------- actions
  const createFolder = useCreateFolder();
  const updateFolder = useUpdateFolder();
  const updateDoc = useUpdateDocument();
  const moveItems = useMoveItems();
  const deleteItems = useDeleteItems();
  const deleteFolder = useDeleteFolder();
  const confirm = useConfirm();
  const toast = useToast();
  const fail = (err: unknown) => toast({ message: errorMessage(err), tone: 'error' });

  const [naming, setNaming] = useState<Naming | null>(null);
  const [moving, setMoving] = useState<MoveTarget | null>(null);
  const [deleting, setDeleting] = useState<{ folder: DocumentFolder; usage: FolderUsage } | null>(
    null,
  );
  const [metaFor, setMetaFor] = useState<Entry | null>(null);
  const [details, setDetails] = useState<DocumentFolder | null>(null);
  const [pointMenu, setPointMenu] = useState<{
    at: { x: number; y: number };
    items: MenuItem[];
    label: string;
  } | null>(null);

  /** “Taxes”, 3 files, 2 folders, 5 items. */
  const describe = (list: Entry[]) => {
    if (list.length === 1) return `“${entryName(list[0]!)}”`;
    const kinds = new Set(list.map((e) => e.kind));
    if (kinds.size === 2) return countLabel(list.length, 'item', 'items');
    return kinds.has('file')
      ? countLabel(list.length, 'file', 'files')
      : countLabel(list.length, 'folder', 'folders');
  };

  const askMove = (list: Entry[]) =>
    setMoving({
      title: `Move ${describe(list)}`,
      ...splitKeys(list.map((e) => e.key)),
      from: list.map(parentOf),
    });

  /** Rejects on failure so the move dialog can show the reason. */
  const move = (items: { fileIds: string[]; folderIds: string[] }, targetId: string | null) =>
    moveItems
      .mutateAsync({ fileIds: items.fileIds, folderIds: items.folderIds, targetId })
      .then((r) => {
        clearSelection();
        const n = r.files + r.folders;
        if (n) {
          toast({
            message: `Moved ${countLabel(n, 'item', 'items')} to ${locationLabel(tree, targetId)}`,
            action: { label: 'Open', onClick: () => goFolder(targetId) },
          });
        }
      });

  const star = (files: DocumentFile[], favorite: boolean) =>
    Promise.all(files.map((f) => updateDoc.mutateAsync({ id: f.id, patch: { favorite } }))).catch(
      fail,
    );

  /** After folders are deleted: if the one being viewed went with them, go up to what's left. */
  const afterDelete = (folderIds: string[]) => {
    clearSelection();
    toast({ message: 'Deleted' });
    const gone = (id: string) => folderIds.some((d) => tree.isWithin(id, d));
    if (folderId && gone(folderId)) {
      goFolder(
        tree
          .path(folderId)
          .filter((f) => !gone(f.id))
          .at(-1)?.id ?? null,
      );
    }
  };

  /**
   * Files and empty folders: one confirmation. A single folder with things inside: a choice
   * between keeping its contents (moved up) and deleting everything. Several items including
   * folders: the confirmation spells out how much is inside them.
   */
  const askDelete = async (list: Entry[]) => {
    if (!list.length) return;
    const { fileIds, folderIds } = splitKeys(list.map((e) => e.key));
    try {
      const only = list.length === 1 ? list[0]! : null;
      if (only?.kind === 'folder') {
        const usage = await folderUsage([only.folder.id]);
        if (usage.files || usage.folders) return setDeleting({ folder: only.folder, usage });
        const ok = await confirm({
          title: `Delete “${only.folder.name}”?`,
          message: 'The folder is empty.',
          confirmLabel: 'Delete',
          danger: true,
        });
        if (ok)
          await deleteFolder.mutateAsync({ id: only.folder.id }).then(() => afterDelete(folderIds));
        return;
      }
      const inside = folderIds.length ? await folderUsage(folderIds) : null;
      const message =
        inside && (inside.files || inside.folders)
          ? `The folders contain ${usageLabel(inside)}. Everything is removed for good, including the stored files.`
          : list.length === 1
            ? 'The file is removed for good.'
            : 'They are removed for good.';
      const ok = await confirm({
        title: `Delete ${describe(list)}?`,
        message,
        confirmLabel: 'Delete',
        danger: true,
      });
      if (ok)
        await deleteItems.mutateAsync({ fileIds, folderIds }).then(() => afterDelete(folderIds));
    } catch (err) {
      fail(err);
    }
  };

  const submitName = (name: string): Promise<unknown> => {
    if (!naming) return Promise.resolve();
    if (naming.kind === 'newFolder') {
      return createFolder.mutateAsync({ name, parentId: naming.parentId }).then((f) =>
        toast({
          message: `Created “${f.name}”`,
          action: { label: 'Open', onClick: () => goFolder(f.id) },
        }),
      );
    }
    if (naming.kind === 'renameFolder') {
      return updateFolder.mutateAsync({ id: naming.folder.id, patch: { name } });
    }
    return updateDoc.mutateAsync({ id: naming.file.id, patch: { name } });
  };

  // ---------------------------------------------------------------- menus
  const menuFor = (e: Entry): MenuItem[] => {
    const rename: MenuItem = {
      label: 'Rename',
      icon: <Pencil />,
      onSelect: () =>
        setNaming(
          e.kind === 'folder'
            ? { kind: 'renameFolder', folder: e.folder }
            : { kind: 'renameFile', file: e.file },
        ),
    };
    const moveItem: MenuItem = {
      label: 'Move',
      icon: <FolderInput />,
      onSelect: () => askMove([e]),
    };
    const select: MenuItem[] = selected.has(e.key)
      ? []
      : [{ label: 'Select', icon: <SquareCheck />, onSelect: () => toggle(e, false) }];
    const remove: MenuItem = {
      label: 'Delete',
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void askDelete([e]),
    };
    if (e.kind === 'folder') {
      return [
        { label: 'Open', icon: <FolderOpen />, onSelect: () => goFolder(e.folder.id) },
        { label: 'Details & links', icon: <Info />, onSelect: () => setDetails(e.folder) },
        { label: 'Metadata', icon: <FileText />, onSelect: () => setMetaFor(e) },
        rename,
        moveItem,
        ...(showLocation
          ? [
              {
                label: 'Show location',
                icon: <FolderOpen />,
                onSelect: () => goFolder(e.folder.parentId),
              },
            ]
          : []),
        ...select,
        remove,
      ];
    }
    const f = e.file;
    return [
      { label: 'Preview', icon: <Eye />, onSelect: () => openFile(f.id) },
      { label: 'Download', icon: <Download />, onSelect: () => download(f) },
      { label: 'Metadata', icon: <FileText />, onSelect: () => setMetaFor(e) },
      rename,
      moveItem,
      {
        label: f.favorite ? 'Unstar' : 'Star',
        icon: f.favorite ? <StarOff /> : <Star />,
        onSelect: () => void star([f], !f.favorite),
      },
      ...(showLocation
        ? [{ label: 'Show in folder', icon: <FolderOpen />, onSelect: () => goFolder(f.folderId) }]
        : []),
      ...select,
      remove,
    ];
  };

  const chosenFiles = chosen.flatMap((e) => (e.kind === 'file' ? [e.file] : []));
  const starChosen = () => void star(chosenFiles, !chosenFiles.every((f) => f.favorite));
  const bulkMenu = (): MenuItem[] => [
    {
      label: `Move ${chosen.length} items`,
      icon: <FolderInput />,
      onSelect: () => askMove(chosen),
    },
    ...(chosenFiles.length
      ? [{ label: 'Star / unstar', icon: <Star />, onSelect: starChosen }]
      : []),
    {
      label: `Delete ${chosen.length} items`,
      icon: <Trash2 />,
      danger: true,
      onSelect: () => void askDelete(chosen),
    },
  ];

  const currentEntry = current ? folderEntry(current) : null;
  const currentMenu: MenuItem[] = currentEntry
    ? [
        {
          label: 'New folder here',
          icon: <FolderPlus />,
          onSelect: () => setNaming({ kind: 'newFolder', parentId: here }),
        },
        {
          label: 'Upload files here',
          icon: <Upload />,
          onSelect: () => fileInput.current?.click(),
        },
        ...menuFor(currentEntry).filter((m) =>
          ['Details & links', 'Rename', 'Move', 'Delete'].includes(m.label),
        ),
      ]
    : [];

  // ---------------------------------------------------------------- uploads & drag and drop
  const uploads = useUploadQueue();
  const fileInput = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const startUpload = (list: FileList | File[], target: string | null) => {
    const all = [...list];
    const tooBig = all.filter((f) => f.size > MAX_UPLOAD_BYTES);
    if (tooBig.length) {
      toast({
        message: `${tooBig.map((f) => f.name).join(', ')}: over 25 MB, not uploaded`,
        tone: 'error',
      });
    }
    const ok = all.filter((f) => f.size <= MAX_UPLOAD_BYTES);
    if (ok.length) uploads.add(ok, target, locationLabel(tree, target));
  };

  /** Library items dropped on a folder move there; files from the computer upload there. */
  const dropOn = (targetId: string | null, ev: React.DragEvent) => {
    const keys = draggedKeys(ev);
    if (keys) {
      const items = splitKeys(keys);
      if (targetId && items.folderIds.includes(targetId)) return; // dropped on itself
      void move(items, targetId).catch(fail);
    } else if (ev.dataTransfer.files.length) {
      startUpload(ev.dataTransfer.files, targetId);
    }
  };

  const handlers: ItemHandlers = {
    selected,
    onActivate: (e, how) => {
      if (how.toggle || how.range || selecting) return toggle(e, how.range);
      if (e.kind === 'folder') goFolder(e.folder.id);
      else openFile(e.file.id);
    },
    onToggle: toggle,
    menuFor,
    onContextMenu: (e, at) => {
      const bulk = chosen.length > 1 && selected.has(e.key);
      setPointMenu({
        at,
        items: bulk ? bulkMenu() : menuFor(e),
        label: bulk ? `${chosen.length} selected` : entryName(e),
      });
    },
    onStar: (f) => void star([f], !f.favorite),
    onDragStart: (e, ev) => {
      const keys = selected.has(e.key) ? chosen.map((x) => x.key) : [e.key];
      ev.dataTransfer.setData(DRAG_TYPE, JSON.stringify(keys));
      ev.dataTransfer.effectAllowed = 'move';
    },
    onDropOnFolder: (id, ev) => dropOn(id, ev),
    locate: showLocation ? (id) => locationLabel(tree, id) : undefined,
    folderBytes: (id) => (sizes.data ? (sizes.data.folders[id]?.bytes ?? 0) : undefined),
  };

  // ---------------------------------------------------------------- keyboard
  // Escape clears the selection, Delete deletes it, Ctrl/Cmd+A selects everything shown.
  const onKey = useRef<(ev: KeyboardEvent) => void>(() => {});
  onKey.current = (ev) => {
    const t = ev.target as HTMLElement;
    if (
      t.closest('input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]')
    )
      return;
    if (ev.key === 'Escape' && selecting) clearSelection();
    else if (ev.key === 'Delete' && selecting) void askDelete(chosen);
    else if (ev.key === 'a' && (ev.ctrlKey || ev.metaKey) && entries.length) {
      ev.preventDefault();
      setSelected(new Set(entries.map((e) => e.key)));
    }
  };
  useEffect(() => {
    const listener = (ev: KeyboardEvent) => onKey.current(ev);
    document.addEventListener('keydown', listener);
    return () => document.removeEventListener('keydown', listener);
  }, []);

  // ---------------------------------------------------------------- render
  const folderCount = entries.filter((e) => e.kind === 'folder').length;
  const fileCount = entries.length - folderCount;
  // What this folder holds in total (with everything below it); the whole library at the top.
  const storedHere =
    scope === 'files' && !searching && sizes.data
      ? folderId
        ? (sizes.data.folders[folderId]?.bytes ?? 0)
        : sizes.data.total.bytes
      : null;
  const summary = [
    folderCount && countLabel(folderCount, 'folder', 'folders'),
    fileCount && countLabel(fileCount, 'file', 'files'),
    storedHere && `${formatSize(storedHere)} stored`,
  ]
    .filter(Boolean)
    .join(' · ');
  const newFolder = () => setNaming({ kind: 'newFolder', parentId: here });
  const pickFiles = () => fileInput.current?.click();
  const quiet = 'text-accent hover:underline';

  return (
    <div
      className={cn(
        'relative mt-4',
        dragging && 'rounded outline-dashed outline-2 outline-offset-8 outline-accent/60',
      )}
      onDragOver={(ev) => {
        if (ev.dataTransfer.types.includes('Files')) {
          ev.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={(ev) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setDragging(false);
      }}
      onDrop={(ev) => {
        setDragging(false);
        if (!ev.dataTransfer.files.length) return;
        ev.preventDefault();
        startUpload(ev.dataTransfer.files, here);
      }}
    >
      <div className="sticky top-0 z-20 -mx-4 bg-bg px-4 py-2 sm:mx-0 sm:px-0">
        {selecting ? (
          <SelectionBar
            count={chosen.length}
            canStar={chosenFiles.length > 0}
            onClear={clearSelection}
            onMove={() => askMove(chosen)}
            onStar={starChosen}
            onDelete={() => void askDelete(chosen)}
          />
        ) : (
          <Toolbar
            q={q}
            onQuery={(v) => update({ q: v || null }, false)}
            onNewFolder={newFolder}
            onUpload={pickFiles}
            sort={sortable ? sort : null}
            onSort={changeSort}
            view={view}
            onView={changeView}
          />
        )}
      </div>
      <input
        ref={fileInput}
        type="file"
        multiple
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => {
          if (e.target.files?.length) startUpload(e.target.files, here);
          e.target.value = '';
        }}
      />

      <div className="mt-2">
        <ScopeTabs scope={scope} onScope={goScope} />
      </div>
      <div className="mt-3 flex min-h-[2.75rem] items-center gap-3 border-b border-line pb-1 sm:min-h-[2.5rem]">
        <div className="min-w-0 flex-1">
          {searching ? (
            <h2 className="truncate text-sm text-ink-muted">
              Results for <span className="text-ink">“{deferredQ}”</span> in all folders
            </h2>
          ) : scope === 'files' ? (
            <Breadcrumbs
              path={tree.path(folderId)}
              onGo={goFolder}
              onDrop={dropOn}
              currentMenu={currentMenu}
            />
          ) : (
            <h2 className="font-serif text-[1.0625rem] font-medium text-ink">
              {scope === 'recent' ? 'Recently added' : 'Starred'}
            </h2>
          )}
        </div>
        {!loading && summary && (
          <span className="hidden shrink-0 text-2xs text-ink-faint sm:inline">{summary}</span>
        )}
        {!searching && current && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setDetails(current)}
            aria-label="Folder details and links"
            className="shrink-0 px-2"
          >
            <Info className="h-4 w-4" />
            <span className="hidden text-[0.8125rem] sm:inline">Details</span>
          </Button>
        )}
      </div>

      <div className="mt-2">
        {missing ? (
          <Empty
            action={
              <button type="button" onClick={() => goFolder(null)} className={quiet}>
                Go to My files
              </button>
            }
          >
            This folder no longer exists. It may have been moved or deleted on another device.
          </Empty>
        ) : loading ? (
          <ItemsSkeleton view={view} />
        ) : error ? (
          <ErrorNote
            onRetry={() => {
              void source.refetch();
              void folders.refetch();
            }}
          >
            {errorMessage(error)}
          </ErrorNote>
        ) : !entries.length ? (
          <EmptyState
            kind={searching ? 'search' : scope === 'files' ? (folderId ? 'folder' : 'root') : scope}
            q={deferredQ}
            onNewFolder={newFolder}
            onUpload={pickFiles}
          />
        ) : view === 'list' ? (
          <ListView
            entries={entries}
            sort={sortable ? sort : null}
            onSort={sortBy}
            allSelected={allSelected}
            onToggleAll={toggleAll}
            h={handlers}
          />
        ) : (
          <div className="pt-2">
            <GridView entries={entries} selecting={selecting} h={handlers} />
          </div>
        )}
        {!searching && scope === 'recent' && recent.hasNextPage && (
          <Button
            className="mt-6"
            onClick={() => void recent.fetchNextPage()}
            busy={recent.isFetchingNextPage}
          >
            Show more
          </Button>
        )}
      </div>

      <p className="mt-8 text-2xs text-ink-faint">
        Files are stored privately on your server, not encrypted. Truly sensitive documents belong
        in the Private Vault.
      </p>

      <UploadPanel items={uploads.items} onRetry={uploads.retry} onClear={uploads.clear} />
      <PointMenu
        at={pointMenu?.at ?? null}
        items={pointMenu?.items ?? []}
        label={pointMenu?.label ?? ''}
        onClose={() => setPointMenu(null)}
      />
      <NameDialog
        open={!!naming}
        title={
          naming?.kind === 'newFolder'
            ? 'New folder'
            : naming?.kind === 'renameFolder'
              ? 'Rename folder'
              : 'Rename file'
        }
        initial={
          naming?.kind === 'renameFolder'
            ? naming.folder.name
            : naming?.kind === 'renameFile'
              ? naming.file.name
              : ''
        }
        confirmLabel={naming?.kind === 'newFolder' ? 'Create' : 'Rename'}
        maxLength={naming?.kind === 'renameFile' ? 200 : 100}
        selectStem={naming?.kind === 'renameFile'}
        onClose={() => setNaming(null)}
        onSubmit={submitName}
      />
      <MoveDialog
        target={moving}
        tree={tree}
        onClose={() => setMoving(null)}
        onMove={(targetId) => (moving ? move(moving, targetId) : Promise.resolve())}
      />
      <DeleteFolderDialog
        target={deleting}
        parentName={
          deleting?.folder.parentId
            ? (tree.byId.get(deleting.folder.parentId)?.name ?? 'My files')
            : 'My files'
        }
        onClose={() => setDeleting(null)}
        onDelete={(contents) =>
          deleteFolder
            .mutateAsync({ id: deleting!.folder.id, contents })
            .then(() => afterDelete([deleting!.folder.id]))
            .catch((err) => {
              fail(err);
              throw err;
            })
        }
      />
      <DocumentPreview
        id={openId}
        tree={tree}
        onClose={() => update({ doc: null }, false)}
        onMove={(file) => askMove([fileEntry(file)])}
        onShowFolder={goFolder}
        siblings={entries.flatMap((e) => (e.kind === 'file' ? [e.file] : []))}
        onNavigate={(id) => update({ doc: id }, false)}
      />
      <FileMetadata
        file={metaFor?.kind === 'file' ? metaFor.file : null}
        tree={tree}
        onClose={() => setMetaFor(null)}
      />
      <FolderMetadata
        folder={metaFor?.kind === 'folder' ? metaFor.folder : null}
        tree={tree}
        onClose={() => setMetaFor(null)}
      />
      <FolderPanel
        folder={details}
        tree={tree}
        onClose={() => setDetails(null)}
        onOpen={(f) => {
          setDetails(null);
          goFolder(f.id);
        }}
        onRename={(f) => setNaming({ kind: 'renameFolder', folder: f })}
        onMove={(f) => askMove([folderEntry(f)])}
      />
    </div>
  );
}

function EmptyState({
  kind,
  q,
  onNewFolder,
  onUpload,
}: {
  kind: 'search' | 'root' | 'folder' | 'recent' | 'starred';
  q: string;
  onNewFolder: () => void;
  onUpload: () => void;
}) {
  const actions = (
    <span className="flex gap-4">
      <button type="button" onClick={onUpload} className="text-accent hover:underline">
        Upload files
      </button>
      <button type="button" onClick={onNewFolder} className="text-accent hover:underline">
        New folder
      </button>
    </span>
  );
  if (kind === 'search') return <Empty>No files or folders match “{q}”.</Empty>;
  if (kind === 'starred') return <Empty>Star a file to keep it here.</Empty>;
  if (kind === 'recent') {
    return <Empty action={actions}>Files you upload show up here, newest first.</Empty>;
  }
  return (
    <Empty action={actions}>
      {kind === 'folder'
        ? 'This folder is empty.'
        : 'PDFs, images, scans, anything worth keeping. Make folders to sort them, or drop files here.'}
    </Empty>
  );
}
