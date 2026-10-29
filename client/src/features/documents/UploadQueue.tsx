import { useQueryClient } from '@tanstack/react-query';
import { ChevronDown, CircleAlert, CircleCheck, LoaderCircle, RotateCw, X } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { DocumentFile } from '../../../../shared/types';
import { IconButton } from '../../components/ui/Button';
import { errorMessage } from '../../lib/apiFetch';
import { cn } from '../../lib/cn';
import { folderKey, formatSize, uploadDocument } from './api';

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface UploadItem {
  id: number;
  file: File;
  folderId: string | null;
  /** Where it's going, for the panel ("My files", "Taxes"). */
  folderName: string;
  status: 'queued' | 'uploading' | 'done' | 'failed';
  error?: string;
}

/**
 * Uploads one file at a time (the server holds each in memory). Each finished file shows up in
 * its folder straight away; the lists are refreshed once the queue is empty.
 */
export function useUploadQueue() {
  const qc = useQueryClient();
  const [items, setItems] = useState<UploadItem[]>([]);
  const nextId = useRef(1);
  const busy = useRef(false);
  const dirty = useRef(false);

  const patch = (id: number, p: Partial<UploadItem>) =>
    setItems((list) => list.map((i) => (i.id === id ? { ...i, ...p } : i)));

  useEffect(() => {
    if (busy.current) return;
    const next = items.find((i) => i.status === 'queued');
    if (!next) {
      if (dirty.current) {
        dirty.current = false;
        void qc.invalidateQueries({ queryKey: ['documents'] });
        void qc.invalidateQueries({ queryKey: ['home'] });
      }
      return;
    }
    busy.current = true;
    patch(next.id, { status: 'uploading' });
    uploadDocument(next.file, next.folderId).then(
      (doc) => {
        busy.current = false;
        dirty.current = true;
        qc.setQueryData<DocumentFile[]>(folderKey(next.folderId), (old) =>
          old && !old.some((d) => d.id === doc.id) ? [...old, doc] : old,
        );
        patch(next.id, { status: 'done' });
      },
      (err) => {
        busy.current = false;
        patch(next.id, { status: 'failed', error: errorMessage(err) });
      },
    );
  }, [items, qc]);

  const add = useCallback((files: File[], folderId: string | null, folderName: string) => {
    setItems((list) => [
      ...list.filter((i) => i.status !== 'done'),
      ...files.map((file) => ({
        id: nextId.current++,
        file,
        folderId,
        folderName,
        status: 'queued' as const,
      })),
    ]);
  }, []);

  const retry = useCallback((id: number) => {
    setItems((list) =>
      list.map((i) => (i.id === id ? { ...i, status: 'queued', error: undefined } : i)),
    );
  }, []);

  const clear = useCallback(() => {
    setItems((list) => list.filter((i) => i.status === 'queued' || i.status === 'uploading'));
  }, []);

  return { items, add, retry, clear };
}

/** Bottom-corner progress for uploads. Failures stay (with Retry) until dismissed. */
export function UploadPanel({
  items,
  onRetry,
  onClear,
}: {
  items: UploadItem[];
  onRetry: (id: number) => void;
  onClear: () => void;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const total = items.length;
  const done = items.filter((i) => i.status === 'done').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  const active = items.some((i) => i.status === 'queued' || i.status === 'uploading');

  // A clean run tidies itself away after a moment.
  useEffect(() => {
    if (!total || active || failed) return;
    const t = setTimeout(onClear, 4000);
    return () => clearTimeout(t);
  }, [total, active, failed, onClear]);

  if (!total) return null;
  const title = active
    ? `Uploading ${Math.min(done + failed + 1, total)} of ${total}…`
    : failed
      ? `${done} uploaded, ${failed} failed`
      : `${done} ${done === 1 ? 'file' : 'files'} uploaded`;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-[calc(4.25rem+env(safe-area-inset-bottom))] right-3 z-40 w-[min(22rem,calc(100vw-1.5rem))] overflow-hidden rounded-md border border-line bg-raised shadow-[0_12px_32px_-8px_rgb(0_0_0/0.5)] lg:bottom-6 lg:right-6"
    >
      <div className="flex h-11 items-center gap-1 pl-3 pr-1">
        <span className={cn('min-w-0 flex-1 truncate text-sm', failed ? 'text-bad' : 'text-ink')}>
          {title}
        </span>
        <IconButton
          label={collapsed ? 'Show uploads' : 'Hide uploads'}
          onClick={() => setCollapsed((c) => !c)}
        >
          <ChevronDown className={cn('h-4 w-4 transition-transform', collapsed && 'rotate-180')} />
        </IconButton>
        {!active && (
          <IconButton label="Close" onClick={onClear}>
            <X className="h-4 w-4" />
          </IconButton>
        )}
      </div>
      {!collapsed && (
        <ul className="max-h-60 overflow-y-auto border-t border-line py-1">
          {items.map((i) => (
            <li key={i.id} className="flex items-center gap-2.5 px-3 py-1.5">
              <StatusIcon status={i.status} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[0.8125rem] text-ink">{i.file.name}</span>
                <span
                  className={cn(
                    'block truncate text-2xs',
                    i.status === 'failed' ? 'text-bad' : 'text-ink-faint',
                  )}
                >
                  {i.status === 'failed' ? i.error : `${formatSize(i.file.size)} · ${i.folderName}`}
                </span>
              </span>
              {i.status === 'failed' && (
                <IconButton label={`Retry ${i.file.name}`} onClick={() => onRetry(i.id)}>
                  <RotateCw className="h-4 w-4" />
                </IconButton>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  const cls = 'h-4 w-4 shrink-0';
  if (status === 'done') return <CircleCheck className={cn(cls, 'text-ok')} aria-label="Done" />;
  if (status === 'failed')
    return <CircleAlert className={cn(cls, 'text-bad')} aria-label="Failed" />;
  if (status === 'uploading')
    return <LoaderCircle className={cn(cls, 'animate-spin text-accent')} aria-label="Uploading" />;
  return (
    <span className={cn(cls, 'rounded-full border border-line-strong')} aria-label="Waiting" />
  );
}
