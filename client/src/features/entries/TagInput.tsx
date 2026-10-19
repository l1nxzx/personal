import { X } from 'lucide-react';
import { useId, useState } from 'react';
import type { EntryKind } from '../../../../shared/types';
import { useTags } from './api';

export const normalizeTag = (t: string) =>
  t
    .trim()
    .toLowerCase()
    .replace(/^#/, '')
    .replace(/\s+/g, '-')
    .replace(/[^\p{L}\p{N}_-]/gu, '')
    .slice(0, 32);

/** Quiet tag field: existing tags as small removable labels, then a borderless input. */
export function TagInput({
  kind,
  tags,
  onChange,
}: {
  kind: EntryKind;
  tags: string[];
  onChange: (tags: string[]) => void;
}) {
  const [text, setText] = useState('');
  const listId = useId();
  const suggestions = useTags(kind);

  const add = (raw: string) => {
    const t = normalizeTag(raw);
    if (t && !tags.includes(t) && tags.length < 12) onChange([...tags, t]);
    setText('');
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {tags.map((t) => (
        <span
          key={t}
          className="inline-flex h-7 items-center gap-1 rounded-sm bg-surface-2 pl-2 pr-0.5 text-[0.8125rem] text-ink-muted"
        >
          #{t}
          <button
            type="button"
            aria-label={`Remove tag ${t}`}
            onClick={() => onChange(tags.filter((x) => x !== t))}
            className="flex h-6 w-6 items-center justify-center rounded-sm text-ink-faint hover:text-ink"
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}
      <input
        value={text}
        onChange={(e) => {
          const v = e.target.value;
          if (v.endsWith(',')) add(v.slice(0, -1));
          else setText(v);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            add(text);
          } else if (e.key === 'Backspace' && !text && tags.length) {
            onChange(tags.slice(0, -1));
          }
        }}
        onBlur={() => text && add(text)}
        list={listId}
        placeholder={tags.length ? 'Add tag' : 'Add tags'}
        aria-label="Add tag"
        enterKeyHint="done"
        autoCapitalize="none"
        className="h-7 min-w-[6rem] flex-1 bg-transparent text-[0.8125rem] text-ink-muted placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
      />
      <datalist id={listId}>
        {suggestions.data
          ?.filter((s) => !tags.includes(s.tag))
          .slice(0, 50)
          .map((s) => (
            <option key={s.tag} value={s.tag} />
          ))}
      </datalist>
    </div>
  );
}
