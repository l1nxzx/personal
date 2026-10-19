import type { Role } from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import { conflict } from '../lib/errors.js';

export interface UserRecord {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  role: Role;
  disabled: boolean;
  createdAt: string;
}

export type NewUser = Omit<UserRecord, 'id'>;
export type UserPatch = Partial<
  Pick<UserRecord, 'role' | 'disabled' | 'displayName' | 'passwordHash'>
>;

const col = () => db().collection('users');

const toRecord = (id: string, data: FirebaseFirestore.DocumentData): UserRecord => ({
  id,
  email: data.email,
  displayName: data.displayName,
  passwordHash: data.passwordHash,
  role: data.role,
  disabled: data.disabled,
  createdAt: data.createdAt,
});

export async function findById(id: string): Promise<UserRecord | null> {
  const snap = await col().doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

// Single-field equality query: served by the automatic index, 1 read.
export async function findByEmail(email: string): Promise<UserRecord | null> {
  const snap = await col().where('email', '==', email).limit(1).get();
  const doc = snap.docs[0];
  return doc ? toRecord(doc.id, doc.data()) : null;
}

export async function create(data: NewUser): Promise<UserRecord> {
  const ref = col().doc();
  // Transaction makes the uniqueness check + insert atomic.
  await db().runTransaction(async (tx) => {
    const existing = await tx.get(col().where('email', '==', data.email).limit(1));
    if (!existing.empty) throw conflict('Email is already registered', 'EMAIL_TAKEN');
    tx.create(ref, data);
  });
  return { id: ref.id, ...data };
}

export async function update(id: string, patch: UserPatch): Promise<void> {
  await col().doc(id).update(patch);
}

/** Oldest first; ordering on a single field needs no composite index. */
export async function list(limit: number, cursor?: string) {
  let q = col()
    .orderBy('createdAt')
    .limit(limit + 1);
  if (cursor) q = q.startAfter(cursor);
  const docs = (await q.get()).docs;
  const items = docs.slice(0, limit).map((d) => toRecord(d.id, d.data()));
  return { items, nextCursor: docs.length > limit ? (items.at(-1)?.createdAt ?? null) : null };
}
