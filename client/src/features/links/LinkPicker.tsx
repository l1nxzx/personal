import { Search } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { Ref, RefType } from '../../../../shared/types';
import { Dialog } from '../../components/ui/Dialog';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { TYPE_LABEL } from '../../lib/routes';
import { useHome, useSearch } from '../me/api';
import { useLinkMutations } from './api';

const LINKABLE = new Set<string>([
  'journal',
  'writing',
  'note',
  'book',
  'project',
  'document',
  'task',
  'moneyIdea',
]);

interface Option {
  ref: Ref;
  title: string;
  hint: string;
}

/** Find anything by search and link it. With an empty query, offers recent items. */
export function LinkPicker({
  open,
  onClose,
  from,
  exclude,
}: {
  open: boolean;
  onClose: () => void;
  from: Ref;
  exclude: string[];
}) {
  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="Link to…"
      hideTitle
      placement="top"
      className="sm:max-h-[70vh]"
    >
      <Picker from={from} exclude={exclude} onDone={onClose} />
    </Dialog>
  );
}

function Picker({ from, exclude, onDone }: { from: Ref; exclude: string[]; onDone: () => void }) {
  const [q, setQ] = useState('');
  const [debounced, setDebounced] = useState('');
  const [active, setActive] = useState(0);
  const search = useSearch(debounced);
  const home = useHome();
  const { add } = useLinkMutations();
  const toast = useToast();

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 180);
    return () => clearTimeout(t);
  }, [q]);

  const skip = new Set([...exclude, `${from.type}:${from.id}`]);
  const options: Option[] = (
    q.trim().length >= 2
      ? (search.data ?? [])
          .filter((r) => LINKABLE.has(r.type))
          .map((r) => ({
            ref: { type: r.type as RefType, id: r.id },
            title: r.title,
            hint: r.snippet,
          }))
      : [
          ...(home.data?.recent ?? []).map((e) => ({
            ref: { type: e.kind, id: e.id },
            title: e.title || e.excerpt,
            hint: '',
          })),
          ...(home.data?.added ?? []).map((a) => ({
            ref: a.ref,
            title: a.title,
            hint: a.subtitle,
          })),
        ]
  ).filter((o) => !skip.has(`${o.ref.type}:${o.ref.id}`));

  useEffect(() => setActive(0), [options.length, debounced]);

  const choose = (o: Option) =>
    add.mutate(
      { from, to: o.ref },
      {
        onSuccess: () => {
          toast({ message: `Linked to “${o.title || 'Untitled'}”` });
          onDone();
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );

  return (
    <div
      className="flex min-h-0 flex-col"
      onKeyDown={(e) => {
        if (e.key === 'ArrowDown') {
          e.preventDefault();
          setActive((a) => Math.min(a + 1, options.length - 1));
        } else if (e.key === 'ArrowUp') {
          e.preventDefault();
          setActive((a) => Math.max(a - 1, 0));
        } else if (e.key === 'Enter' && options[active]) {
          e.preventDefault();
          choose(options[active]);
        }
      }}
    >
      <div className="flex items-center gap-2 border-b border-line px-4">
        <Search className="h-4 w-4 text-ink-faint" strokeWidth={1.75} />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Link to a note, entry, book, project or file…"
          aria-label="Find something to link"
          autoComplete="off"
          className="h-14 min-w-0 flex-1 bg-transparent text-[1.0625rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none sm:h-12"
        />
      </div>
      <div role="listbox" className="min-h-0 flex-1 overflow-y-auto py-1">
        {!q.trim() && options.length > 0 && (
          <p className="px-4 pb-1 pt-3 text-2xs font-medium uppercase tracking-[0.12em] text-ink-faint">
            Recent
          </p>
        )}
        {q.trim().length >= 2 && search.isSuccess && !search.isFetching && options.length === 0 && (
          <p className="px-4 py-3 text-sm text-ink-faint">
            Nothing to link found for “{q.trim()}”.
          </p>
        )}
        {options.map((o, i) => (
          <button
            key={`${o.ref.type}:${o.ref.id}`}
            type="button"
            role="option"
            aria-selected={i === active}
            onMouseMove={() => setActive(i)}
            onClick={() => choose(o)}
            disabled={add.isPending}
            className={cn(
              'mx-1 flex w-[calc(100%-0.5rem)] items-baseline gap-3 rounded px-3 py-2 text-left',
              i === active && 'bg-surface-2',
            )}
          >
            <span className="w-14 shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
              {TYPE_LABEL[o.ref.type]}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm text-ink">{o.title || 'Untitled'}</span>
              {o.hint && (
                <span className="block truncate text-[0.8125rem] text-ink-muted">{o.hint}</span>
              )}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
