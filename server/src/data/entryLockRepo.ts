import { db } from '../config/firebase.js';

/**
 * Key material for encrypted journal entries and writings. Nothing here can decrypt anything
 * on its own:
 * - users/{uid}/meta/entryKey: the entries key, encrypted in the browser with the vault key.
 * - users/{uid}/pinDevices/{deviceId}: per device, a random "server half" that the device needs
 *   (with its PIN and the data it keeps locally) to open the entries key, a hash of the PIN
 *   check value, and how many wrong PINs are left. The server releases the server half only for
 *   the right PIN, and deletes it after too many wrong ones.
 */
export interface EntryKeyRecord {
  keyId: string;
  iv: string;
  data: string;
  createdAt: string;
}

export interface PinDeviceRecord {
  id: string;
  keyId: string;
  label: string;
  verifierHash: string;
  serverHalf: string;
  attemptsLeft: number;
  createdAt: string;
  lastUsedAt: string | null;
}

const userDoc = (uid: string) => db().collection('users').doc(uid);
const keyDoc = (uid: string) => userDoc(uid).collection('meta').doc('entryKey');
const devices = (uid: string) => userDoc(uid).collection('pinDevices');

export async function getKey(uid: string): Promise<EntryKeyRecord | null> {
  const snap = await keyDoc(uid).get();
  return snap.exists ? (snap.data() as EntryKeyRecord) : null;
}

/** Creates the key record unless one exists; returns the stored one either way. */
export async function createKey(uid: string, record: EntryKeyRecord): Promise<EntryKeyRecord> {
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(keyDoc(uid));
    if (snap.exists) return snap.data() as EntryKeyRecord;
    tx.set(keyDoc(uid), record);
    return record;
  });
}

export async function deleteKey(uid: string): Promise<void> {
  await keyDoc(uid).delete();
}

export async function listDevices(uid: string): Promise<PinDeviceRecord[]> {
  const snap = await devices(uid).get();
  return snap.docs.map((d) => ({ ...(d.data() as Omit<PinDeviceRecord, 'id'>), id: d.id }));
}

export async function putDevice(uid: string, record: PinDeviceRecord): Promise<void> {
  const { id, ...data } = record;
  await devices(uid).doc(id).set(data);
}

export async function deleteDevice(uid: string, id: string): Promise<boolean> {
  const ref = devices(uid).doc(id);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    tx.delete(ref);
    return true;
  });
}

export async function deleteAllDevices(uid: string): Promise<void> {
  const snap = await devices(uid).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}

export type PinCheck =
  | { status: 'ok'; serverHalf: string }
  | { status: 'wrong'; attemptsLeft: number }
  | { status: 'missing' };

/**
 * One PIN attempt, atomically: `matches` compares the stored hash. Right: attempts reset and
 * the server half is returned. Wrong: one attempt fewer; at zero the record is deleted for good.
 */
export async function checkPin(
  uid: string,
  id: string,
  matches: (verifierHash: string) => boolean,
  maxAttempts: number,
): Promise<PinCheck> {
  const ref = devices(uid).doc(id);
  return db().runTransaction(async (tx): Promise<PinCheck> => {
    const snap = await tx.get(ref);
    if (!snap.exists) return { status: 'missing' };
    const d = snap.data() as Omit<PinDeviceRecord, 'id'>;
    if (matches(d.verifierHash)) {
      tx.update(ref, { attemptsLeft: maxAttempts, lastUsedAt: new Date().toISOString() });
      return { status: 'ok', serverHalf: d.serverHalf };
    }
    const attemptsLeft = d.attemptsLeft - 1;
    if (attemptsLeft <= 0) tx.delete(ref);
    else tx.update(ref, { attemptsLeft });
    return { status: 'wrong', attemptsLeft: Math.max(0, attemptsLeft) };
  });
}
