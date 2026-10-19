/**
 * Text helpers for search, excerpts and word counts.
 *
 * Firestore has no full-text search, so every searchable document stores `searchTerms`: its unique
 * folded words plus their prefixes (3+ chars). A search is then one `array-contains` query per
 * collection (single-field index, no composite index) followed by in-memory filtering.
 */

const MAX_TERMS = 3000;
const MIN_PREFIX = 3;

/**
 * Lowercases and strips diacritics one code unit at a time, so indexes in the folded string line
 * up with the original (used to cut snippets around a match).
 */
export function fold(text: string): string {
  let out = '';
  for (const ch of text) {
    const f = ch.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
    out +=
      f.length === ch.length ? f : ch.toLowerCase().length === ch.length ? ch.toLowerCase() : ch;
  }
  return out;
}

export function words(text: string): string[] {
  return fold(text).match(/[\p{L}\p{N}]+/gu) ?? [];
}

export function buildSearchTerms(...parts: string[]): string[] {
  const terms = new Set<string>();
  for (const word of new Set(words(parts.join(' ')))) {
    if (terms.size >= MAX_TERMS) break;
    if (word.length > 40) continue; // URLs, hashes and other noise
    terms.add(word);
    for (let i = MIN_PREFIX; i < word.length; i++) terms.add(word.slice(0, i));
  }
  return [...terms].slice(0, MAX_TERMS);
}

/** Query tokens, longest first (the longest is the most selective one to query on). */
export function queryTokens(q: string): string[] {
  return [...new Set(words(q))].sort((a, b) => b.length - a.length);
}

export function matchesAll(terms: readonly string[], tokens: readonly string[]): boolean {
  const set = new Set(terms);
  return tokens.every(
    (t) => set.has(t) || (t.length < MIN_PREFIX && terms.some((w) => w.startsWith(t))),
  );
}

/** Rough Markdown → plain text, for excerpts and snippets. */
export function plainText(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/^\s{0,3}(#{1,6}|>|[-*+]\s+\[[ xX]\]|[-*+]|\d+\.)\s*/gm, '')
    .replace(/[*_`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Plain text for previews: headings are dropped (the title already says that much) and list
 * items or lines without closing punctuation are separated with " · " so they don't run together.
 */
function previewText(markdown: string): string {
  const lines = markdown
    .replace(/```[\s\S]*?```/g, ' ')
    .split('\n')
    .filter((l) => !/^\s{0,3}#{1,6}\s/.test(l))
    .map((l) => plainText(l))
    .filter(Boolean);
  let out = '';
  for (const line of lines) {
    if (!out) out = line;
    else out += /[.!?:;,…"”'’)]$/.test(out) ? ` ${line}` : ` · ${line}`;
  }
  return out;
}

export function excerpt(markdown: string, max = 220): string {
  const text = previewText(markdown) || plainText(markdown);
  if (text.length <= max) return text;
  const cut = text.slice(0, max);
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max - 30))}…`;
}

export function wordCount(markdown: string): number {
  return plainText(markdown).match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu)?.length ?? 0;
}

/** A short piece of `text` around the first occurrence of any token. */
export function snippet(text: string, tokens: readonly string[], radius = 70): string {
  const plain = plainText(text);
  const folded = fold(plain);
  let at = -1;
  for (const t of tokens) {
    const i = folded.indexOf(t);
    if (i !== -1 && (at === -1 || i < at)) at = i;
  }
  if (at === -1) return excerpt(plain, radius * 2);
  const start = Math.max(0, at - radius);
  const end = Math.min(plain.length, at + radius);
  return `${start > 0 ? '…' : ''}${plain.slice(start, end).trim()}${end < plain.length ? '…' : ''}`;
}

/** "Book Notes" → "book-notes". Returns null for tags with nothing usable in them. */
export function normalizeTag(tag: string): string | null {
  const t = tag
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 32);
  return t || null;
}

export function normalizeTags(tags: readonly string[]): string[] {
  return [...new Set(tags.map(normalizeTag).filter((t): t is string => t !== null))].slice(0, 12);
}
