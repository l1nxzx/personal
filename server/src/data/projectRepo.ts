import type { Milestone, ProjectStatus } from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import type { TextStats } from '../lib/text.js';

export interface ProjectRecord extends Partial<TextStats> {
  id: string;
  name: string;
  goal: string;
  description: string;
  status: ProjectStatus;
  targetDate: string | null;
  milestones: Milestone[];
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

const col = (uid: string) => db().collection('users').doc(uid).collection('projects');

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): ProjectRecord => ({
  id,
  name: d.name,
  goal: d.goal ?? '',
  description: d.description ?? '',
  status: d.status,
  targetDate: d.targetDate ?? null,
  milestones: d.milestones ?? [],
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<ProjectRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getMany(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, ProjectRecord>();
  const snaps = await db().getAll(...ids.map((id) => col(uid).doc(id)));
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toRecord(s.id, s.data()!)]));
}

export async function create(uid: string, project: ProjectRecord): Promise<void> {
  const { id, ...data } = project;
  await col(uid).doc(id).create(data);
}

export async function update(
  uid: string,
  id: string,
  patch: Partial<ProjectRecord>,
): Promise<void> {
  const data = { ...patch };
  delete data.id;
  await col(uid).doc(id).update(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

/** All projects: a person has few, so one query; descriptions are short enough to include. */
export async function listAll(uid: string): Promise<ProjectRecord[]> {
  const snap = await col(uid).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function listRecent(uid: string, limit: number): Promise<ProjectRecord[]> {
  const snap = await col(uid).orderBy('createdAt', 'desc').limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
