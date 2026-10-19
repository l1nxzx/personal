import { db } from '../config/firebase.js';

/**
 * Links between any two items, stored once as users/{uid}/links/{from__to}.
 * `from`/`to` are `type:id` keys; outgoing and incoming lists are single-field equality queries.
 */
export interface LinkRecord {
  from: string;
  to: string;
  createdAt: string;
}

const col = (uid: string) => db().collection('users').doc(uid).collection('links');
const docId = (from: string, to: string) => `${from}__${to}`.replace(/\//g, '_');

export async function add(uid: string, from: string, to: string): Promise<void> {
  await col(uid).doc(docId(from, to)).set({ from, to, createdAt: new Date().toISOString() });
}

export async function remove(uid: string, from: string, to: string): Promise<void> {
  await col(uid).doc(docId(from, to)).delete();
}

export async function listFor(uid: string, key: string): Promise<LinkRecord[]> {
  const [out, inc] = await Promise.all([
    col(uid).where('from', '==', key).get(),
    col(uid).where('to', '==', key).get(),
  ]);
  return [...out.docs, ...inc.docs].map((d) => d.data() as LinkRecord);
}

/** Removes every link touching an item (called when it is deleted). */
export async function removeAllFor(uid: string, key: string): Promise<void> {
  const [out, inc] = await Promise.all([
    col(uid).where('from', '==', key).get(),
    col(uid).where('to', '==', key).get(),
  ]);
  const docs = [...out.docs, ...inc.docs];
  for (let i = 0; i < docs.length; i += 400) {
    const batch = db().batch();
    docs.slice(i, i + 400).forEach((d) => batch.delete(d.ref));
    await batch.commit();
  }
}
