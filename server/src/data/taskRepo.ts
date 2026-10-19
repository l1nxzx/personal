import { FieldValue } from 'firebase-admin/firestore';
import type { Subtask, TaskPriority, TaskStatus } from '../../../shared/types.js';
import { db } from '../config/firebase.js';

export interface TaskRecord {
  id: string;
  title: string;
  notes: string;
  dueDate: string | null;
  plannedDate: string | null;
  priority: TaskPriority;
  subtasks: Subtask[];
  status: TaskStatus;
  /** Only present on done tasks, so ordering by it lists done tasks alone. */
  completedAt: string | null;
  projectId: string | null;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const col = (uid: string) => db().collection('users').doc(uid).collection('tasks');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): TaskRecord => ({
  id,
  title: d.title,
  notes: d.notes ?? '',
  dueDate: d.dueDate ?? null,
  plannedDate: d.plannedDate ?? null,
  priority: d.priority ?? 'none',
  subtasks: d.subtasks ?? [],
  status: d.status,
  completedAt: d.completedAt ?? null,
  projectId: d.projectId ?? null,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<TaskRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function create(uid: string, task: TaskRecord): Promise<void> {
  const { id, completedAt, ...data } = task;
  await col(uid)
    .doc(id)
    .create(completedAt ? { ...data, completedAt } : data);
}

export async function update(uid: string, id: string, patch: Partial<TaskRecord>): Promise<void> {
  const { completedAt, ...rest } = patch;
  const data: Record<string, unknown> = { ...rest };
  delete data.id;
  if (completedAt !== undefined) data.completedAt = completedAt ?? FieldValue.delete();
  await col(uid).doc(id).update(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

/** Every open task: one equality query; a person's open list is small. */
export async function listOpen(uid: string): Promise<TaskRecord[]> {
  const snap = await col(uid).where('status', '==', 'open').get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function listDone(uid: string, limit: number, cursor?: string) {
  let q = col(uid)
    .orderBy('completedAt', 'desc')
    .limit(limit + 1);
  if (cursor) q = q.startAfter(cursor);
  const docs = (await q.get()).docs;
  const items = docs.slice(0, limit).map((d) => toRecord(d.id, d.data()));
  return { items, nextCursor: docs.length > limit ? (items.at(-1)?.completedAt ?? null) : null };
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

/** Every task of a project, open and done (equality query). */
export async function listByProject(uid: string, projectId: string): Promise<TaskRecord[]> {
  const snap = await col(uid).where('projectId', '==', projectId).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

/** How many tasks a project has, open and done: a count aggregation (one read per 1,000). */
export async function countByProject(uid: string, projectId: string): Promise<number> {
  const snap = await col(uid).where('projectId', '==', projectId).count().get();
  return snap.data().count;
}

/** Detaches tasks from a deleted project (the tasks themselves are kept). */
export async function clearProject(uid: string, projectId: string): Promise<void> {
  const snap = await col(uid).where('projectId', '==', projectId).get();
  for (let i = 0; i < snap.docs.length; i += 400) {
    const batch = db().batch();
    snap.docs.slice(i, i + 400).forEach((d) => batch.update(d.ref, { projectId: null }));
    await batch.commit();
  }
}

/** Tasks completed within [fromIso, toIso): a range on `completedAt`. */
export async function listDoneBetween(
  uid: string,
  fromIso: string,
  toIso: string,
): Promise<TaskRecord[]> {
  const snap = await col(uid)
    .where('completedAt', '>=', fromIso)
    .where('completedAt', '<', toIso)
    .orderBy('completedAt', 'desc')
    .limit(500)
    .get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
