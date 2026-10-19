import type { EntryKind } from '../../../shared/types.js';
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
});

export async function add(
  uid: string,
  kind: EntryKind,
  entry: EntryRecord,
  label: string | null,
): Promise<string> {
  const ref = col(uid).doc();
  await ref.set(versionOf(kind, entry, label));
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
