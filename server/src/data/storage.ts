import type { Readable } from 'node:stream';
import { bucket } from '../config/firebase.js';

export async function uploadFile(path: string, data: Buffer, contentType: string): Promise<void> {
  await bucket().file(path).save(data, { contentType, resumable: false });
}

export interface StoredFile {
  stream: Readable;
  contentType: string;
  /** Size of the whole file in bytes. */
  size: number;
  /** The inclusive byte range being streamed, or null for the whole file. */
  range: { start: number; end: number } | null;
}

/**
 * Opens a stored file, optionally only a byte range of it (video players ask for ranges).
 * A range that starts past the end is ignored and the whole file is returned.
 */
export async function openFile(
  path: string,
  range?: { start: number; end?: number },
): Promise<StoredFile | null> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  const size = Number(meta.size ?? 0);
  const r =
    range && range.start < size
      ? { start: range.start, end: Math.min(range.end ?? size - 1, size - 1) }
      : null;
  return {
    stream: file.createReadStream(r ?? undefined),
    contentType: meta.contentType ?? 'application/octet-stream',
    size,
    range: r,
  };
}

export async function deleteFile(path: string): Promise<void> {
  await bucket().file(path).delete({ ignoreNotFound: true });
}
