import { Bold, Heading2, Italic, Link2, List, ListChecks, Quote } from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAutosize } from '../../hooks/useAutosize';
import { cn } from '../../lib/cn';
import { isMod } from '../../lib/hotkeys';
import { applyEdit, continueList, link, togglePrefix, wrap, type Edit } from './markdown';

export type FormatAction = 'heading' | 'bold' | 'italic' | 'quote' | 'list' | 'check' | 'link';

export interface MarkdownEditorHandle {
  format: (action: FormatAction) => void;
  focus: () => void;
}

const FORMAT_BUTTONS: { action: FormatAction; label: string; icon: ReactNode }[] = [
  { action: 'heading', label: 'Heading', icon: <Heading2 /> },
  { action: 'bold', label: 'Bold', icon: <Bold /> },
  { action: 'italic', label: 'Italic', icon: <Italic /> },
  { action: 'quote', label: 'Quote', icon: <Quote /> },
  { action: 'list', label: 'Bulleted list', icon: <List /> },
  { action: 'check', label: 'Checklist', icon: <ListChecks /> },
  { action: 'link', label: 'Link', icon: <Link2 /> },
];

/** A row of the few formatting actions worth a button. Everything else is plain Markdown. */
export function FormatBar({ onFormat }: { onFormat: (a: FormatAction) => void }) {
  return (
    <div
      className="scrollbar-none flex gap-0.5 overflow-x-auto"
      role="toolbar"
      aria-label="Formatting"
    >
      {FORMAT_BUTTONS.map((b) => (
        <button
          key={b.action}
          type="button"
          aria-label={b.label}
          title={b.label}
          // Keep focus (and the selection) in the textarea.
          onPointerDown={(e) => e.preventDefault()}
          onClick={() => onFormat(b.action)}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-8 sm:w-8 [&>svg]:h-4 [&>svg]:w-4"
        >
          {b.icon}
        </button>
      ))}
    </div>
  );
}

/**
 * Plain-textarea Markdown editor: fast to type in on any device, IME- and autocorrect-friendly.
 * Adds list continuation and a few formatting shortcuts.
 */
export const MarkdownEditor = forwardRef<
  MarkdownEditorHandle,
  {
    value: string;
    onChange: (value: string) => void;
    font: 'serif' | 'sans';
    placeholder?: string;
    autoFocus?: boolean;
    ariaLabel: string;
    minRows?: number;
  }
>(function MarkdownEditor(
  { value, onChange, font, placeholder, autoFocus, ariaLabel, minRows = 8 },
  ref,
) {
  const el = useRef<HTMLTextAreaElement>(null);
  useAutosize(el, value, minRows);

  const run = (edit: Edit | null) => {
    if (edit && el.current) applyEdit(el.current, edit, onChange);
  };

  const format = (action: FormatAction) => {
    const t = el.current;
    if (!t) return;
    const { value: v, selectionStart: s, selectionEnd: e } = t;
    switch (action) {
      case 'bold':
        return run(wrap(v, s, e, '**'));
      case 'italic':
        return run(wrap(v, s, e, '_'));
      case 'heading':
        return run(togglePrefix(v, s, e, '## '));
      case 'quote':
        return run(togglePrefix(v, s, e, '> '));
      case 'list':
        return run(togglePrefix(v, s, e, '- '));
      case 'check':
        return run(togglePrefix(v, s, e, '- [ ] '));
      case 'link':
        return run(link(v, s, e));
    }
  };

  useImperativeHandle(ref, () => ({
    format,
    focus: () => el.current?.focus({ preventScroll: true }),
  }));

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.nativeEvent.isComposing) return;
    const t = e.currentTarget;
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !isMod(e) &&
      !e.altKey &&
      t.selectionStart === t.selectionEnd
    ) {
      const edit = continueList(t.value, t.selectionStart);
      if (edit) {
        e.preventDefault();
        run(edit);
      }
      return;
    }
    if (isMod(e) && !e.shiftKey && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'b' || k === 'i') {
        e.preventDefault();
        format(k === 'b' ? 'bold' : 'italic');
      }
    }
  };

  return (
    <textarea
      ref={el}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      placeholder={placeholder}
      aria-label={ariaLabel}
      autoFocus={autoFocus}
      spellCheck
      autoCapitalize="sentences"
      className={cn(
        'block w-full resize-none overflow-hidden bg-transparent text-ink caret-accent placeholder:text-ink-faint focus:outline-none focus-visible:outline-none',
        font === 'serif'
          ? 'font-serif text-[1.125rem] leading-[1.8] sm:text-[1.1875rem]'
          : 'font-sans text-[1.0625rem] leading-[1.75]',
      )}
      style={font === 'serif' ? { fontVariationSettings: "'opsz' 16" } : undefined}
    />
  );
});
