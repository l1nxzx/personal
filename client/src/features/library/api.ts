import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Book,
  BookStatus,
  BookSummary,
  CreateBookRequest,
  Entry,
  UpdateBookRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export function useBooks(status: BookStatus) {
  return useQuery({
    queryKey: ['books', 'list', status],
    queryFn: async () =>
      (await apiFetch<{ items: BookSummary[] }>('/books', { query: { status } })).items,
  });
}

export function useBook(id: string) {
  return useQuery({
    queryKey: ['book', id],
    queryFn: async () => (await apiFetch<{ book: Book }>(`/books/${id}`)).book,
  });
}

export function useCreateBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateBookRequest) =>
      (await apiFetch<{ book: Book }>('/books', { method: 'POST', body: input })).book,
    onSuccess: (b) => {
      qc.setQueryData(['book', b.id], b);
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

/** Optimistic: the page reflects the change at once and rolls back if saving fails. */
export function useUpdateBook(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateBookRequest) =>
      (await apiFetch<{ book: Book }>(`/books/${id}`, { method: 'PATCH', body: patch })).book,
    onMutate: (patch) => {
      const previous = qc.getQueryData<Book>(['book', id]);
      if (previous) qc.setQueryData(['book', id], { ...previous, ...patch });
      return { previous };
    },
    onError: (_e, _v, ctx) => ctx?.previous && qc.setQueryData(['book', id], ctx.previous),
    onSuccess: (b) => {
      qc.setQueryData(['book', id], b);
      void qc.invalidateQueries({ queryKey: ['books'] });
    },
  });
}

export function useDeleteBook() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/books/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['book', id] });
      void qc.invalidateQueries({ queryKey: ['books'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useQuoteToNote(bookId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (quoteId: string) =>
      (
        await apiFetch<{ entry: Entry }>(`/books/${bookId}/quotes/${quoteId}/note`, {
          method: 'POST',
        })
      ).entry,
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['entries', 'note'] });
      void qc.invalidateQueries({ queryKey: ['links'] });
    },
  });
}
