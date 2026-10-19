import { useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { CaptureKind, CaptureResult } from '../../../../shared/types';
import { Button } from '../../components/ui/Button';
import { Kbd } from '../../components/ui/misc';
import { useToast } from '../../context/ToastContext';
import { useAutosize } from '../../hooks/useAutosize';
import { apiFetch, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { localTime, today } from '../../lib/dates';
import { isMod, modKey } from '../../lib/hotkeys';
import { keys } from '../../lib/keys';
import { readJSON, removeKey, writeJSON } from '../../lib/storage';
import { useCapture } from '../inbox/api';

const KINDS: { value: CaptureKind; label: string; hint: string }[] = [
  { value: 'note', label: 'Note', hint: 'Saved to your inbox as a note.' },
  { value: 'idea', label: 'Idea', hint: 'Saved to your inbox as an idea.' },
  { value: 'task', label: 'Task', hint: 'Becomes a task. The first line is its title.' },
  { value: 'journal', label: 'Journal', hint: "Added to today's journal entry." },
];

interface Draft {
  text: string;
  kind: CaptureKind | null;
}

/**
 * The fastest way to get something out of your head. No title, folder or tag needed.
 * Unsent text is kept on this device, so closing the dialog or reloading never loses it.
 */
export function CaptureForm({
  draftKey,
  autoFocus,
  seed,
  onSaved,
  className,
  placeholder = 'Write something down…',
}: {
  draftKey: string;
  autoFocus?: boolean;
  seed?: { text?: string; kind?: CaptureKind } | null;
  onSaved?: (result: CaptureResult) => void;
  className?: string;
  placeholder?: string;
}) {
  const [draft, setDraft] = useState<Draft>(() => {
    const saved = readJSON<Draft>(draftKey) ?? { text: '', kind: null };
    if (!seed) return saved;
    return { text: seed.text ?? saved.text, kind: seed.kind ?? saved.kind };
  });
  const ref = useRef<HTMLTextAreaElement>(null);
  const capture = useCapture();
  const qc = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();

  useAutosize(ref, draft.text, 3);

  useEffect(() => {
    if (draft.text || draft.kind) writeJSON(draftKey, draft);
    else removeKey(draftKey);
  }, [draft, draftKey]);

  useEffect(() => {
    if (!autoFocus) return;
    const el = ref.current;
    el?.focus({ preventScroll: true });
    el?.setSelectionRange(el.value.length, el.value.length);
  }, [autoFocus]);

  const submit = () => {
    const submitted = { ...draft, text: draft.text.trim() };
    if (!submitted.text || capture.isPending) return;
    capture.mutate(
      {
        text: submitted.text,
        kind: submitted.kind ?? undefined,
        localDate: today(),
        localTime: localTime(),
      },
      {
        onSuccess: (result) => {
          setDraft({ text: '', kind: null });
          removeKey(draftKey);
          onSaved?.(result);
          toastFor(result, submitted);
        },
      },
    );
  };

  const toastFor = (result: CaptureResult, submitted: Draft) => {
    if (result.destination === 'inbox') {
      toast({
        message: 'Saved to Inbox',
        action: {
          label: 'Undo',
          onClick: () =>
            void apiFetch(`/inbox/${result.id}`, { method: 'DELETE' })
              .then(() => {
                // Put the text back where it was typed, in case it's wanted after all.
                writeJSON(draftKey, submitted);
                setDraft(submitted);
                void qc.invalidateQueries({ queryKey: keys.inbox });
                void qc.invalidateQueries({ queryKey: keys.home });
              })
              .catch(() => toast({ message: 'Could not undo', tone: 'error' })),
        },
      });
    } else if (result.destination === 'task') {
      toast({
        message: 'Added to Tasks',
        action: { label: 'Open', onClick: () => navigate(`/tasks?task=${result.id}`) },
      });
    } else {
      toast({
        message: "Added to today's journal",
        action: { label: 'Open', onClick: () => navigate(`/journal/${result.id}`) },
      });
    }
  };
  const text = draft.text.trim();
  const hint =
    KINDS.find((k) => k.value === draft.kind)?.hint ??
    'Goes to your inbox. Sort it out later, or never.';

  return (
    <form
      className={cn('flex flex-col', className)}
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
    >
      <label className="sr-only" htmlFor={`${draftKey}-text`}>
        Capture
      </label>
      <textarea
        id={`${draftKey}-text`}
        ref={ref}
        value={draft.text}
        onChange={(e) => setDraft((d) => ({ ...d, text: e.target.value }))}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && isMod(e)) {
            e.preventDefault();
            submit();
          }
        }}
        placeholder={placeholder}
        rows={3}
        className="max-h-[40vh] w-full resize-none bg-transparent px-4 pt-3 text-[1.0625rem] leading-7 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
      />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-3 pb-3 pt-1">
        <div className="flex gap-1" role="group" aria-label="Type (optional)">
          {KINDS.map((k) => (
            <button
              key={k.value}
              type="button"
              aria-pressed={draft.kind === k.value}
              onClick={() => setDraft((d) => ({ ...d, kind: d.kind === k.value ? null : k.value }))}
              className={cn(
                'h-8 rounded border px-2.5 text-[0.8125rem] transition-colors sm:h-7',
                draft.kind === k.value
                  ? 'border-accent/60 bg-accent/10 text-ink'
                  : 'border-line text-ink-muted hover:border-line-strong hover:text-ink',
              )}
            >
              {k.label}
            </button>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-3">
          <Kbd>{modKey} ↵</Kbd>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={!text}
            busy={capture.isPending}
          >
            Save
          </Button>
        </div>
        <p className="w-full text-[0.8125rem] text-ink-faint" aria-live="polite">
          {capture.isError ? (
            <span className="text-bad">{errorMessage(capture.error)} Your text is kept here.</span>
          ) : (
            hint
          )}
        </p>
      </div>
    </form>
  );
}
