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
  Redo2,
  Undo2,
} from 'lucide-react';
import { forwardRef, useEffect, useImperativeHandle, useRef } from 'react';
import type { ReactNode } from 'react';
import { useAutosize } from '../../hooks/useAutosize';
import { parseAnchorUrl } from '../../lib/anchors';
import { cn } from '../../lib/cn';
import { isMac, isMod, modKey } from '../../lib/hotkeys';
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
import { changeKindOf, TextHistory, type ChangeKind, type TextState } from './textHistory';
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
  /** Takes back the latest change to the text (typing, formatting, a link, a restore…). */
  undo: () => void;
  redo: () => void;
}

/** Whether there is anything to undo or redo, for the toolbar. */
export interface UndoState {
  undo: boolean;
  redo: boolean;
}

export const sameUndoState = (a: UndoState, b: UndoState) => a.undo === b.undo && a.redo === b.redo;

/** Undo / redo keys: Mod+Z, Shift+Mod+Z, and Ctrl+Y on Windows and Linux. */
export function undoKey(e: KeyboardEvent | React.KeyboardEvent): 'undo' | 'redo' | null {
  if (!isMod(e) || e.altKey) return null;
  const k = e.key.toLowerCase();
  // 'я' is Z on Russian layouts (the formatted editor accepts it too).
  if (k === 'z' || k === 'я') return e.shiftKey ? 'redo' : 'undo';
  if (k === 'y' && !e.shiftKey && !isMac) return 'redo';
  return null;
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
  history,
  onHistory,
}: {
  onFormat: (a: FormatAction) => void;
  active?: Set<FormatAction>;
  /** The formatted editor (clearing formatting needs it). */
  rich?: boolean;
  history: UndoState;
  onHistory: (a: 'undo' | 'redo') => void;
}) {
  return (
    <div
      className="scrollbar-none flex gap-0.5 overflow-x-auto"
      role="toolbar"
      aria-label="Formatting"
    >
      {(['undo', 'redo'] as const).map((a) => {
        const label =
          a === 'undo'
            ? `Undo (${modKey}+Z)`
            : `Redo (${isMac ? `Shift+${modKey}+Z` : `${modKey}+Y`})`;
        return (
          <button
            key={a}
            type="button"
            aria-label={a === 'undo' ? 'Undo' : 'Redo'}
            title={label}
            // Disabled buttons still swallow the press, so a tap never moves the selection.
            aria-disabled={!history[a]}
            onPointerDown={(e) => e.preventDefault()}
            onClick={() => history[a] && onHistory(a)}
            className={cn(
              'flex h-10 w-10 shrink-0 items-center justify-center rounded transition-colors sm:h-8 sm:w-8 [&>svg]:h-4 [&>svg]:w-4',
              history[a]
                ? 'text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink'
                : 'cursor-default text-ink-muted opacity-40',
            )}
          >
            {a === 'undo' ? <Undo2 /> : <Redo2 />}
          </button>
        );
      })}
      <span className="mx-1 my-2 w-px shrink-0 bg-line" aria-hidden />
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
                : 'text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink',
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
    /** Whether there is anything to undo or redo changed. */
    onHistory?: (state: UndoState) => void;
    /**
     * Changes when the text was replaced in a way that can't be undone (an edit from another
     * device): the undo history starts again from there.
     */
    historyKey?: number;
  }
>(function MarkdownEditor(
  {
    value,
    onChange,
    font,
    placeholder,
    autoFocus,
    ariaLabel,
    minRows = 8,
    onHistory,
    historyKey = 0,
  },
  ref,
) {
  const el = useRef<HTMLTextAreaElement>(null);
  useAutosize(el, value, minRows);

  const history = useRef(new TextHistory());
  /** The text as this editor last saw it (what it sent, or what it was given). */
  const known = useRef(value);
  const knownKey = useRef(historyKey);
  /** Set just before the browser changes the text: the selection then, and what kind of change. */
  const coming = useRef<{ start: number; end: number; kind: ChangeKind } | null>(null);
  const reported = useRef<UndoState>({ undo: false, redo: false });
  const onHistoryRef = useRef(onHistory);
  onHistoryRef.current = onHistory;

  const report = () => {
    const next = { undo: history.current.canUndo, redo: history.current.canRedo };
    if (sameUndoState(next, reported.current)) return;
    reported.current = next;
    onHistoryRef.current?.(next);
  };

  const current = (): TextState => ({
    value: known.current,
    start: el.current?.selectionStart ?? known.current.length,
    end: el.current?.selectionEnd ?? known.current.length,
  });

  /** Every change to the text passes here, so the state before it can be kept. */
  const change = (next: string) => {
    if (next === known.current) return;
    const c = coming.current;
    coming.current = null;
    const before = c
      ? { value: known.current, start: c.start, end: c.end }
      : // The browser said nothing first (an old browser, an extension): treat it as typing.
        { value: known.current, start: next.length, end: next.length };
    const kind = c?.kind ?? (next.length >= known.current.length ? 'insert' : 'delete');
    history.current.record(before, kind);
    known.current = next;
    onChange(next);
    report();
  };

  const run = (edit: Edit | null) => {
    const t = el.current;
    if (!edit || !t) return;
    // Formatting, links and continued lists are steps of their own, undone back to the
    // selection they were made from.
    coming.current = { start: t.selectionStart, end: t.selectionEnd, kind: 'other' };
    applyEdit(t, edit, change);
    coming.current = null;
  };

  const show = (state: TextState | null) => {
    const t = el.current;
    if (!state || !t) return;
    known.current = state.value;
    onChange(state.value);
    report();
    t.focus({ preventScroll: true });
    // After React has put the text in, which moves the caret to the end.
    requestAnimationFrame(() => {
      t.setSelectionRange(state.start, state.end);
      scrollCaretIntoView(t, state.start);
    });
  };
  const undo = () => show(history.current.undo(current()));
  const redo = () => show(history.current.redo(current()));
  const actions = useRef({ undo, redo });
  actions.current = { undo, redo };

  // Text replaced from outside: a restored version or draft is one step that can be undone;
  // an edit from another device starts the history again (undoing it would quietly overwrite
  // that device's work).
  useEffect(() => {
    const replaced = value !== known.current;
    const reset = historyKey !== knownKey.current;
    knownKey.current = historyKey;
    if (reset) history.current.clear();
    else if (replaced) history.current.record(current(), 'other');
    known.current = value;
    report();
  }, [value, historyKey]);

  // Before the browser changes the text: remember the selection, and take over its own undo
  // (Edit menu, shake to undo on iPhone), so there is one history.
  useEffect(() => {
    const t = el.current;
    if (!t) return;
    const onBeforeInput = (e: InputEvent) => {
      if (e.inputType === 'historyUndo' || e.inputType === 'historyRedo') {
        // Where it can't be stopped, the browser's own undo runs and is recorded as a change.
        if (!e.cancelable) return;
        e.preventDefault();
        if (e.inputType === 'historyUndo') actions.current.undo();
        else actions.current.redo();
        return;
      }
      // Formatting (`run`) already said what is coming.
      if (coming.current?.kind === 'other') return;
      coming.current = {
        start: t.selectionStart,
        end: t.selectionEnd,
        kind: changeKindOf(e.inputType),
      };
    };
    t.addEventListener('beforeinput', onBeforeInput);
    return () => t.removeEventListener('beforeinput', onBeforeInput);
  }, []);

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
    undo,
    redo,
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
    const step = undoKey(e);
    if (step) {
      e.preventDefault();
      return step === 'undo' ? undo() : redo();
    }
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
      onChange={(e) => change(e.target.value)}
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

/**
 * Brings the caret into view after undo or redo moved it. A textarea that grows with its text
 * doesn't scroll itself, the page does, so measure the caret with a hidden copy of the text.
 */
function scrollCaretIntoView(t: HTMLTextAreaElement, at: number) {
  const mirror = document.createElement('div');
  const style = getComputedStyle(t);
  for (const p of [
    'fontFamily',
    'fontSize',
    'fontStyle',
    'fontWeight',
    'fontVariationSettings',
    'letterSpacing',
    'wordSpacing',
    'lineHeight',
    'tabSize',
    'paddingTop',
    'paddingLeft',
    'paddingRight',
  ] as const)
    mirror.style[p] = style[p];
  Object.assign(mirror.style, {
    position: 'absolute',
    top: '0',
    left: '-9999px',
    visibility: 'hidden',
    whiteSpace: 'pre-wrap',
    overflowWrap: 'break-word',
    boxSizing: 'border-box',
    width: `${t.clientWidth}px`,
  });
  mirror.textContent = t.value.slice(0, at);
  const mark = document.createElement('span');
  mark.textContent = '\u200b';
  mirror.appendChild(mark);
  document.body.appendChild(mirror);
  const top = t.getBoundingClientRect().top + t.clientTop + mark.offsetTop;
  const lineHeight = parseFloat(style.lineHeight) || 24;
  document.body.removeChild(mirror);
  // Keep clear of the sticky top bar and of the phone's keyboard.
  const view = window.visualViewport;
  const viewTop = (view?.offsetTop ?? 0) + 120;
  const viewBottom = (view ? view.offsetTop + view.height : window.innerHeight) - 24;
  if (top < viewTop || top + lineHeight > viewBottom)
    window.scrollBy({ top: top - (viewTop + viewBottom) / 2 });
}
