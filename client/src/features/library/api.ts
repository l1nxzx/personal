import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Book,
  BookStatus,
  BookSummary,
  CreateBookRequest,
  DocumentFile,
  Entry,
  FolderCount,
  Page,
  UpdateBookRequest,
  UpdateDocumentRequest,
} from '../../../../shared/types';
import { API_BASE, apiFetch } from '../../lib/apiFetch';

// ---------------------------------------------------------------- books

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

// ---------------------------------------------------------------- documents

export interface DocFilters {
  folder?: string;
  favorite?: boolean;
}

export function useDocuments(filters: DocFilters) {
  return useInfiniteQuery({
    queryKey: ['documents', 'list', filters],
    queryFn: ({ pageParam }) =>
      apiFetch<Page<DocumentFile>>('/documents', {
        query: {
          limit: 60,
          cursor: pageParam,
          folder: filters.folder,
          favorite: filters.favorite ? 'true' : undefined,
        },
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
}

export function useFolders() {
  return useQuery({
    queryKey: ['documents', 'folders'],
    queryFn: async () => (await apiFetch<{ items: FolderCount[] }>('/documents/folders')).items,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () => (await apiFetch<{ document: DocumentFile }>(`/documents/${id}`)).document,
    enabled: !!id,
  });
}

export async function uploadDocument(
  file: File,
  folder: string | undefined,
): Promise<DocumentFile> {
  const form = new FormData();
  if (folder) form.set('folder', folder);
  form.set('file', file, file.name);
  return (await apiFetch<{ document: DocumentFile }>('/documents', { method: 'POST', body: form }))
    .document;
}

export function useUpdateDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateDocumentRequest }) =>
      (
        await apiFetch<{ document: DocumentFile }>(`/documents/${id}`, {
          method: 'PATCH',
          body: patch,
        })
      ).document,
    onSuccess: (d) => {
      qc.setQueryData(['document', d.id], d);
      void qc.invalidateQueries({ queryKey: ['documents'] });
    },
  });
}

export function useDeleteDocument() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/documents/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['document', id] });
      void qc.invalidateQueries({ queryKey: ['documents'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export const fileUrl = (id: string, opts: { download?: boolean; thumb?: boolean } = {}) =>
  `${API_BASE}/documents/${id}/${opts.thumb ? 'thumb' : 'file'}${opts.download ? '?download=1' : ''}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
}

export function fileKind(mime: string, name: string): string {
  if (mime.startsWith('image/')) return 'Image';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('text/')) return 'Text';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('video/')) return 'Video';
  if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx?|csv|ods)$/i.test(name)) return 'Spreadsheet';
  if (/word|document|rtf/.test(mime) || /\.(docx?|odt|rtf)$/i.test(name)) return 'Document';
  if (/zip|compressed|tar|rar|7z/.test(mime)) return 'Archive';
  return name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 6) : 'File';
}
