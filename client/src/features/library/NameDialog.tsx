import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Dialog } from '../../components/ui/Dialog';
import { Input } from '../../components/ui/Field';
import { errorMessage } from '../../lib/apiFetch';

/** Asks for a name: new folder, rename folder, rename file. Errors (e.g. name taken) show inline. */
export function NameDialog({
  open,
  title,
  initial = '',
  confirmLabel,
  maxLength,
  selectStem,
  onClose,
  onSubmit,
}: {
  open: boolean;
  title: string;
  initial?: string;
  confirmLabel: string;
  maxLength: number;
  /** Preselect the name without its extension, so typing replaces only that. */
  selectStem?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title={title}
      initialFocus={inputRef}
      className="sm:w-[26rem]"
    >
      {open && (
        <NameForm
          inputRef={inputRef}
          initial={initial}
          label={title}
          confirmLabel={confirmLabel}
          maxLength={maxLength}
          selectStem={selectStem}
          onClose={onClose}
          onSubmit={onSubmit}
        />
      )}
    </Dialog>
  );
}

interface NameFormProps {
  inputRef: React.RefObject<HTMLInputElement>;
  initial: string;
  label: string;
  confirmLabel: string;
  maxLength: number;
  selectStem?: boolean;
  onClose: () => void;
  onSubmit: (name: string) => Promise<unknown>;
}

function NameForm(props: NameFormProps) {
  const { inputRef, initial, label, confirmLabel, maxLength, selectStem, onClose, onSubmit } =
    props;
  const [name, setName] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const dot = initial.lastIndexOf('.');
    inputRef.current?.setSelectionRange(0, selectStem && dot > 0 ? dot : initial.length);
  }, [inputRef, initial, selectStem]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const value = name.trim();
    if (!value || busy) return;
    if (value === initial) return onClose();
    setBusy(true);
    setError(null);
    try {
      await onSubmit(value);
      onClose();
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  return (
    <form onSubmit={(e) => void submit(e)} className="p-4">
      <Input
        ref={inputRef}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        maxLength={maxLength}
        aria-label={label}
        aria-invalid={!!error}
        autoComplete="off"
        enterKeyHint="done"
      />
      {error && (
        <p className="mt-2 text-sm text-bad" role="alert">
          {error}
        </p>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <Button onClick={onClose}>Cancel</Button>
        <Button type="submit" variant="primary" busy={busy} disabled={!name.trim()}>
          {confirmLabel}
        </Button>
      </div>
    </form>
  );
}
