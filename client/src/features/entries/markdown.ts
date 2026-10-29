/**
 * Small Markdown editing helpers for a plain <textarea>. Edits go through
 * `document.execCommand('insertText')` where supported, so the browser's own undo/redo keeps working.
 */

export interface Edit {
  /** Range to replace. */
  start: number;
  end: number;
  text: string;
  /** Selection to set afterwards (absolute positions in the new value). */
  selStart: number;
  selEnd: number;
}

export function applyEdit(el: HTMLTextAreaElement, edit: Edit, fallback: (value: string) => void) {
  el.focus();
  el.setSelectionRange(edit.start, edit.end);
  // execCommand is deprecated but remains the only way to edit a textarea without losing undo.
  const ok =
    typeof document.execCommand === 'function' &&
    document.execCommand('insertText', false, edit.text);
  if (!ok) {
    fallback(el.value.slice(0, edit.start) + edit.text + el.value.slice(edit.end));
  }
  requestAnimationFrame(() => el.setSelectionRange(edit.selStart, edit.selEnd));
}

/** **bold** / _italic_: wraps the selection, or unwraps it if already wrapped. */
export function wrap(value: string, start: number, end: number, marker: string): Edit {
  const selected = value.slice(start, end);
  const before = value.slice(start - marker.length, start);
  const after = value.slice(end, end + marker.length);
  if (before === marker && after === marker) {
    return {
      start: start - marker.length,
      end: end + marker.length,
      text: selected,
      selStart: start - marker.length,
      selEnd: end - marker.length,
    };
  }
  return {
    start,
    end,
    text: `${marker}${selected}${marker}`,
    selStart: start + marker.length,
    selEnd: end + marker.length,
  };
}

const lineStartOf = (value: string, i: number) => value.lastIndexOf('\n', i - 1) + 1;
const lineEndOf = (value: string, i: number) => {
  const n = value.indexOf('\n', i);
  return n === -1 ? value.length : n;
};

const PREFIX_RE = /^(#{1,6} |> |[-*+] \[[ xX]\] |[-*+] |\d+\. )/;

/** Toggles a line prefix ("## ", "> ", "- ", "- [ ] ") on every selected line. */
export function togglePrefix(value: string, start: number, end: number, prefix: string): Edit {
  const from = lineStartOf(value, start);
  const to = lineEndOf(value, end);
  const lines = value.slice(from, to).split('\n');
  const allHave = lines.every((l) => l.startsWith(prefix) || !l.trim());
  const next = lines.map((l) => {
    if (!l.trim() && lines.length > 1) return l;
    if (allHave) return l.slice(prefix.length);
    return prefix + l.replace(PREFIX_RE, '');
  });
  const text = next.join('\n');
  const delta = text.length - (to - from);
  return {
    start: from,
    end: to,
    text,
    selStart: lines.length === 1 ? Math.max(from, start + delta) : from,
    selEnd: lines.length === 1 ? Math.max(from, end + delta) : from + text.length,
  };
}

export function link(value: string, start: number, end: number): Edit {
  const label = value.slice(start, end) || 'link';
  const text = `[${label}](https://)`;
  const urlStart = start + label.length + 3;
  return { start, end, text, selStart: urlStart, selEnd: urlStart + 'https://'.length };
}

/**
 * Links the selected words to an address (a file or folder in the library). With nothing
 * selected, `fallback` (the file's name) is inserted as the linked text.
 */
export function linkTo(
  value: string,
  start: number,
  end: number,
  url: string,
  fallback: string,
): Edit {
  const chosen = value.slice(start, end);
  // Keep the spaces around a double-tapped word outside the link.
  const lead = chosen.length - chosen.trimStart().length;
  const trail = chosen.length - chosen.trimEnd().length;
  const label = (chosen.trim() || fallback).replace(/[[\]\\]/g, (c) => `\\${c}`);
  const text = `[${label}](${url})`;
  const s = start + (chosen.trim() ? lead : 0);
  const e = end - (chosen.trim() ? trail : 0);
  return { start: s, end: e, text, selStart: s + text.length, selEnd: s + text.length };
}

/**
 * Enter inside a list or quote continues it; Enter on an empty item ends it.
 * Returns null when Enter should behave normally.
 */
export function continueList(value: string, caret: number): Edit | null {
  const from = lineStartOf(value, caret);
  const line = value.slice(from, caret);
  const m = /^(\s*)([-*+] \[[ xX]\] |[-*+] |(\d+)\. |> )/.exec(line);
  if (!m) return null;
  const [whole, indent = '', marker = '', num] = m;
  if (line.trim() === marker.trim() || line === whole) {
    // Empty item: remove the marker instead of continuing.
    return { start: from, end: caret, text: '', selStart: from, selEnd: from };
  }
  let nextMarker = marker;
  if (num) nextMarker = `${Number(num) + 1}. `;
  else if (/\[[ xX]\]/.test(marker)) nextMarker = marker.replace(/\[[xX]\]/, '[ ]');
  const text = `\n${indent}${nextMarker}`;
  return {
    start: caret,
    end: caret,
    text,
    selStart: caret + text.length,
    selEnd: caret + text.length,
  };
}
