import { db } from '../config/firebase.js';
import type { MiniappSettings } from '../../../shared/types.js';

/**
 * Miniapps (client/miniapps/): the server knows nothing about any particular app. Each app gets
 * one document, users/{uid}/miniapps/{appId}, holding whether it is enabled, whether its widget
 * is on Home, and its own data as a JSON string. Screen settings (wallpaper, icon order) are in
 * users/{uid}/meta/miniapps.
 */
export interface MiniappRecord {
  id: string;
  enabled: boolean;
  onHome: boolean;
  json: string | null;
  rev: number;
  updatedAt: string;
  dataUpdatedAt: string | null;
}

export type StoredSettings = MiniappSettings & { wallpaperPath: string | null };

const userDoc = (uid: string) => db().collection('users').doc(uid);
const settingsDoc = (uid: string) => userDoc(uid).collection('meta').doc('miniapps');
const col = (uid: string) => userDoc(uid).collection('miniapps');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): MiniappRecord => ({
  id,
  enabled: d.enabled ?? false,
  onHome: d.onHome ?? false,
  json: d.json ?? null,
  rev: d.rev ?? 0,
  updatedAt: d.updatedAt,
  dataUpdatedAt: d.dataUpdatedAt ?? null,
});

export async function getSettings(uid: string): Promise<Partial<StoredSettings>> {
  return ((await settingsDoc(uid).get()).data() as Partial<StoredSettings> | undefined) ?? {};
}

export async function setSettings(uid: string, patch: Partial<StoredSettings>): Promise<void> {
  await settingsDoc(uid).set(patch, { merge: true });
}

/** Every app's install state, without the data itself. */
export async function listApps(
  uid: string,
): Promise<(Omit<MiniappRecord, 'json'> & { hasData: boolean })[]> {
  const snap = await col(uid)
    .select('enabled', 'onHome', 'rev', 'updatedAt', 'dataUpdatedAt', 'hasData')
    .get();
  return snap.docs.map((d) => ({
    ...toRecord(d.id, d.data()),
    hasData: d.get('hasData') ?? false,
  }));
}

export async function get(uid: string, appId: string): Promise<MiniappRecord | null> {
  const snap = await col(uid).doc(appId).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function setInstall(
  uid: string,
  appId: string,
  patch: { enabled?: boolean; onHome?: boolean },
): Promise<void> {
  await col(uid)
    .doc(appId)
    .set({ ...patch, updatedAt: new Date().toISOString() }, { merge: true });
}

export type PutResult =
  { status: 'ok'; rev: number; at: string } | { status: 'conflict'; rev: number };

/** Saves the app's data if the stored rev is `expectedRev` (null: overwrite regardless). */
export async function putData(
  uid: string,
  appId: string,
  json: string,
  expectedRev: number | null,
): Promise<PutResult> {
  const ref = col(uid).doc(appId);
  return db().runTransaction(async (tx): Promise<PutResult> => {
    const snap = await tx.get(ref);
    const rev = (snap.get('rev') as number | undefined) ?? 0;
    if (expectedRev !== null && rev !== expectedRev) return { status: 'conflict', rev };
    const at = new Date().toISOString();
    tx.set(
      ref,
      { json, hasData: true, rev: rev + 1, dataUpdatedAt: at, updatedAt: at },
      { merge: true },
    );
    return { status: 'ok', rev: rev + 1, at };
  });
}

export async function clearData(uid: string, appId: string): Promise<void> {
  await col(uid)
    .doc(appId)
    .set(
      { json: null, hasData: false, dataUpdatedAt: null, updatedAt: new Date().toISOString() },
      { merge: true },
    );
}
