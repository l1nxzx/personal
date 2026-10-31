import { ChevronLeft, Ellipsis, Lightbulb, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { Book, BookStatus, Quote } from '../../../../shared/types';
import { Page } from '../../components/shell/PageHeader';
import { AutoSaveText } from '../../components/ui/AutoSaveText';
import { Button, IconButton } from '../../components/ui/Button';
import { controlClass } from '../../components/ui/Field';
import { Menu } from '../../components/ui/Menu';
import { ErrorNote } from '../../components/ui/misc';
import { Skeleton, SkeletonBlock, SkeletonText } from '../../components/ui/Skeleton';
import { useConfirm } from '../../context/ConfirmContext';
import { useToast } from '../../context/ToastContext';
import { ApiError, errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { today } from '../../lib/dates';
import { LinksPanel } from '../links/LinksPanel';
import { useBook, useDeleteBook, useQuoteToNote, useUpdateBook } from './api';
import { BOOK_STATUS } from './LibraryPage';
import { useQuickAction } from '../../context/UIContext';

const newId = () => Math.random().toString(36).slice(2, 10);

export default function BookPage() {
  const { id = '' } = useParams();
  const book = useBook(id);
  const navigate = useNavigate();
  return (
    <Page width="narrow">
      <div className="pt-safe flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center lg:mt-4">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? navigate(-1) : navigate('/library'))}
          className="-ml-2 flex h-10 items-center gap-1 rounded pl-1 pr-2 text-sm text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-8"
        >
          <ChevronLeft className="h-5 w-5 sm:h-4 sm:w-4" /> Library
        </button>
      </div>
      {book.data ? (
        <BookView key={book.data.id} book={book.data} />
      ) : book.isError ? (
        book.error instanceof ApiError && book.error.status === 404 ? (
          <ErrorNote>This book is no longer in your library.</ErrorNote>
        ) : (
          <ErrorNote onRetry={() => void book.refetch()}>{errorMessage(book.error)}</ErrorNote>
        )
      ) : (
        <Skeleton>
          <SkeletonText className="page-title" width="60%" />
          <SkeletonText className="mt-1 text-[1.0625rem]" width="35%" />
          <div className="mt-5 space-y-3 border-y border-line/70 py-3">
            {['15rem', '13rem', '8rem'].map((w) => (
              <div
                key={w}
                className="grid grid-cols-1 gap-3 sm:grid-cols-[5.5rem_1fr] sm:items-center"
              >
                <SkeletonText className="text-[0.8125rem]" width="3rem" />
                <SkeletonBlock className="h-9 sm:h-8" style={{ width: w, maxWidth: '100%' }} />
              </div>
            ))}
          </div>
        </Skeleton>
      )}
    </Page>
  );
}

