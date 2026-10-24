import type { Experiment, MoneyIdeaStatus } from '../../../shared/types.js';
import { db } from '../config/firebase.js';
import type { TextStats } from '../lib/text.js';

export interface MoneyIdeaRecord extends Partial<TextStats> {
  id: string;
  name: string;
  description: string;
  whyItMightWork: string;
  nextStep: string;
  status: MoneyIdeaStatus;
  notes: string;
  hours: number | null;
  spentMinor: number | null;
  currency: string | null;
  experiments: Experiment[];
  experimentCount: number;
  projectId: string | null;
  incomeSources: string[];
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  searchTerms: string[];
}

export type MoneyIdeaSummaryRecord = Omit<
  MoneyIdeaRecord,
  'notes' | 'experiments' | 'description' | 'whyItMightWork' | 'searchTerms'
>;

const SUMMARY_FIELDS = [
  'name',
  'nextStep',
  'status',
  'hours',
  'spentMinor',
  'currency',
  'experimentCount',
  'projectId',
  'incomeSources',
  'archived',
  'createdAt',
  'updatedAt',
] as const;

const col = (uid: string) => db().collection('users').doc(uid).collection('moneyIdeas');

const toSummary = (id: string, d: FirebaseFirestore.DocumentData): MoneyIdeaSummaryRecord => ({
  id,
  name: d.name,
  nextStep: d.nextStep ?? '',
  status: d.status,
  hours: d.hours ?? null,
  spentMinor: d.spentMinor ?? null,
  currency: d.currency ?? null,
  experimentCount: d.experimentCount ?? 0,
  projectId: d.projectId ?? null,
  incomeSources: d.incomeSources ?? [],
  archived: d.archived ?? false,
  createdAt: d.createdAt,
  updatedAt: d.updatedAt,
});

const toRecord = (id: string, d: FirebaseFirestore.DocumentData): MoneyIdeaRecord => ({
  ...toSummary(id, d),
  description: d.description ?? '',
  whyItMightWork: d.whyItMightWork ?? '',
  notes: d.notes ?? '',
  experiments: d.experiments ?? [],
  searchTerms: d.searchTerms ?? [],
});

export const newId = (uid: string) => col(uid).doc().id;

export async function get(uid: string, id: string): Promise<MoneyIdeaRecord | null> {
  const snap = await col(uid).doc(id).get();
  return snap.exists ? toRecord(snap.id, snap.data()!) : null;
}

export async function getMany(uid: string, ids: string[]) {
  if (!ids.length) return new Map<string, MoneyIdeaSummaryRecord>();
  const snaps = await db().getAll(...ids.map((id) => col(uid).doc(id)), {
    fieldMask: [...SUMMARY_FIELDS],
  });
  return new Map(snaps.filter((s) => s.exists).map((s) => [s.id, toSummary(s.id, s.data()!)]));
}

export async function create(uid: string, r: MoneyIdeaRecord): Promise<void> {
  const { id, ...data } = r;
  await col(uid).doc(id).create(data);
}

export async function update(
  uid: string,
  id: string,
  patch: Partial<MoneyIdeaRecord>,
): Promise<void> {
  const data = { ...patch };
  delete data.id;
  await col(uid).doc(id).update(data);
}

export async function remove(uid: string, id: string): Promise<void> {
  await col(uid).doc(id).delete();
}

/** All ideas, without their long text (a person has tens, not thousands). */
export async function listAll(uid: string): Promise<MoneyIdeaSummaryRecord[]> {
  const snap = await col(uid)
    .select(...SUMMARY_FIELDS)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function listByProject(
  uid: string,
  projectId: string,
): Promise<MoneyIdeaSummaryRecord[]> {
  const snap = await col(uid)
    .where('projectId', '==', projectId)
    .select(...SUMMARY_FIELDS)
    .get();
  return snap.docs.map((d) => toSummary(d.id, d.data()));
}

export async function clearProject(uid: string, projectId: string): Promise<void> {
  const snap = await col(uid).where('projectId', '==', projectId).get();
  const batch = db().batch();
  snap.docs.forEach((d) => batch.update(d.ref, { projectId: null }));
  if (!snap.empty) await batch.commit();
}

export async function search(uid: string, term: string, limit: number) {
  const snap = await col(uid).where('searchTerms', 'array-contains', term).limit(limit).get();
  return snap.docs.map((d) => toRecord(d.id, d.data()));
}
