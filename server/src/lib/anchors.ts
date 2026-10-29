/**
 * Words in an entry linked to a library file or folder are Markdown links to `doc:<id>` or
 * `folder:<id>` (see client/src/lib/anchors.ts). Returns the link keys they point at.
 */
export function anchorKeys(markdown: string): Set<string> {
  const out = new Set<string>();
  for (const m of markdown.matchAll(/\]\((doc|folder):([A-Za-z0-9_-]{1,64})\)/g))
    out.add(`${m[1] === 'doc' ? 'document' : 'folder'}:${m[2]}`);
  return out;
}
