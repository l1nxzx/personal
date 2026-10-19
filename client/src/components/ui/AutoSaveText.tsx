import { useEffect, useRef, useState } from 'react';
import { useAutosize } from '../../hooks/useAutosize';
import { cn } from '../../lib/cn';

/**
 * A growing textarea that saves itself shortly after you stop typing, and when you leave.
 * For secondary notes (book notes, project notes); journal/writing use the full editor.
 */
export function AutoSaveText({
  value,
  onSave,
  placeholder,
  label,
  className,
  minRows = 4,
}: {
  value: string;
  onSave: (text: string) => void;
  placeholder?: string;
  label: string;
  className?: string;
  minRows?: number;
}) {
  const [text, setText] = useState(value);
  const [state, setState] = useState<'idle' | 'editing' | 'saved'>('idle');
  const ref = useRef<HTMLTextAreaElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout>>();
  const latest = useRef({ text, value, onSave });
  latest.current = { text, value, onSave };
  useAutosize(ref, text, minRows);

  // Take in changes from elsewhere unless this field is being edited.
  useEffect(() => {
    if (document.activeElement !== ref.current) setText(value);
  }, [value]);

  useEffect(
    () => () => {
      clearTimeout(timer.current);
      const { text: t, value: v, onSave: save } = latest.current;
      if (t !== v) save(t);
    },
    [],
  );

  return (
    <div className={className}>
      <textarea
        ref={ref}
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          setText(v);
          setState('editing');
          clearTimeout(timer.current);
          timer.current = setTimeout(() => {
            latest.current.onSave(v);
            setState('saved');
          }, 900);
        }}
        placeholder={placeholder}
        aria-label={label}
        className={cn(
          'block w-full resize-none overflow-hidden bg-transparent text-[0.9375rem] leading-7 text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none',
        )}
      />
      <p className="mt-1 h-4 text-2xs text-ink-faint" aria-live="polite">
        {state === 'editing' ? 'Editing' : state === 'saved' ? 'Saved' : ''}
      </p>
    </div>
  );
}
