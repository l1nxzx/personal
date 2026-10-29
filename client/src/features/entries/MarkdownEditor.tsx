import {
  Bold,
  Eraser,
  Heading2,
  Italic,
  Link2,
  List,
  ListChecks,
  Paperclip,
  Quote,
} from 'lucide-react';
import { forwardRef, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAutosize } from '../../hooks/useAutosize';
import { parseAnchorUrl } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { isMod } from '../../lib/hotkeys';
import {
  applyEdit,
  continueList,
  link,
  linkAt,
  linkTo,
  togglePrefix,
  wrap,
  type Edit,
} from './markdown';
import { writingTextClass, writingTextStyle } from './writingStyle';

/**
 * `link` and `file` link the selected words to a web address or to a file or folder (the page
 * asks which); `clear` removes all formatting from the selection (formatted editor only).
 */
export type FormatAction =
  'heading' | 'bold' | 'italic' | 'quote' | 'list' | 'check' | 'link' | 'file' | 'clear';

export interface TextRange {
  start: number;
  end: number;
}

/** What the page can ask of either editor (formatted or plain Markdown). */
export interface MarkdownEditorHandle {
  format: (action: FormatAction) => void;
  focus: () => void;
  /** The selection (kept even after the editor loses focus). */
  selection: () => TextRange;
  /** Turns `range` into a link to `url`; with an empty range, inserts `fallback` as the text. */
  linkRange: (range: TextRange, url: string, fallback: string) => void;
  /** The text of a range as the person sees it. */
  textOf: (range: TextRange) => string;
  /** Formatting at the selection (the plain editor only knows about links). */
  active: () => Set<FormatAction>;
  /** Removes the link at the selection and keeps its words. */
  unlink: () => void;
}

const FORMAT_BUTTONS: { action: FormatAction; label: string; icon: ReactNode }[] = [
  { action: 'heading', label: 'Heading', icon: <Heading2 /> },
  { action: 'bold', label: 'Bold', icon: <Bold /> },
  { action: 'italic', label: 'Italic', icon: <Italic /> },
  { action: 'quote', label: 'Quote', icon: <Quote /> },
  { action: 'list', label: 'Bulleted list', icon: <List /> },
  { action: 'check', label: 'Checklist', icon: <ListChecks /> },
  { action: 'link', label: 'Link to a web address', icon: <Link2 /> },
  { action: 'file', label: 'Link to a file or folder', icon: <Paperclip /> },
  { action: 'clear', label: 'Clear formatting', icon: <Eraser /> },
];

/**
 * The few formatting actions worth a button. A button whose formatting is already applied to
 * the selection is lit, and pressing it again removes that formatting.
 */
export function FormatBar({
  onFormat,
  active,
  rich,
}: {
  onFormat: (a: FormatAction) => void;
  active?: Set<FormatAction>;
  /** The formatted editor (clearing formatting needs it). */
  rich?: boolean;
}) {
  return (
    <div
      className="scrollbar-none flex gap-0.5 overflow-x-auto"
      role="toolbar"
      aria-label="Formatting"
    >
      {FORMAT_BUTTONS.filter((b) => rich || b.action !== 'clear').map((b) => {
        const on = !!active?.has(b.action);
        return (
          <button
            key={b.action}
            type="button"
            aria-label={b.label}
            aria-pressed={b.action === 'clear' ? undefined : on}
            title={on ? `${b.label} (press again to remove)` : b.label}
            // Keep focus (and the selection) in the editor.
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => onFormat(b.action)}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded transition-colors sm:h-8 sm:w-8 [&>svg]:h-4 [&>svg]:w-4',
              on
                ? 'bg-accent/15 text-accent ring-1 ring-inset ring-accent/40'
                : 'text-ink-muted hover:bg-surface-2 hover:text-ink',
            )}
          >
            {b.icon}
          </button>
        );
      })}
    </div>
  );
}

/**
 * Plain-textarea Markdown editor: the fallback for text the formatted editor can't show, and
 * for anyone who prefers to write the Markdown itself. Adds list continuation and shortcuts.
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
    selection: () => ({
      start: el.current?.selectionStart ?? value.length,
      end: el.current?.selectionEnd ?? value.length,
    }),
    linkRange: (r, url, fallback) =>
      el.current && run(linkTo(el.current.value, r.start, r.end, url, fallback)),
    textOf: (r) => (el.current?.value ?? value).slice(r.start, r.end),
    active: () => {
      const t = el.current;
      const at = t ? linkAt(t.value, t.selectionStart) : null;
      return new Set<FormatAction>(at ? [parseAnchorUrl(at.url) ? 'file' : 'link'] : []);
    },
    unlink: () => {
      const t = el.current;
      const at = t ? linkAt(t.value, t.selectionStart) : null;
      if (at)
        run({
          start: at.start,
          end: at.end,
          text: at.label,
          selStart: at.start,
          selEnd: at.start + at.label.length,
        });
    },
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
        writingTextClass(font),
      )}
      style={writingTextStyle(font)}
    />
  );
});
