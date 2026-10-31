import { Ellipsis, Plus } from 'lucide-react';
import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { Moment } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { IconButton } from '../../components/ui/Button';
import { Menu } from '../../components/ui/Menu';
import { Empty, ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { errorMessage } from '../../lib/apiFetch';
import { formatLongDate } from '../../lib/dates';
import { hrefFor, TYPE_LABEL } from '../../lib/routes';
import { JournalSectionHeader } from '../entries/ListParts';
import { useMomentMutations, useMoments } from './api';
import { MomentDialog } from './MomentDialog';

/** The life timeline: moments chosen by hand, newest first, grouped by year. */
export default function TimelinePage() {
  const moments = useMoments();
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<Moment | null>(null);
  const { remove } = useMomentMutations();
  const confirm = useConfirm();

  const byYear = new Map<string, Moment[]>();
  for (const m of moments.data ?? [])
    byYear.set(m.date.slice(0, 4), [...(byYear.get(m.date.slice(0, 4)) ?? []), m]);

  return (
    <Page width="narrow">
      <JournalSectionHeader newTo="/journal/new" newLabel="New entry" />
      <div className="mt-4 flex items-start gap-3">
        <p className="max-w-prose flex-1 text-sm text-ink-muted">
          The experiences and milestones you choose to keep. Nothing is added here automatically;
          add a moment, or use “Add to timeline” on a journal entry or project.
        </p>
        <button
          type="button"
          onClick={() => setAdding(true)}
          className="inline-flex h-10 shrink-0 items-center gap-1.5 rounded border border-line-strong px-3 text-sm text-ink hover:bg-surface-2 active:bg-surface-2/60 sm:h-9"
        >
          <Plus className="h-4 w-4" /> Add moment
        </button>
      </div>

      {moments.isLoading ? (
        <Skeleton className="mt-10">
          <SkeletonText className="font-serif text-[1.375rem]" width="3.5rem" />
          <ol className="mt-3 border-l border-line-strong">
            {[0, 1, 2].map((i) => (
              <li key={i} className="pb-7 pl-6">
                <SkeletonText className="text-2xs" width="7rem" />
                <SkeletonText
                  className="mt-0.5 font-serif text-[1.125rem]"
                  width={skeletonWidth(i)}
                />
                <SkeletonText className="mt-1 text-sm leading-6" width="80%" />
              </li>
            ))}
          </ol>
        </Skeleton>
      ) : moments.isError ? (
        <ErrorNote onRetry={() => void moments.refetch()}>{errorMessage(moments.error)}</ErrorNote>
      ) : !moments.data?.length ? (
        <Empty>
          Nothing on the timeline yet. A move, a first, a decision, a person who changed things.
        </Empty>
      ) : (
        [...byYear].map(([year, items]) => (
          <section key={year} className="mt-10" aria-label={year}>
            <h2
              className="font-serif text-[1.375rem] text-ink-muted"
              style={{ fontVariationSettings: "'opsz' 32" }}
            >
              {year}
            </h2>
            <ol className="mt-3 border-l border-line-strong">
              {items.map((m) => (
                <li key={m.id} id={m.id} className="group relative scroll-mt-20 pb-7 pl-6">
                  <span
                    className="absolute -left-[5px] top-[7px] h-[9px] w-[9px] rounded-full border-2 border-bg bg-accent"
                    aria-hidden
                  />
                  <div className="flex items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-2xs uppercase tracking-[0.1em] text-ink-faint">
                        {formatLongDate(m.date)}
                      </div>
                      <h3
                        className="mt-0.5 font-serif text-[1.125rem] text-ink"
                        style={{ fontVariationSettings: "'opsz' 22" }}
                      >
                        {m.title}
                      </h3>
                      {m.description && (
                        <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-ink-muted">
                          {m.description}
                        </p>
                      )}
                      {m.ref && (
                        <Link
                          to={hrefFor(m.ref.type, m.ref.id)}
                          className="mt-1.5 inline-block text-[0.8125rem] text-accent hover:underline"
                        >
                          Open {TYPE_LABEL[m.ref.type].toLowerCase()}
                        </Link>
                      )}
                    </div>
                    <Menu
                      trigger={(p) => (
                        <IconButton
                          label={`Actions for ${m.title}`}
                          {...p}
                          className="[@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100 [@media(hover:hover)]:aria-expanded:opacity-100"
                        >
                          <Ellipsis className="h-4 w-4" />
                        </IconButton>
                      )}
                      items={[
                        { label: 'Edit', onSelect: () => setEditing(m) },
                        {
                          label: 'Remove from timeline…',
                          danger: true,
                          onSelect: async () => {
                            if (
                              await confirm({
                                title: 'Remove this moment?',
                                message: 'Anything it points to stays where it is.',
                                confirmLabel: 'Remove',
                                danger: true,
                              })
                            ) {
                              remove.mutate(m.id);
                            }
                          },
                        },
                      ]}
                    />
                  </div>
                </li>
              ))}
            </ol>
          </section>
        ))
      )}

      <MomentDialog open={adding} onClose={() => setAdding(false)} />
      <MomentDialog
        open={!!editing}
        onClose={() => setEditing(null)}
        moment={editing ?? undefined}
      />
    </Page>
  );
}
