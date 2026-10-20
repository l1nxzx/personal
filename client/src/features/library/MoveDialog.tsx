import { ArrowLeft, ChevronRight, FolderPlus } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { useCreateFolder } from './api';
import { FolderGlyph } from './FileIcons';
import type { FolderTree } from './folderTree';
import { NameDialog } from './NameDialog';

export interface MoveTarget {
  title: string;
  fileIds: string[];
  folderIds: string[];
  /** Where the items are now; "Move here" is off when they're all already there. */
  from: (string | null)[];
}

/** Pick a destination folder by browsing the tree (folders being moved can't be entered). */
export function MoveDialog({
  target,
  tree,
  onClose,
  onMove,
}: {
  target: MoveTarget | null;
  tree: FolderTree;
  onClose: () => void;
  onMove: (targetId: string | null) => Promise<unknown>;
}) {
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target?.title ?? 'Move'}
      className="sm:w-[30rem]"
    >
      {target && <Picker target={target} tree={tree} onClose={onClose} onMove={onMove} />}
    </Dialog>
  );
}

function Picker({
  target,
  tree,
  onClose,
  onMove,
}: {
  target: MoveTarget;
  tree: FolderTree;
  onClose: () => void;
  onMove: (targetId: string | null) => Promise<unknown>;
}) {
  const common = target.from.every((f) => f === target.from[0]) ? (target.from[0] ?? null) : null;
  const [at, setAt] = useState<string | null>(common);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [naming, setNaming] = useState(false);
  const create = useCreateFolder();

  const blocked = (id: string) => target.folderIds.some((m) => tree.isWithin(id, m));
  const here = tree.byId.get(at ?? '');
  const path = tree.path(at);
  const subfolders = tree.children(at);
  const alreadyHere = target.from.every((f) => f === at);
  const intoItself = at !== null && blocked(at);

  const move = () => {
    setBusy(true);
    setError(null);
    onMove(at).then(onClose, (err) => {
      setError(errorMessage(err));
      setBusy(false);
    });
  };

  return (
    <div className="flex min-h-0 flex-col">
      <div className="flex h-12 shrink-0 items-center gap-1 border-b border-line px-2">
        <IconButton
          label="Up one level"
          disabled={at === null}
          onClick={() => setAt(here?.parentId ?? null)}
        >
          <ArrowLeft className="h-4 w-4" />
        </IconButton>
        <span
          className="min-w-0 flex-1 truncate text-sm text-ink"
          title={path.map((f) => f.name).join(' / ')}
        >
          {at === null ? 'My files' : (here?.name ?? '…')}
        </span>
      </div>

      <ul className="max-h-[50vh] min-h-[10rem] overflow-y-auto py-1" aria-label="Folders">
        {subfolders.map((f) => {
          const off = blocked(f.id);
          return (
            <li key={f.id}>
              <button
                type="button"
                disabled={off}
                onClick={() => setAt(f.id)}
                title={off ? 'A folder can’t go inside itself' : undefined}
                className={cn(
                  'flex h-11 w-full items-center gap-3 px-4 text-left text-sm sm:h-9',
                  off ? 'cursor-not-allowed opacity-40' : 'hover:bg-surface-2',
                )}
              >
                <FolderGlyph className="h-4 w-4" />
                <span className="min-w-0 flex-1 truncate text-ink">{f.name}</span>
                {!off && tree.children(f.id).length > 0 && (
                  <ChevronRight className="h-4 w-4 text-ink-faint" />
                )}
              </button>
            </li>
          );
        })}
        {!subfolders.length && (
          <li className="px-4 py-6 text-sm text-ink-faint">
            No folders inside. Move here, or make one.
          </li>
        )}
      </ul>

      {error && (
        <p className="border-t border-line px-4 py-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="flex shrink-0 items-center gap-2 border-t border-line p-3">
        <Button variant="ghost" size="sm" onClick={() => setNaming(true)} disabled={intoItself}>
          <FolderPlus className="h-4 w-4" /> New folder
        </Button>
        <span className="flex-1" />
        <Button size="sm" onClick={onClose}>
          Cancel
        </Button>
        <Button
          size="sm"
          variant="primary"
          busy={busy}
          disabled={alreadyHere || intoItself}
          onClick={move}
        >
          {alreadyHere ? 'Already here' : 'Move here'}
        </Button>
      </div>

      <NameDialog
        open={naming}
        title="New folder"
        confirmLabel="Create"
        maxLength={100}
        onClose={() => setNaming(false)}
        onSubmit={(name) => create.mutateAsync({ name, parentId: at }).then((f) => setAt(f.id))}
      />
    </div>
  );
}
