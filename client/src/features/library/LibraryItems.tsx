import { ArrowDown, ArrowUp, EllipsisVertical, Star } from 'lucide-react';
import { useState } from 'react';
import type { DocumentFile, DocumentFolder } from '../../../../shared/types';
import { IconButton } from '../../components/ui/Button';
import { Checkbox } from '../../components/ui/Checkbox';
import { Menu, type MenuItem } from '../../components/ui/Menu';
import { cn } from '../../lib/cn';
import { formatAgo } from '../../lib/dates';
import { fileKind, formatSize } from './api';
import { FileThumb, FolderGlyph } from './FileIcons';
import { SORT_LABEL, type ItemKey, type Sort, type SortKey } from './folderTree';

export type Entry =
  | { kind: 'folder'; key: ItemKey; folder: DocumentFolder }
  | { kind: 'file'; key: ItemKey; file: DocumentFile };

export const entryName = (e: Entry) => (e.kind === 'folder' ? e.folder.name : e.file.name);

/** Drag payload type for moving items inside the library (OS files arrive as 'Files'). */
export const DRAG_TYPE = 'application/x-notebook-library';

export interface ItemHandlers {
  selected: Set<ItemKey>;
  /** Click on an item: opens it, or changes the selection (Ctrl/⌘, Shift, or while selecting). */
  onActivate: (e: Entry, how: { toggle: boolean; range: boolean }) => void;
  onToggle: (e: Entry, range: boolean) => void;
  menuFor: (e: Entry) => MenuItem[];
  onContextMenu: (e: Entry, at: { x: number; y: number }) => void;
  onStar: (f: DocumentFile) => void;
  /** Starts dragging this item (or the whole selection when it is part of it). */
  onDragStart: (e: Entry, ev: React.DragEvent) => void;
  /** Something was dropped on a folder: library items or files from the computer. */
  onDropOnFolder: (folderId: string, ev: React.DragEvent) => void;
  /** "Taxes / 2025" under each item, for search results and Recent/Starred. */
  locate?: (folderId: string | null) => string;
}

/** Shown on hover or focus with a mouse; always shown on touch screens (no hover there). */
const HOVER_ONLY =
  'opacity-0 focus-visible:opacity-100 group-hover/item:opacity-100 group-focus-within/item:opacity-100 [@media(hover:none)]:opacity-100';

/** Like HOVER_ONLY, but stays hidden on touch screens (selection starts from the item menu). */
const HOVER_REVEAL =
  'opacity-0 focus-visible:opacity-100 [@media(hover:hover)]:group-hover/item:opacity-100';

const isDroppable = (ev: React.DragEvent) =>
  ev.dataTransfer.types.includes(DRAG_TYPE) || ev.dataTransfer.types.includes('Files');

