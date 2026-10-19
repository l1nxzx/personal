import { db } from '../config/firebase.js';

// Doc id = token jti, so validating a refresh token is a single document read.
// Enable a Firestore TTL policy on `expiresAt` for collection `refreshTokens` to purge old docs.
const col = () => db().collection('refreshTokens');

export async function save(jti: string, userId: string, expiresAt: Date): Promise<void> {
  await col().doc(jti).set({ userId, expiresAt });
}

/** Atomically deletes the token and reports whether it was valid (rotation: single use). */
export async function consume(jti: string): Promise<{ userId: string } | null> {
  const ref = col().doc(jti);
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return null;
    tx.delete(ref);
    const data = snap.data()!;
    const expiresAt: Date = data.expiresAt.toDate();
    return expiresAt.getTime() > Date.now() ? { userId: data.userId as string } : null;
  });
}

export async function revokeAllForUser(userId: string): Promise<void> {
  const snap = await col().where('userId', '==', userId).get();
  if (snap.empty) return;
  const batch = db().batch();
  snap.docs.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
