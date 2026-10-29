import type { ReactNode } from 'react';
import { formatAgo, formatExact } from '../../lib/dates';
import { Dialog } from './Dialog';

export interface MetadataRow {
  label: string;
  value: ReactNode;
  /** A quieter second line (e.g. "3 hours ago"). */
  hint?: ReactNode;
}

/** Rows can be left out with any falsy value, so callers can list conditional facts inline. */
export interface MetadataSection {
  title: string;
  rows: (MetadataRow | false | '' | null | undefined)[];
}

/** A row for a moment in time: exact to the second, with how long ago underneath. */
export const timeRow = (label: string, iso: string | null | undefined): MetadataRow | null =>
  iso ? { label, value: formatExact(iso), hint: formatAgo(iso) } : null;

/** Read-only facts about one item (Three dots → Metadata). */
export function MetadataDialog({
  open,
  onClose,
  name,
  sections,
}: {
  open: boolean;
  onClose: () => void;
  /** What the facts are about, shown under the heading. */
  name: string;
  sections: MetadataSection[];
}) {
  return (
    <Dialog open={open} onClose={onClose} title="Metadata">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-5 pt-3">
        <p className="truncate font-serif text-[1.0625rem] text-ink">{name}</p>
        {sections.map((s) => {
          const rows = s.rows.filter((r): r is MetadataRow => !!r);
          if (!rows.length) return null;
          return (
            <section key={s.title} className="mt-5">
              <h3 className="section-label mb-1">{s.title}</h3>
              <dl className="divide-y divide-line/60">
                {rows.map((r) => (
                  <div
                    key={r.label}
                    className="grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 py-2 text-sm sm:grid-cols-[9rem_minmax(0,1fr)]"
                  >
                    <dt className="text-ink-faint">{r.label}</dt>
                    <dd className="min-w-0 break-words text-ink">
                      {r.value}
                      {r.hint && <span className="block text-2xs text-ink-faint">{r.hint}</span>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          );
        })}
      </div>
    </Dialog>
  );
}
