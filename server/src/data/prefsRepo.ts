import type { Prefs } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

const ref = (uid: string) => db().collection('users').doc(uid).collection('meta').doc('prefs');

export async function get(uid: string): Promise<Partial<Prefs>> {
  const snap = await ref(uid).get();
  return (snap.data() as Partial<Prefs> | undefined) ?? {};
}

export async function update(uid: string, patch: Partial<Prefs>): Promise<void> {
  await ref(uid).set(patch, { merge: true });
}
