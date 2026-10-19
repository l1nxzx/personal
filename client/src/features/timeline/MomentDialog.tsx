import { useState } from 'react';
import type { FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import type { Moment, Ref } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { controlClass } from '../../components/ui/Field';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { today } from '../../lib/dates';
import { useMomentMutations } from './api';

/** Add (or edit) a moment on the life timeline. Moments are only ever added on purpose. */
export function MomentDialog({
  open,
  onClose,
  initial,
  moment,
}: {
  open: boolean;
  onClose: () => void;
  initial?: { date?: string; title?: string; ref?: Ref | null };
  moment?: Moment;
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={moment ? 'Edit moment' : 'Add to timeline'}
      placement="top"
    >
      {open && <Form initial={initial} moment={moment} onDone={onClose} />}
    </Dialog>
  );
}

function Form({
  initial,
  moment,
  onDone,
}: {
  initial?: { date?: string; title?: string; ref?: Ref | null };
  moment?: Moment;
  onDone: () => void;
}) {
  const [date, setDate] = useState(moment?.date ?? initial?.date ?? today());
  const [title, setTitle] = useState(moment?.title ?? initial?.title ?? '');
  const [description, setDescription] = useState(moment?.description ?? '');
  const [error, setError] = useState<string | null>(null);
  const { add, update } = useMomentMutations();
  const toast = useToast();
  const navigate = useNavigate();

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('What happened?');
    const body = { date, title: title.trim(), description: description.trim() };
    if (moment) {
      update.mutate(
        { id: moment.id, patch: body },
        { onSuccess: onDone, onError: (err) => setError(errorMessage(err)) },
      );
    } else {
      add.mutate(
        { ...body, ref: initial?.ref ?? null },
        {
          onSuccess: () => {
            onDone();
            toast({
              message: 'Added to your timeline',
              action: { label: 'Open', onClick: () => navigate('/timeline') },
            });
          },
          onError: (err) => setError(errorMessage(err)),
        },
      );
    }
  };

  return (
    <form onSubmit={submit} className="space-y-3 p-4">
      <p className="text-sm text-ink-muted">
        Something worth remembering when you look back on this period of your life.
      </p>
      <input
        type="date"
        value={date}
        onChange={(e) => e.target.value && setDate(e.target.value)}
        aria-label="Date"
        className={cn(controlClass, 'h-10 w-auto sm:h-9')}
      />
      <input
        autoFocus
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        maxLength={200}
        placeholder="What happened"
        aria-label="Title"
        className={cn(controlClass, 'h-10 sm:h-9')}
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        rows={3}
        placeholder="A few words about it (optional)"
        aria-label="Description"
        className={controlClass}
      />
      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" busy={add.isPending || update.isPending}>
          {moment ? 'Save' : 'Add moment'}
        </Button>
      </div>
    </form>
  );
}