function BookView({ book }: { book: Book }) {
  const update = useUpdateBook(book.id);
  const del = useDeleteBook();
  const confirm = useConfirm();
  const toast = useToast();
  const navigate = useNavigate();
  const [title, setTitle] = useState(book.title);
  const [author, setAuthor] = useState(book.author);

  const save = (patch: Parameters<typeof update.mutate>[0]) =>
    update.mutate(patch, {
      onError: (err) => toast({ message: `Not saved: ${errorMessage(err)}`, tone: 'error' }),
    });

  const setStatus = (status: BookStatus) => {
    // Fill in the obvious date in the owner's own time zone.
    const patch: Parameters<typeof save>[0] = { status };
    if (status === 'reading' && !book.startedOn) patch.startedOn = today();
    if (status === 'finished' && !book.finishedOn) patch.finishedOn = today();
    save(patch);
  };

  const remove = async () => {
    const ok = await confirm({
      title: `Remove “${book.title}”?`,
      message:
        'Your notes and quotes on it will be deleted too. Quotes already saved to Ideas stay there.',
      confirmLabel: 'Remove',
      danger: true,
    });
    if (!ok) return;
    await del
      .mutateAsync(book.id)
      .then(() => {
        toast({ message: 'Book removed' });
        navigate('/library', { replace: true });
      })
      .catch((err) => toast({ message: errorMessage(err), tone: 'error' }));
  };

  return (
    <div>
      <div className="flex items-start gap-2">
        <div className="min-w-0 flex-1">
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onBlur={() =>
              title.trim() && title.trim() !== book.title && save({ title: title.trim() })
            }
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            aria-label="Title"
            maxLength={300}
            className="page-title w-full bg-transparent focus:outline-none focus-visible:outline-none"
          />
          <input
            value={author}
            onChange={(e) => setAuthor(e.target.value)}
            onBlur={() => author.trim() !== book.author && save({ author: author.trim() })}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            placeholder="Author"
            aria-label="Author"
            maxLength={200}
            className="mt-1 w-full bg-transparent text-[1.0625rem] text-ink-muted placeholder:text-ink-faint focus:outline-none focus-visible:outline-none"
          />
        </div>
        <Menu
          trigger={(p) => (
            <IconButton label="Book actions" {...p} className="mt-1">
              <Ellipsis className="h-4 w-4" />
            </IconButton>
          )}
          items={[
            {
              label: 'Remove from library…',
              icon: <Trash2 />,
              danger: true,
              onSelect: () => void remove(),
            },
          ]}
        />
      </div>

      <div className="mt-5 grid grid-cols-1 gap-3 border-y border-line/70 py-3 sm:grid-cols-[5.5rem_1fr] sm:items-center">
        <span className="text-[0.8125rem] text-ink-faint">Status</span>
        <div className="flex flex-wrap gap-1" role="radiogroup" aria-label="Status">
          {BOOK_STATUS.map((s) => (
            <button
              key={s.value}
              type="button"
              role="radio"
              aria-checked={book.status === s.value}
              onClick={() => book.status !== s.value && setStatus(s.value)}
              className={cn(
                'h-8 rounded border px-2.5 text-[0.8125rem] sm:h-7',
                book.status === s.value
                  ? 'border-accent/60 bg-accent/10 text-ink'
                  : 'border-line text-ink-muted hover:text-ink',
              )}
            >
              {s.label}
            </button>
          ))}
        </div>
        <span className="text-[0.8125rem] text-ink-faint">Dates</span>
        <div className="flex flex-wrap items-center gap-2 text-sm text-ink-muted">
          <label className="inline-flex items-center gap-2">
            Started
            <input
              type="date"
              value={book.startedOn ?? ''}
              onChange={(e) => save({ startedOn: e.target.value || null })}
              className="h-9 rounded border border-line bg-transparent px-2 text-ink sm:h-8"
            />
          </label>
          <label className="inline-flex items-center gap-2">
            Finished
            <input
              type="date"
              value={book.finishedOn ?? ''}
              onChange={(e) => save({ finishedOn: e.target.value || null })}
              className="h-9 rounded border border-line bg-transparent px-2 text-ink sm:h-8"
            />
          </label>
        </div>
        <span className="text-[0.8125rem] text-ink-faint">Rating</span>
        <div className="flex items-center gap-1" role="radiogroup" aria-label="Rating (optional)">
          {[1, 2, 3, 4, 5].map((n) => (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={book.rating === n}
              aria-label={`${n} of 5`}
              onClick={() => save({ rating: book.rating === n ? null : n })}
              className="touch-target flex h-9 w-9 items-center justify-center rounded hover:bg-surface-2 active:bg-surface-2/60 sm:h-7 sm:w-7"
            >
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-[2px]',
                  book.rating && n <= book.rating ? 'bg-ink-muted' : 'bg-line-strong',
                )}
              />
            </button>
          ))}
          {book.rating && <span className="ml-2 text-2xs text-ink-faint">Tap again to clear</span>}
        </div>
      </div>

      <section className="mt-10" aria-labelledby="b-notes">
        <h2 id="b-notes" className="section-label mb-2">
          My notes
        </h2>
        <AutoSaveText
          value={book.notes}
          onSave={(notes) => save({ notes })}
          label="Notes on this book"
          placeholder="What it's about, what struck you, what you disagree with…"
        />
      </section>

      <Quotes book={book} onChange={(quotes) => save({ quotes })} />

      <LinksPanel item={{ type: 'book', id: book.id }} className="mt-12" />
    </div>
  );
}

