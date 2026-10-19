import { ArrowDownLeft, Plus, X } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Ref } from '../../../../shared/types';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { hrefFor, TYPE_LABEL } from '../../lib/routes';
import { useLinkMutations, useLinks } from './api';
import { LinkPicker } from './LinkPicker';

/**
 * "Linked" section shown under journal entries, writing, notes, books, projects and files.
 * Links are optional and work both ways: linking A to B also lists A on B.
 */
export function LinksPanel({ item: self, className }: { item: Ref | null; className?: string }) {
  const links = useLinks(self);
  const { remove } = useLinkMutations();
  const toast = useToast();
  const [picking, setPicking] = useState(false);

  if (!self) return null;
  const items = links.data ?? [];

  return (
    <section aria-labelledby="linked-heading" className={className}>
      <div className="mb-1 flex items-center gap-3">
        <h2 id="linked-heading" className="section-label flex-1">
          Linked
        </h2>
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="-my-1 inline-flex h-9 items-center gap-1 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 hover:text-ink sm:h-7"
        >
          <Plus className="h-3.5 w-3.5" /> Link
        </button>
      </div>
      {links.isSuccess && !items.length && (
        <p className="py-1.5 text-sm text-ink-faint">
          Nothing linked yet. Connect notes, entries, books, projects or files that belong together.
        </p>
      )}
      <ul className="-mx-2">
        {items.map((l) => (
          <li key={`${l.ref.type}:${l.ref.id}`} className="group flex items-center gap-1">
            <Link
              to={hrefFor(l.ref.type, l.ref.id)}
              className="flex min-w-0 flex-1 items-baseline gap-3 rounded px-2 py-2 hover:bg-surface/70"
            >
              <span className="w-14 shrink-0 text-2xs uppercase tracking-wider text-ink-faint">
                {TYPE_LABEL[l.ref.type]}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm text-ink">{l.title || 'Untitled'}</span>
                {l.subtitle && (
                  <span className="block truncate text-2xs text-ink-faint">{l.subtitle}</span>
                )}
              </span>
              {l.direction === 'in' && (
                <ArrowDownLeft
                  className="h-3.5 w-3.5 shrink-0 text-ink-faint"
                  aria-label="Links here"
                />
              )}
            </Link>
            <button
              type="button"
              aria-label={`Remove link to ${l.title || 'Untitled'}`}
              onClick={() =>
                remove.mutate(
                  { from: self, to: l.ref },
                  { onError: (err) => toast({ message: errorMessage(err), tone: 'error' }) },
                )
              }
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded text-ink-faint opacity-100 hover:bg-surface-2 hover:text-ink sm:h-7 sm:w-7 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:focus:opacity-100 [@media(hover:hover)]:group-hover:opacity-100"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          </li>
        ))}
      </ul>
      <LinkPicker
        open={picking}
        onClose={() => setPicking(false)}
        from={self}
        exclude={items.map((l) => `${l.ref.type}:${l.ref.id}`)}
      />
    </section>
  );
}
