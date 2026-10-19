import type { Readable } from 'node:stream';
import { bucket } from '../config/firebase.js';

export async function uploadFile(path: string, data: Buffer, contentType: string): Promise<void> {
  await bucket().file(path).save(data, { contentType, resumable: false });
}

export async function openFile(
  path: string,
): Promise<{ stream: Readable; contentType: string } | null> {
  const file = bucket().file(path);
  const [exists] = await file.exists();
  if (!exists) return null;
  const [meta] = await file.getMetadata();
  return {
    stream: file.createReadStream(),
    contentType: meta.contentType ?? 'application/octet-stream',
  };
}

export async function deleteFile(path: string): Promise<void> {
  await bucket().file(path).delete({ ignoreNotFound: true });
}
