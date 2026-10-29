import type { Ref } from '../../../shared/types';

/**
 * Words in a text linked to a stored file or folder. They are ordinary Markdown links with an
 * in-app address, `[my budget](doc:<id>)` or `[taxes](folder:<id>)`, so they move with the
 * words as the text is edited and need no bookkeeping of their own.
 */
export type AnchorRef = Ref & { type: 'document' | 'folder' };

const SCHEME = { document: 'doc', folder: 'folder' } as const;
const PATTERN = /^(doc|folder):([A-Za-z0-9_-]{1,64})$/;

export const anchorUrl = (ref: AnchorRef) => `${SCHEME[ref.type]}:${ref.id}`;

export function parseAnchorUrl(url: string | undefined): AnchorRef | null {
  const m = url ? PATTERN.exec(url) : null;
  if (!m) return null;
  return { type: m[1] === 'doc' ? 'document' : 'folder', id: m[2]! };
}

/** Every linked passage in a Markdown text, in order. */
export function anchorsIn(markdown: string): { ref: AnchorRef; text: string }[] {
  const out: { ref: AnchorRef; text: string }[] = [];
  for (const m of markdown.matchAll(/\[((?:\\.|[^\]\\])*)\]\(((?:doc|folder):[A-Za-z0-9_-]+)\)/g)) {
    const ref = parseAnchorUrl(m[2]);
    if (ref) out.push({ ref, text: m[1]!.replace(/\\(.)/g, '$1').trim() });
  }
  return out;
}