/** Highlight + drop handling for folders (rows, tiles, breadcrumbs). */
export function useDropTarget(onDrop: (ev: React.DragEvent) => void) {
  const [over, setOver] = useState(false);
  return {
    over,
    props: {
      onDragOver: (ev: React.DragEvent) => {
        if (!isDroppable(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        ev.dataTransfer.dropEffect = ev.dataTransfer.types.includes(DRAG_TYPE) ? 'move' : 'copy';
        setOver(true);
      },
      onDragLeave: (ev: React.DragEvent) => {
        if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) setOver(false);
      },
      onDrop: (ev: React.DragEvent) => {
        if (!isDroppable(ev)) return;
        ev.preventDefault();
        ev.stopPropagation();
        setOver(false);
        onDrop(ev);
      },
    },
  };
}

function clickHow(ev: React.MouseEvent) {
  return { toggle: ev.metaKey || ev.ctrlKey, range: ev.shiftKey };
}

function ItemMenu({ entry, h, className }: { entry: Entry; h: ItemHandlers; className?: string }) {
  return (
    <Menu
      items={h.menuFor(entry)}
      trigger={(p) => (
        <IconButton {...p} label={`Actions for ${entryName(entry)}`} className={className}>
          <EllipsisVertical className="h-4 w-4" />
        </IconButton>
      )}
    />
  );
}

const LIST_COLS =
  'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] items-center gap-x-2 sm:grid-cols-[1.75rem_minmax(0,1fr)_6.5rem_4.5rem_6.5rem_4.5rem]';

/** Compact rows with columns; the better view when a folder holds many files. */
export function ListView({
  entries,
  sort,
  onSort,
  allSelected,
  onToggleAll,
  h,
}: {
  entries: Entry[];
  /** Null when the order is fixed (Recent). */
  sort: Sort | null;
  onSort: (key: SortKey) => void;
  allSelected: boolean;
  onToggleAll: () => void;
  h: ItemHandlers;
}) {
  const header = (key: SortKey, className?: string) => {
    const on = sort?.key === key;
    const Arrow = sort?.dir === 'asc' ? ArrowUp : ArrowDown;
    return (
      <button
        type="button"
        disabled={!sort}
        onClick={() => onSort(key)}
        aria-label={`Sort by ${SORT_LABEL[key].toLowerCase()}`}
        className={cn(
          'inline-flex items-center gap-1 text-left disabled:cursor-default',
          on ? 'text-ink' : 'hover:text-ink',
          className,
        )}
      >
        {key === 'added' ? 'Added' : SORT_LABEL[key]}
        {on && <Arrow className="h-3 w-3" />}
      </button>
    );
  };
  return (
    <div>
      <div
        className={cn(
          LIST_COLS,
          'hidden h-9 border-b border-line text-2xs font-medium uppercase tracking-[0.08em] text-ink-faint sm:grid',
        )}
      >
        <Checkbox
          checked={allSelected}
          onChange={onToggleAll}
          label={allSelected ? 'Clear selection' : 'Select all'}
          className="ml-1"
        />
        {header('name')}
        {header('type')}
        {header('size')}
        {header('added')}
        <span />
      </div>
      <ul className="divide-y divide-line/70 border-b border-line/70 sm:border-b-0">
        {entries.map((e) => (
          <ListRow key={e.key} entry={e} h={h} />
        ))}
      </ul>
    </div>
  );
}

function ListRow({ entry, h }: { entry: Entry; h: ItemHandlers }) {
  const selected = h.selected.has(entry.key);
  const drop = useDropTarget(
    (ev) => entry.kind === 'folder' && h.onDropOnFolder(entry.folder.id, ev),
  );
  const isFolder = entry.kind === 'folder';
  const name = entryName(entry);
  const added = isFolder ? entry.folder.createdAt : entry.file.createdAt;
  const kind = isFolder ? 'Folder' : fileKind(entry.file.mime, entry.file.name);
  const where = h.locate?.(isFolder ? entry.folder.parentId : entry.file.folderId);

  return (
    <li
      draggable
      onDragStart={(ev) => h.onDragStart(entry, ev)}
      onContextMenu={(ev) => {
        ev.preventDefault();
        h.onContextMenu(entry, { x: ev.clientX, y: ev.clientY });
      }}
      {...(isFolder ? drop.props : {})}
      className={cn(
        LIST_COLS,
        'group/item min-h-[3.25rem] rounded-sm transition-colors',
        selected ? 'bg-accent/10' : 'hover:bg-surface/70',
        drop.over && 'bg-accent/15 ring-1 ring-inset ring-accent/60',
      )}
    >
      <Checkbox
        checked={selected}
        onChange={() => h.onToggle(entry, false)}
        label={`Select ${name}`}
        className="ml-1"
      />
      <button
        type="button"
        onClick={(ev) => h.onActivate(entry, clickHow(ev))}
        className="flex min-w-0 items-center gap-3 py-2 text-left"
      >
        {isFolder ? (
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-sm bg-accent/10">
            <FolderGlyph />
          </span>
        ) : (
          <FileThumb doc={entry.file} />
        )}
        <span className="min-w-0 flex-1">
          <span
            className={cn('block truncate text-[0.9375rem] text-ink', isFolder && 'font-medium')}
          >
            {name}
          </span>
          <span className="block truncate text-2xs text-ink-faint sm:hidden">
            {isFolder ? 'Folder' : `${kind} · ${formatSize(entry.file.size)}`} · {formatAgo(added)}
            {where !== undefined && ` · ${where}`}
          </span>
          {where !== undefined && (
            <span className="hidden truncate text-2xs text-ink-faint sm:block">{where}</span>
          )}
        </span>
      </button>
      <span className="hidden truncate text-[0.8125rem] text-ink-muted sm:block">{kind}</span>
      <span className="hidden text-[0.8125rem] tabular-nums text-ink-muted sm:block">
        {isFolder ? '—' : formatSize(entry.file.size)}
      </span>
      <span className="hidden truncate text-[0.8125rem] text-ink-muted sm:block">
        {formatAgo(added)}
      </span>
      <span className="flex items-center justify-end">
        {!isFolder && (
          <IconButton
            label={entry.file.favorite ? `Unstar ${name}` : `Star ${name}`}
            aria-pressed={entry.file.favorite}
            onClick={() => h.onStar(entry.file)}
            className={cn('hidden sm:inline-flex', !entry.file.favorite && HOVER_ONLY)}
          >
            <Star className={cn('h-4 w-4', entry.file.favorite && 'fill-warn text-warn')} />
          </IconButton>
        )}
        <ItemMenu entry={entry} h={h} />
      </span>
    </li>
  );
}

/** Folders as compact tiles, then files as thumbnails: the better view for pictures. */
export function GridView({
  entries,
  selecting,
  h,
}: {
  entries: Entry[];
  /** Something is selected, so checkboxes stay visible. */
  selecting: boolean;
  h: ItemHandlers;
}) {
  const folders = entries.filter((e) => e.kind === 'folder');
  const files = entries.filter((e) => e.kind === 'file');
  return (
    <div className="space-y-6">
      {folders.length > 0 && (
        <section>
          <h2 className="section-label mb-3">Folders</h2>
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
            {folders.map((e) => (
              <FolderTile key={e.key} entry={e} selecting={selecting} h={h} />
            ))}
          </ul>
        </section>
      )}
      {files.length > 0 && (
        <section>
          {folders.length > 0 && <h2 className="section-label mb-3">Files</h2>}
          <ul className="grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-3 lg:grid-cols-5">
            {files.map((e) => (
              <FileCard key={e.key} entry={e} selecting={selecting} h={h} />
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FolderTile({
  entry,
  selecting,
  h,
}: {
  entry: Entry;
  selecting: boolean;
  h: ItemHandlers;
}) {
  const selected = h.selected.has(entry.key);
  const drop = useDropTarget(
    (ev) => entry.kind === 'folder' && h.onDropOnFolder(entry.folder.id, ev),
  );
  if (entry.kind !== 'folder') return null;
  const where = h.locate?.(entry.folder.parentId);
  return (
    <li
      draggable
      onDragStart={(ev) => h.onDragStart(entry, ev)}
      onContextMenu={(ev) => {
        ev.preventDefault();
        h.onContextMenu(entry, { x: ev.clientX, y: ev.clientY });
      }}
      {...drop.props}
      className={cn(
        'group/item flex h-12 items-center rounded border pl-2.5 transition-colors',
        selected ? 'border-accent/60 bg-accent/10' : 'border-line hover:bg-surface-2/60',
        drop.over && 'border-accent bg-accent/15',
      )}
    >
      <span className="relative flex h-5 w-5 shrink-0 items-center justify-center">
        <FolderGlyph
          className={cn(
            (selected || selecting) && 'invisible',
            '[@media(hover:hover)]:group-hover/item:invisible',
          )}
        />
        <Checkbox
          checked={selected}
          onChange={() => h.onToggle(entry, false)}
          label={`Select ${entry.folder.name}`}
          className={cn('absolute', !(selected || selecting) && HOVER_REVEAL)}
        />
      </span>
      <button
        type="button"
        onClick={(ev) => h.onActivate(entry, clickHow(ev))}
        className="flex h-full min-w-0 flex-1 flex-col justify-center pl-2.5 text-left"
      >
        <span className="truncate text-sm font-medium text-ink">{entry.folder.name}</span>
        {where !== undefined && <span className="truncate text-2xs text-ink-faint">{where}</span>}
      </button>
      <ItemMenu entry={entry} h={h} />
    </li>
  );
}

function FileCard({ entry, selecting, h }: { entry: Entry; selecting: boolean; h: ItemHandlers }) {
  if (entry.kind !== 'file') return null;
  const d = entry.file;
  const selected = h.selected.has(entry.key);
  const where = h.locate?.(d.folderId);
  const always = selected || selecting;
  return (
    <li
      draggable
      onDragStart={(ev) => h.onDragStart(entry, ev)}
      onContextMenu={(ev) => {
        ev.preventDefault();
        h.onContextMenu(entry, { x: ev.clientX, y: ev.clientY });
      }}
      className="group/item relative"
    >
      <button
        type="button"
        onClick={(ev) => h.onActivate(entry, clickHow(ev))}
        className={cn(
          'block w-full rounded-sm text-left',
          selected && 'outline outline-2 outline-offset-2 outline-accent/70',
        )}
      >
        <FileThumb doc={d} size="lg" />
        <span className="mt-1.5 flex items-center gap-1">
          <span className="min-w-0 flex-1 truncate text-sm text-ink">{d.name}</span>
          {d.favorite && (
            <Star className="h-3 w-3 shrink-0 fill-warn text-warn" aria-label="Starred" />
          )}
        </span>
        <span className="block truncate text-2xs text-ink-faint">
          {where ?? `${fileKind(d.mime, d.name)} · ${formatSize(d.size)}`}
        </span>
      </button>
      <span
        className={cn(
          'absolute left-1.5 top-1.5 rounded-sm bg-raised/85 p-1 focus-within:opacity-100',
          !always && HOVER_REVEAL,
        )}
      >
        <Checkbox
          checked={selected}
          onChange={() => h.onToggle(entry, false)}
          label={`Select ${d.name}`}
        />
      </span>
      <span
        className={cn(
          'absolute right-1 top-1 rounded-sm bg-raised/85 focus-within:opacity-100',
          !always && HOVER_ONLY,
        )}
      >
        <ItemMenu entry={entry} h={h} />
      </span>
    </li>
  );
}
