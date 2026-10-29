import { Link } from 'react-router-dom';
import type { EntrySummary } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { Empty, ErrorNote } from '../../components/ui/misc';
import { errorMessage } from '../../lib/apiFetch';
import { useNoteList } from './api';
import { NoteRow } from './IdeasPage';
import { EntryRowsSkeleton, GroupHeading, JournalSectionHeader } from './ListParts';

/**
 * Thinking: the questions and beliefs you're working through, grouped by topic.
 * The same notes as Ideas & Knowledge, seen from the writing side.
 */
export default function ThinkingPage() {
  const questions = useNoteList({ type: 'question' });
  const beliefs = useNoteList({ type: 'belief' });

  const loading = questions.isLoading || beliefs.isLoading;
  const error = questions.error ?? beliefs.error;
  const all: EntrySummary[] = [
    ...(questions.data?.pages.flatMap((p) => p.items) ?? []),
    ...(beliefs.data?.pages.flatMap((p) => p.items) ?? []),
  ];

  const byTopic = new Map<string, EntrySummary[]>();
  for (const e of all) {
    const key = e.note?.topic ?? '';
    byTopic.set(key, [...(byTopic.get(key) ?? []), e]);
  }
  const groups = [...byTopic].sort(([a], [b]) =>
    a === '' ? 1 : b === '' ? -1 : a.localeCompare(b),
  );

  return (
    <Page width="default">
      <JournalSectionHeader
        newTo="/ideas/new"
        newLabel="New question"
        newState={{ noteType: 'question' }}
      />
      <p className="mt-4 max-w-prose text-sm text-ink-muted">
        Questions you&apos;re trying to answer and beliefs you want to revisit. Unfinished is fine.
        For everything else you keep, see{' '}
        <Link to="/ideas" className="text-accent hover:underline">
          Ideas &amp; Knowledge
        </Link>
        .
      </p>
      {loading ? (
        <EntryRowsSkeleton pad="py-3.5" heading />
      ) : error ? (
        <ErrorNote
          onRetry={() => {
            void questions.refetch();
            void beliefs.refetch();
          }}
        >
          {errorMessage(error)}
        </ErrorNote>
      ) : !all.length ? (
        <Empty>
          Nothing yet. Start with a question you keep coming back to, or write down something you
          believe and why.
        </Empty>
      ) : (
        groups.map(([topic, items]) => (
          <section key={topic || 'none'}>
            <GroupHeading>{topic || 'No topic'}</GroupHeading>
            <ul className="divide-y divide-line/70 border-t border-line/70">
              {items
                .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
                .map((e) => (
                  <li key={e.id}>
                    <NoteRow e={e} showTopic={false} />
                  </li>
                ))}
            </ul>
          </section>
        ))
      )}
    </Page>
  );
}
