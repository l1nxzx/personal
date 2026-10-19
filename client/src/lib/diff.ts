/** Minimal LCS diff, used to compare a version with the current text. */

export type DiffOp<T> = { type: 'same' | 'removed' | 'added'; value: T };

export function diff<T>(
  a: T[],
  b: T[],
  eq: (x: T, y: T) => boolean = (x, y) => x === y,
): DiffOp<T>[] {
  // Too large to compare item by item: show as a full replacement.
  if (a.length * b.length > 4_000_000) {
    return [
      ...a.map((value) => ({ type: 'removed' as const, value })),
      ...b.map((value) => ({ type: 'added' as const, value })),
    ];
  }
  const m = a.length;
  const n = b.length;
  const lcs = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      lcs[i]![j] = eq(a[i]!, b[j]!)
        ? lcs[i + 1]![j + 1]! + 1
        : Math.max(lcs[i + 1]![j]!, lcs[i]![j + 1]!);
    }
  }
  const out: DiffOp<T>[] = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (eq(a[i]!, b[j]!)) {
      out.push({ type: 'same', value: a[i]! });
      i++;
      j++;
    } else if (lcs[i + 1]![j]! >= lcs[i]![j + 1]!) {
      out.push({ type: 'removed', value: a[i++]! });
    } else {
      out.push({ type: 'added', value: b[j++]! });
    }
  }
  while (i < m) out.push({ type: 'removed', value: a[i++]! });
  while (j < n) out.push({ type: 'added', value: b[j++]! });
  return out;
}

/** Splits prose into words and the spaces between them, so a diff can be re-joined exactly. */
export const tokens = (s: string) => s.match(/\s+|[^\s]+/g) ?? [];

/**
 * Word diffs interleave ("for" removed, "Completely" added, " " same, …) because spaces match on
 * their own. Merge each changed run, including the spaces inside it, into one removed phrase
 * followed by one added phrase, which reads naturally.
 */
export function groupWords(ops: DiffOp<string>[]): DiffOp<string>[] {
  const out: DiffOp<string>[] = [];
  let removed = '';
  let added = '';
  const flush = () => {
    if (removed) out.push({ type: 'removed', value: removed });
    if (added) out.push({ type: 'added', value: added });
    removed = '';
    added = '';
  };
  ops.forEach((op, i) => {
    const inRun = removed || added;
    const next = ops[i + 1];
    if (op.type === 'removed') removed += op.value;
    else if (op.type === 'added') added += op.value;
    else if (inRun && /^\s+$/.test(op.value) && next && next.type !== 'same') {
      removed += op.value;
      added += op.value;
    } else {
      flush();
      out.push(op);
    }
  });
  flush();
  return out;
}

export interface DiffBlock {
  kind: 'same' | 'changed';
  /** For changed blocks: word-level ops; for same blocks: the text. */
  words?: DiffOp<string>[];
  text?: string;
}

/**
 * Paragraph-level diff, refined to words inside changed paragraphs: readable for long prose.
 */
export function proseDiff(before: string, after: string): DiffBlock[] {
  const paras = diff(before.split('\n'), after.split('\n'));
  const blocks: DiffBlock[] = [];
  let removed: string[] = [];
  let added: string[] = [];
  const flush = () => {
    if (!removed.length && !added.length) return;
    blocks.push({
      kind: 'changed',
      words: groupWords(diff(tokens(removed.join('\n')), tokens(added.join('\n')))),
    });
    removed = [];
    added = [];
  };
  for (const op of paras) {
    if (op.type === 'same') {
      flush();
      blocks.push({ kind: 'same', text: op.value });
    } else if (op.type === 'removed') removed.push(op.value);
    else added.push(op.value);
  }
  flush();
  return blocks;
}
