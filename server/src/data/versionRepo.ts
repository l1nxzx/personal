import type { EntryKind, SealedBox } from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import { versionOf, type EntryRecord } from './entryRepo.js';

/**
 * Earlier versions of journal entries, writings and notes, in users/{uid}/versions.
 * Taken automatically now and then while editing (see entryService) or by hand.
 */
export interface VersionRecord {
  id: string;
  entryId: string;
  kind: EntryKind;
  title: string;
  body: string;
  tags: string[];
  wordCount: number;
  savedAt: string;
  label: string | null;
  /** Encrypted in the browser (a locked entry's history): `body` and `tags` are empty. */
  sealed: SealedBox | null;
}

const col = (uid: string) => db().collection('users').doc(uid).collection('versions');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): VersionRecord => ({
  id,
  entryId: d.entryId,
  kind: d.kind,
  title: d.title ?? '',
  body: d.body ?? '',
  tags: d.tags ?? [],
  wordCount: d.wordCount ?? 0,
  savedAt: d.savedAt,
  label: d.label ?? null,
  sealed: d.sealed ?? null,
});

export async function add(
  uid: string,
  kind: EntryKind,
  entry: EntryRecord,
  label: string | null,
  /** A locked entry's version, encrypted in the browser (label included). */
  sealed?: SealedBox,
): Promise<string> {
  const ref = col(uid).doc();
  await ref.set({ ...versionOf(kind, entry, label), ...(sealed && { sealed }) });
  return ref.id;
}

/** All versions of one entry (equality query; the caller sorts). Bodies are left out. */
export async function listFor(uid: string, entryId: string) {
  const snap = await col(uid)
    .where('entryId', '==', entryId)
    .select('entryId', 'kind', 'title', 'tags', 'wordCount', 'savedAt', 'label')
    .limit(500)
    .get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function get(uid: string, id: string): Promise<VersionRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function removeAllFor(uid: string, entryId: string): Promise<void> {
  const snap = await col(uid).where('entryId', '==', entryId).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

/** Ids of an entry's versions, whether each is sealed, and with which key (no text is read). */
export async function sealStates(uid: string, entryId: string) {
  const snap = await col(uid)
    .where('entryId', '==', entryId)
    .select('sealed.k', 'sealed.iv')
    .limit(1000)
    .get();
  return snap.docs.map((d) => ({
    id: d.id,
    sealed: !!d.get('sealed.iv'),
    keyId: (d.get('sealed.k') as string | undefined) ?? null,
  }));
}

/**
 * Overwrites the text of many versions (sealing or unsealing them), in batches kept well under
 * Firestore's request size. The old field values are replaced, not kept anywhere.
 */
export async function rewrite(
  uid: string,
  patches: {
    id: string;
    body: string;
    tags: string[];
    sealed: SealedBox | null;
    wordCount: number;
    label: string | null;
  }[],
): Promise<void> {
  const LIMIT_BYTES = 4_000_000;
  let batch = db().batch();
  let bytes = 0;
  let count = 0;
  for (const p of patches) {
    const size = p.body.length + (p.sealed?.data.length ?? 0) + 200;
    if (count && (bytes + size > LIMIT_BYTES || count >= 400)) {
      await batch.commit();
      batch = db().batch();
      bytes = 0;
      count = 0;
    }
    const { id, ...fields } = p;
    batch.update(col(uid).doc(id), fields);
    bytes += size;
    count++;
  }
  if (count) await batch.commit();
}
