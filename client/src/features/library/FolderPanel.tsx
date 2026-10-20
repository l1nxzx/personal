import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, FolderInput, FolderOpen, Pencil, X } from 'lucide-react';
import type { DocumentFolder } from '../../../../shared/types';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { formatAgo } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import { folderUsage } from './api';
import { usageLabel } from './DeleteFolderDialog';
import { FolderGlyph } from './FileIcons';
import { locationLabel, type FolderTree } from './folderTree';

/** Side panel for one folder: where it is, what's in it, and what it is linked to. */
export function FolderPanel({
  folder,
  tree,
  onClose,
  onOpen,
  onRename,
  onMove,
}: {
  folder: DocumentFolder | null;
  tree: FolderTree;
  onClose: () => void;
  onOpen: (f: DocumentFolder) => void;
  onRename: (f: DocumentFolder) => void;
  onMove: (f: DocumentFolder) => void;
}) {
  return (
    <Dialog
      open={!!folder}
      onClose={onClose}
      title="Folder"
      hideTitle
      placement="panel"
      className="sm:w-[30rem]"
    >
      {folder && (
        <Body
          key={folder.id}
          folder={folder}
          tree={tree}
          onClose={onClose}
          onOpen={onOpen}
          onRename={onRename}
          onMove={onMove}
        />
      )}
    </Dialog>
  );
}

function Body({
  folder,
  tree,
  onClose,
  onOpen,
  onRename,
  onMove,
}: {
  folder: DocumentFolder;
  tree: FolderTree;
  onClose: () => void;
  onOpen: (f: DocumentFolder) => void;
  onRename: (f: DocumentFolder) => void;
  onMove: (f: DocumentFolder) => void;
}) {
  // Keyed under 'documents' so any library change refreshes it.
  const usage = useQuery({
    queryKey: ['documents', 'usage', folder.id],
    queryFn: () => folderUsage([folder.id]),
  });
  const current = tree.byId.get(folder.id) ?? folder;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex h-14 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton label="Close" onClick={onClose} className="sm:hidden">
          <ChevronLeft className="h-5 w-5" />
        </IconButton>
        <span className="flex min-w-0 flex-1 items-center gap-2 pl-2">
          <FolderGlyph className="h-4 w-4" />
          <span className="truncate text-sm text-ink">{current.name}</span>
        </span>
        <IconButton label="Rename folder" onClick={() => onRename(current)}>
          <Pencil className="h-4 w-4" />
        </IconButton>
        <IconButton label="Move folder" onClick={() => onMove(current)}>
          <FolderInput className="h-4 w-4" />
        </IconButton>
        <IconButton label="Close" onClick={onClose} className="hidden sm:inline-flex">
          <X className="h-4 w-4" />
        </IconButton>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-10 pt-5">
        <dl className="space-y-3 text-sm">
          <div>
            <dt className="text-[0.8125rem] text-ink-faint">Location</dt>
            <dd className="mt-0.5 text-ink">{locationLabel(tree, current.parentId)}</dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-ink-faint">Contains</dt>
            <dd className="mt-0.5 text-ink">
              {usage.data
                ? usageLabel(usage.data) || 'Nothing yet'
                : usage.isError
                  ? 'Couldn’t count'
                  : '…'}
            </dd>
          </div>
          <div>
            <dt className="text-[0.8125rem] text-ink-faint">Created</dt>
            <dd className="mt-0.5 text-ink">{formatAgo(current.createdAt)}</dd>
          </div>
        </dl>
        <Button className="mt-5" onClick={() => onOpen(current)}>
          <FolderOpen className="h-4 w-4" /> Open folder
        </Button>
        <LinksPanel item={{ type: 'folder', id: current.id }} className="mt-8" />
      </div>
    </div>
  );
}
