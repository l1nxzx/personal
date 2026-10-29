import { Plus } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import type { BookStatus, BookSummary } from '../../../../shared/types';
import { Page, PageHeader } from '../../components/shell/PageHeader';
import { Button } from '../../components/ui/Button';
import { Empty, ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonText, skeletonWidth } from '../../components/ui/Skeleton';
import { useToast } from '../../context/ToastContext';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { formatRelativeDay, parseLocalDate } from '../../lib/dates';
import { useBooks, useCreateBook } from './api';

export const BOOK_STATUS: { value: BookStatus; label: string }[] = [
  { value: 'reading', label: 'Reading' },
  { value: 'want', label: 'Want to read' },
  { value: 'finished', label: 'Finished' },
  { value: 'paused', label: 'Paused' },
];

export default function LibraryPage() {
  return (
    <Page>
      <PageHeader title="Library" />
      <BooksView />
    </Page>
  );
}

/** Small, quiet rating: filled squares, no stars. */
export function RatingMarks({ rating }: { rating: number | null }) {
  if (!rating) return null;
  return (
    <span className="inline-flex gap-0.5 align-middle" aria-label={`Rated ${rating} of 5`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <span
          key={n}
          className={cn(
            'h-1.5 w-1.5 rounded-[1px]',
            n <= rating ? 'bg-ink-muted' : 'bg-line-strong',
          )}
        />
      ))}
    </span>
  );
}

function BooksView() {
  const [params, setParams] = useSearchParams();
  const status = (params.get('status') as BookStatus | null) ?? 'reading';
  const books = useBooks(status);
  const create = useCreateBook();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState('');
  const [author, setAuthor] = useState('');

  const add = () => {
    const t = title.trim();
    if (!t || create.isPending) return;
    create.mutate(
      { title: t, author: author.trim(), status: status === 'finished' ? 'want' : status },
      {
        onSuccess: (b) => {
          setTitle('');
          setAuthor('');
          toast({
            message: `Added “${b.title}”`,
            action: { label: 'Open', onClick: () => navigate(`/library/books/${b.id}`) },
          });
        },
        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
      },
    );
  };

  return (
    <div className="mt-4">
      <div
        className="scrollbar-none -mx-4 flex gap-1 overflow-x-auto px-4 sm:mx-0 sm:px-0"
        role="group"
        aria-label="Reading status"
      >
        {BOOK_STATUS.map((s) => (
          <button
            key={s.value}
            type="button"
            aria-pressed={status === s.value}
            onClick={() => setParams({ status: s.value }, { replace: true })}
            className={cn(
              'h-9 shrink-0 rounded px-3 text-sm sm:h-7 sm:px-2.5 sm:text-[0.8125rem]',
              status === s.value ? 'bg-surface-2 text-ink' : 'text-ink-muted hover:text-ink',
            )}
          >
            {s.label}
          </button>
        ))}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
        className="mt-4 flex flex-col gap-2 border-y border-line/70 py-2 sm:flex-row sm:items-center"
      >
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <Plus
            className="h-[18px] w-[18px] shrink-0 text-ink-faint"
            strokeWidth={1.75}
            aria-hidden
          />
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Add a book"
            aria-label="Book title"
            maxLength={300}
            className="h-10 min-w-0 flex-1 bg-transparent text-[0.9375rem] text-ink placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
          />
        </div>
        {title.trim() && (
          <div className="flex items-center gap-2 pl-7 sm:pl-0">
            <input
              value={author}
              onChange={(e) => setAuthor(e.target.value)}
              placeholder="Author (optional)"
              aria-label="Author"
              maxLength={200}
              className="h-10 min-w-0 flex-1 rounded border border-line bg-transparent px-3 text-sm text-ink placeholder:text-ink-faint sm:h-8 sm:w-48"
            />
            <Button type="submit" size="sm" variant="primary" busy={create.isPending}>
              Add
            </Button>
          </div>
        )}
      </form>

      {books.isLoading ? (
        <Skeleton>
          <ul className="divide-y divide-line/70">
            {[0, 1, 2, 3].map((i) => (
              <li key={i} className="py-3.5">
                <SkeletonText className="font-serif text-[1.0625rem]" width={skeletonWidth(i)} />
                <SkeletonText className="text-sm" width="30%" />
              </li>
            ))}
          </ul>
        </Skeleton>
      ) : books.isError ? (
        <ErrorNote onRetry={() => void books.refetch()}>{errorMessage(books.error)}</ErrorNote>
      ) : !books.data?.length ? (
        <Empty>
          {status === 'reading'
            ? 'Nothing on the go. Add what you are reading, or pick something from “Want to read”.'
            : status === 'want'
              ? 'Books you might read someday.'
              : status === 'finished'
                ? 'Books you finish will collect here, with your notes and quotes.'
                : 'Nothing paused.'}
        </Empty>
      ) : (
        <ul className="divide-y divide-line/70">
          {books.data.map((b) => (
            <li key={b.id}>
              <BookRow b={b} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function BookRow({ b }: { b: BookSummary }) {
  const when =
    b.status === 'finished' && b.finishedOn
      ? `Finished ${formatRelativeDay(b.finishedOn)}`
      : b.status === 'reading' && b.startedOn
        ? `Since ${formatRelativeDay(b.startedOn)}`
        : null;
  return (
    <Link
      to={`/library/books/${b.id}`}
      className="-mx-2 flex items-baseline gap-4 rounded px-2 py-3.5 hover:bg-surface/70"
    >
      <div className="min-w-0 flex-1">
        <h3
          className="truncate font-serif text-[1.0625rem] font-medium text-ink"
          style={{ fontVariationSettings: "'opsz' 20" }}
        >
          {b.title}
        </h3>
        <p className="truncate text-sm text-ink-muted">
          {b.author || <span className="text-ink-faint">Unknown author</span>}
        </p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1 text-2xs text-ink-faint">
        <RatingMarks rating={b.rating} />
        {when && <span>{when}</span>}
        {b.quoteCount > 0 && (
          <span>
            {b.quoteCount} {b.quoteCount === 1 ? 'quote' : 'quotes'}
          </span>
        )}
      </div>
    </Link>
  );
}

export const yearOf = (d: string) => parseLocalDate(d).getFullYear();
