/** A text and its selection, as one undo step returns to it. */
export interface TextState {
  value: string;
  start: number;
  end: number;
}

/**
 * What kind of change is coming. Runs of typing (or of deleting) close together in time are
 * undone together, as in the formatted editor; anything else (formatting, Enter, paste, a
 * restored version) is always a step of its own.
 */
export type ChangeKind = 'insert' | 'delete' | 'other';

/** The same pause as the formatted editor (ProseMirror's `newGroupDelay`). */
const GROUP_MS = 500;
const DEPTH = 300;

/** The kind of change a `beforeinput` event announces. */
export function changeKindOf(inputType: string): ChangeKind {
  if (inputType === 'insertText' || inputType === 'insertCompositionText') return 'insert';
  if (inputType.startsWith('delete') && inputType !== 'deleteByCut' && inputType !== 'deleteByDrag')
    return 'delete';
  return 'other';
}

/**
 * Undo and redo for a plain textarea. The browser's own undo can't be relied on there: it is
 * lost or scrambled whenever the text is set from code (a restored version, a list continued
 * on Enter where `execCommand` is missing), it can't say whether there is anything to undo, and
 * there is no way to trigger it from a button. Every state before a change is kept instead.
 */
export class TextHistory {
  private done: TextState[] = [];
  private undone: TextState[] = [];
  private lastKind: ChangeKind | null = null;
  private lastAt = 0;

  get canUndo() {
    return this.done.length > 0;
  }

  get canRedo() {
    return this.undone.length > 0;
  }

  /** The text is about to change from `before`. */
  record(before: TextState, kind: ChangeKind, now = Date.now()) {
    const joins =
      kind !== 'other' && kind === this.lastKind && now - this.lastAt < GROUP_MS && this.canUndo;
    if (!joins) {
      this.done.push(before);
      if (this.done.length > DEPTH) this.done.shift();
    }
    this.undone = [];
    // A step of its own also ends the run before it, so typing after it starts a new one.
    this.lastKind = kind === 'other' ? null : kind;
    this.lastAt = now;
  }

  /** Returns the state to show, or null when there is nothing to undo. */
  undo(current: TextState): TextState | null {
    const prev = this.done.pop();
    if (!prev) return null;
    this.undone.push(current);
    this.lastKind = null;
    return prev;
  }

  redo(current: TextState): TextState | null {
    const next = this.undone.pop();
    if (!next) return null;
    this.done.push(current);
    this.lastKind = null;
    return next;
  }

  clear() {
    this.done = [];
    this.undone = [];
    this.lastKind = null;
  }
}
