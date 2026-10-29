import { useState } from 'react';
import type { DocumentFolder, FolderUsage } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { cn } from '../../lib/cn';

export const countLabel = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export function usageLabel(u: FolderUsage): string {
  const parts = [
    u.files && countLabel(u.files, 'file', 'files'),
    u.folders && countLabel(u.folders, 'folder', 'folders'),
  ].filter(Boolean);
  return parts.join(' and ');
}

/**
 * Deleting a folder that has things in it: the safe choice (move them up a level) is preselected;
 * deleting everything has to be picked on purpose.
 */
export function DeleteFolderDialog({
  target,
  parentName,
  onClose,
  onDelete,
}: {
  target: { folder: DocumentFolder; usage: FolderUsage } | null;
  parentName: string;
  onClose: () => void;
  onDelete: (contents: 'move' | 'delete') => Promise<unknown>;
}) {
  return (
    <Dialog
      open={!!target}
      onClose={onClose}
      title={target ? `Delete “${target.folder.name}”?` : 'Delete folder'}
      hideTitle
      placement="center"
    >
      {target && (
        <Body
          name={target.folder.name}
          usage={target.usage}
          parentName={parentName}
          onClose={onClose}
          onDelete={onDelete}
        />
      )}
    </Dialog>
  );
}

function Body({
  name,
  usage,
  parentName,
  onClose,
  onDelete,
}: {
  name: string;
  usage: FolderUsage;
  parentName: string;
  onClose: () => void;
  onDelete: (contents: 'move' | 'delete') => Promise<unknown>;
}) {
  const [choice, setChoice] = useState<'move' | 'delete'>('move');
  const [busy, setBusy] = useState(false);
  const options = [
    {
      value: 'move' as const,
      label: `Keep what’s inside: move it to “${parentName}”`,
      hint: 'Only the empty folder is removed.',
    },
    {
      value: 'delete' as const,
      label: 'Delete the folder and everything in it',
      hint: `${usageLabel(usage)} will be removed for good, including the stored files.`,
    },
  ];

  return (
    <div className="p-5">
      <h2 className="font-medium text-ink">Delete “{name}”?</h2>
      <p className="mt-2 text-sm text-ink-muted">It contains {usageLabel(usage)}.</p>
      <fieldset className="mt-4 space-y-2">
        <legend className="sr-only">What happens to its contents</legend>
        {options.map((o) => (
          <label
            key={o.value}
            className={cn(
              'flex cursor-pointer gap-3 rounded border px-3 py-2.5',
              choice === o.value ? 'border-accent/60 bg-accent/10' : 'border-line',
            )}
          >
            <input
              type="radio"
              name="folder-contents"
              value={o.value}
              checked={choice === o.value}
              onChange={() => setChoice(o.value)}
              className="mt-1 accent-[rgb(var(--accent))]"
            />
            <span>
              <span className={cn('block text-sm', o.value === 'delete' ? 'text-bad' : 'text-ink')}>
                {o.label}
              </span>
              <span className="block text-2xs text-ink-faint">{o.hint}</span>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="mt-5 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button
          variant={choice === 'delete' ? 'danger' : 'primary'}
          busy={busy}
          onClick={() => {
            setBusy(true);
            void onDelete(choice).then(onClose, () => setBusy(false));
          }}
        >
          {choice === 'delete' ? 'Delete everything' : 'Delete folder'}
        </Button>
      </div>
    </div>
  );
}
