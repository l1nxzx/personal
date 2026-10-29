import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  Book,
  BookStatus,
  BookSummary,
  CreateBookRequest,
  CreateFolderRequest,
  DocumentFile,
  DocumentFolder,
  FolderSizes,
  Entry,
  FolderUsage,
  LibrarySelection,
  MoveItemsRequest,
  Page,
  UpdateBookRequest,
  UpdateDocumentRequest,
  UpdateFolderRequest,
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

// ---------------------------------------------------------------- documents & folders
// Every key starts with 'documents' so one invalidation (also used by realtime) refreshes all.

export const folderKey = (folderId: string | null) =>
  ['documents', 'folder', folderId ?? 'root'] as const;

/** Every file, newest first, paginated. */
export function useRecentDocuments(enabled: boolean) {
  return useInfiniteQuery({
    queryKey: ['documents', 'recent'],
    queryFn: ({ pageParam }) =>
      apiFetch<Page<DocumentFile>>('/documents', { query: { limit: 60, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useStarredDocuments(enabled: boolean) {
  return useQuery({
    queryKey: ['documents', 'starred'],
    queryFn: async () =>
      (await apiFetch<Page<DocumentFile>>('/documents', { query: { favorite: 'true' } })).items,
    enabled,
  });
}

/** The files directly inside one folder (null = top level). */
export function useFolderDocuments(folderId: string | null, enabled: boolean) {
  return useQuery({
    queryKey: folderKey(folderId),
    queryFn: async () =>
      (
        await apiFetch<Page<DocumentFile>>('/documents', {
          query: { folderId: folderId ?? 'root' },
        })
      ).items,
    enabled,
  });
}

/** Files anywhere in the library whose name matches every word of `q`. */
export function useDocumentSearch(q: string) {
  return useQuery({
    queryKey: ['documents', 'search', q],
    queryFn: async () => (await apiFetch<Page<DocumentFile>>('/documents', { query: { q } })).items,
    enabled: q.length >= 2,
    placeholderData: (previous) => previous,
  });
}

/** All folders; the tree is built on the client (see `folderTree.ts`). */
export function useFolders() {
  return useQuery({
    queryKey: ['documents', 'folders'],
    queryFn: async () => (await apiFetch<{ items: DocumentFolder[] }>('/documents/folders')).items,
  });
}

/**
 * Stored bytes per folder, through every level. Costs one small read per file, so it is kept
 * for a while; any library change (here or on another device) refreshes it.
 */
export function useFolderSizes() {
  return useQuery({
    queryKey: ['documents', 'folder-sizes'],
    queryFn: async () => (await apiFetch<{ sizes: FolderSizes }>('/documents/folders/sizes')).sizes,
    staleTime: 10 * 60_000,
  });
}

export function useDocument(id: string | null) {
  return useQuery({
    queryKey: ['document', id],
    queryFn: async () => (await apiFetch<{ document: DocumentFile }>(`/documents/${id}`)).document,
    enabled: !!id,
  });
}

export async function uploadDocument(file: File, folderId: string | null): Promise<DocumentFile> {
  const form = new FormData();
  if (folderId) form.set('folderId', folderId);
  form.set('file', file, file.name);
  return (await apiFetch<{ document: DocumentFile }>('/documents', { method: 'POST', body: form }))
    .document;
}

/** After anything that changes where files and folders are or what they're called. */
function useInvalidateLibrary() {
  const qc = useQueryClient();
  return () => {
    void qc.invalidateQueries({ queryKey: ['documents'] });
    void qc.invalidateQueries({ queryKey: ['document'] });
    void qc.invalidateQueries({ queryKey: ['home'] });
    void qc.invalidateQueries({ queryKey: ['links'] });
  };
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

export function useCreateFolder() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async (input: CreateFolderRequest) =>
      (
        await apiFetch<{ folder: DocumentFolder }>('/documents/folders', {
          method: 'POST',
          body: input,
        })
      ).folder,
    onSuccess: invalidate,
  });
}

export function useUpdateFolder() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateFolderRequest }) =>
      (
        await apiFetch<{ folder: DocumentFolder }>(`/documents/folders/${id}`, {
          method: 'PATCH',
          body: patch,
        })
      ).folder,
    onSuccess: invalidate,
  });
}

export function useMoveItems() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (input: MoveItemsRequest) =>
      apiFetch<{ files: number; folders: number }>('/documents/move', {
        method: 'POST',
        body: input,
      }),
    onSuccess: invalidate,
  });
}

/** Deletes files, and folders with everything in them. */
export function useDeleteItems() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: (input: LibrarySelection) =>
      apiFetch('/documents/delete', { method: 'POST', body: input }),
    onSuccess: invalidate,
    // Some files may have gone before an error; show the truth either way.
    onError: invalidate,
  });
}

/** `contents` must be given for a folder that isn't empty (otherwise 409 FOLDER_NOT_EMPTY). */
export function useDeleteFolder() {
  const invalidate = useInvalidateLibrary();
  return useMutation({
    mutationFn: ({ id, contents }: { id: string; contents?: 'move' | 'delete' }) =>
      apiFetch(`/documents/folders/${id}`, { method: 'DELETE', query: { contents } }),
    onSuccess: invalidate,
    onError: invalidate,
  });
}

export const folderUsage = (ids: string[]) =>
  apiFetch<FolderUsage>('/documents/folders/usage', { method: 'POST', body: { ids } });

export const fileUrl = (id: string, opts: { download?: boolean; thumb?: boolean } = {}) =>
  `${API_BASE}/documents/${id}/${opts.thumb ? 'thumb' : 'file'}${opts.download ? '?download=1' : ''}`;

export function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  if (bytes < 1024 ** 3)
    return `${(bytes / 1024 / 1024).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`;
  return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
}

export function fileKind(mime: string, name: string): string {
  if (mime.startsWith('image/')) return 'Image';
  if (mime === 'application/pdf') return 'PDF';
  if (mime.startsWith('text/')) return 'Text';
  if (mime.startsWith('audio/')) return 'Audio';
  if (mime.startsWith('video/')) return 'Video';
  if (/spreadsheet|excel|csv/.test(mime) || /\.(xlsx?|csv|ods)$/i.test(name)) return 'Spreadsheet';
  if (/presentation|powerpoint/.test(mime) || /\.(pptx?|odp|key)$/i.test(name)) return 'Slides';
  if (/word|document|rtf/.test(mime) || /\.(docx?|odt|rtf)$/i.test(name)) return 'Document';
  if (/zip|compressed|tar|rar|7z/.test(mime)) return 'Archive';
  return name.includes('.') ? name.split('.').pop()!.toUpperCase().slice(0, 6) : 'File';
}
