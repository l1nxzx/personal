import type { WeeklyReviewAnswers } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

/** Weekly reviews, one document per week: users/{uid}/reviews/{weekStart}. */
export interface ReviewRecord {
  weekStart: string;
  answers: WeeklyReviewAnswers;
  createdAt: string;
  updatedAt: string;
}

const col = (uid: string) => db().collection('users').doc(uid).collection('reviews');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): ReviewRecord => ({
  weekStart: id,
  answers: d.answers,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

export async function get(uid: string, weekStart: string): Promise<ReviewRecord | null> {
  const snap = await col(uid).doc(weekStart).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function save(uid: string, r: ReviewRecord): Promise<void> {
  const { weekStart, ...data } = r;
  await col(uid).doc(weekStart).set(data);
}

export async function remove(uid: string, weekStart: string): Promise<void> {
  await col(uid).doc(weekStart).delete();
}

/** Newest first (document ids are dates, so ordering by id is chronological). */
export async function list(uid: string, limit: number): Promise<ReviewRecord[]> {
  const snap = await col(uid).orderBy('updatedAt', 'desc').limit(limit).get();
  return snap.docs
    .map((d) => toRecord(d.id, d.data()))
    .sort((a, b) => b.weekStart.localeCompare(a.weekStart));
}