function QuoteForm({
  initial,
  onSave,
  onCancel,
}: {
  initial?: Quote;
  onSave: (q: Quote) => void;
  onCancel: () => void;
}) {
  const [text, setText] = useState(initial?.text ?? '');
  const [page, setPage] = useState(initial?.page ?? '');
  const [note, setNote] = useState(initial?.note ?? '');
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!text.trim()) return;
        onSave({
          id: initial?.id ?? newId(),
          text: text.trim(),
          page: page.trim() || null,
          note: note.trim(),
        });
      }}
      className="space-y-2"
    >
      <textarea
        autoFocus
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        placeholder="The passage, word for word"
        aria-label="Quote"
        className={cn(controlClass, 'font-serif text-[1.0625rem] leading-7')}
      />
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          value={page}
          onChange={(e) => setPage(e.target.value)}
          placeholder="Page"
          aria-label="Page"
          maxLength={20}
          className={cn(controlClass, 'h-10 sm:h-8 sm:w-24')}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Why it matters (optional)"
          aria-label="Your note"
          className={cn(controlClass, 'h-10 flex-1 sm:h-8')}
        />
      </div>
      <div className="flex gap-2">
        <Button type="submit" size="sm" variant="primary" disabled={!text.trim()}>
          Save quote
        </Button>
        <Button size="sm" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}

function Quotes({ book, onChange }: { book: Book; onChange: (q: Quote[]) => void }) {
  const [adding, setAdding] = useState(false);
  useQuickAction('Add a quote', () => setAdding(true));
  const [editing, setEditing] = useState<string | null>(null);
  const toNote = useQuoteToNote(book.id);
  const toast = useToast();
  const navigate = useNavigate();
  const confirm = useConfirm();

  return (
    <section className="mt-12" aria-labelledby="b-quotes">
      <div className="mb-2 flex items-center gap-3">
        <h2 id="b-quotes" className="section-label flex-1">
          Quotes & passages
        </h2>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="-my-1 inline-flex h-9 items-center gap-1 rounded px-2 text-[0.8125rem] text-ink-muted hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-7"
          >
            <Plus className="h-3.5 w-3.5" /> Add
          </button>
        )}
      </div>
      {adding && (
        <div className="mb-6">
          <QuoteForm
            onSave={(q) => {
              onChange([...book.quotes, q]);
              setAdding(false);
            }}
            onCancel={() => setAdding(false)}
          />
        </div>
      )}
      {!book.quotes.length && !adding && (
        <p className="text-sm text-ink-faint">Passages worth keeping from this book.</p>
      )}
      <ul className="space-y-6">
        {book.quotes.map((q) =>
          editing === q.id ? (
            <li key={q.id}>
              <QuoteForm
                initial={q}
                onSave={(next) => {
                  onChange(book.quotes.map((x) => (x.id === q.id ? next : x)));
                  setEditing(null);
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={q.id} className="group">
              <blockquote
                className="border-l-2 border-accent/50 pl-4 font-serif text-[1.0625rem] italic leading-7 text-ink"
                style={{ fontVariationSettings: "'opsz' 18" }}
              >
                {q.text}
              </blockquote>
              <div className="mt-1.5 flex flex-wrap items-center gap-x-3 pl-4 text-2xs text-ink-faint">
                {q.page && <span>p. {q.page}</span>}
                {q.note && <span className="text-ink-muted">{q.note}</span>}
                <span className="ml-auto flex gap-1">
                  <button
                    type="button"
                    disabled={toNote.isPending}
                    onClick={() =>
                      toNote.mutate(q.id, {
                        onSuccess: (note) =>
                          toast({
                            message: 'Saved to Ideas as a quote',
                            action: { label: 'Open', onClick: () => navigate(`/ideas/${note.id}`) },
                          }),
                        onError: (err) => toast({ message: errorMessage(err), tone: 'error' }),
                      })
                    }
                    className="inline-flex h-8 items-center gap-1 rounded px-2 hover:bg-surface-2 active:bg-surface-2/60 hover:text-ink sm:h-6"
                  >
                    <Lightbulb className="h-3 w-3" /> Save to Ideas
                  </button>
                  <IconButton
                    label="Edit quote"
                    onClick={() => setEditing(q.id)}
                    className="sm:h-6 sm:w-6"
                  >
                    <Pencil className="h-3 w-3" />
                  </IconButton>
                  <IconButton
                    label="Delete quote"
                    onClick={async () => {
                      if (
                        await confirm({
                          title: 'Delete this quote?',
                          confirmLabel: 'Delete',
                          danger: true,
                        })
                      ) {
                        onChange(book.quotes.filter((x) => x.id !== q.id));
                      }
                    }}
                    className="sm:h-6 sm:w-6"
                  >
                    <Trash2 className="h-3 w-3" />
                  </IconButton>
                </span>
              </div>
            </li>
          ),
        )}
      </ul>
    </section>
  );
}
