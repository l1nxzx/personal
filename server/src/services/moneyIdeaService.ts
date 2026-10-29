import type {
  CreateMoneyIdeaRequest,
  MoneyIdea,
  MoneyIdeaSummary,
  Project,
  UpdateMoneyIdeaRequest,
} from '../../../shared/types.js';
import * as links from '../data/linkRepo.js';
import * as ideas from '../data/moneyIdeaRepo.js';
import * as projects from '../data/projectRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';
import { createProject } from './projectService.js';
import { textStatsOf } from './textStats.js';
import { recordAction } from './activityService.js';

export const toSummary = (r: ideas.MoneyIdeaSummaryRecord): MoneyIdeaSummary => ({
  id: r.id,
  name: r.name,
  nextStep: r.nextStep,
  status: r.status,
  hours: r.hours,
  spentMinor: r.spentMinor,
  currency: r.currency,
  experimentCount: r.experimentCount,
  projectId: r.projectId,
  incomeSources: r.incomeSources,
  archived: r.archived,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

export const toIdea = (r: ideas.MoneyIdeaRecord): MoneyIdea => {
  const { experimentCount: _c, ...rest } = toSummary(r);
  return {
    ...rest,
    description: r.description,
    whyItMightWork: r.whyItMightWork,
    notes: r.notes,
    experiments: r.experiments,
  };
};

const terms = (
  r: Pick<
    ideas.MoneyIdeaRecord,
    'name' | 'description' | 'whyItMightWork' | 'nextStep' | 'notes' | 'experiments'
  >,
) =>
  buildSearchTerms(
    r.name,
    r.description,
    r.whyItMightWork,
    r.nextStep,
    r.notes,
    r.experiments.map((e) => `${e.tried} ${e.outcome} ${e.lessons}`).join(' '),
  );

/** Quick create: a name is enough; everything else can wait. */
export async function createIdea(ctx: Ctx, input: CreateMoneyIdeaRequest): Promise<MoneyIdea> {
  const now = new Date().toISOString();
  const base = {
    name: input.name,
    description: '',
    whyItMightWork: '',
    nextStep: '',
    notes: '',
    experiments: [],
  };
  const record: ideas.MoneyIdeaRecord = {
    id: ideas.newId(ctx.userId),
    ...base,
    status: input.status ?? 'idea',
    hours: null,
    spentMinor: null,
    currency: null,
    experimentCount: 0,
    projectId: null,
    incomeSources: [],
    archived: false,
    createdAt: now,
    updatedAt: now,
    searchTerms: terms(base),
    ...textStatsOf('moneyIdea', base),
  };
  await ideas.create(ctx.userId, record);
  notifyChange(ctx, 'moneyIdea', record.id);
  await recordAction(ctx, 'moneyIdea.created', record.id);
  return toIdea(record);
}

export async function getIdea(ctx: Ctx, id: string): Promise<MoneyIdea> {
  const r = await ideas.get(ctx.userId, id);
  if (!r) throw notFound('This idea no longer exists');
  return toIdea(r);
}

/** Testing first, then running, ideas, and dropped last; most recently touched first within each. */
export async function listIdeas(
  ctx: Ctx,
  opts: { archived: boolean },
): Promise<MoneyIdeaSummary[]> {
  const order = { testing: 0, running: 1, idea: 2, dropped: 3 } as const;
  return (await ideas.listAll(ctx.userId))
    .filter((r) => r.archived === opts.archived)
    .sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export async function updateIdea(
  ctx: Ctx,
  id: string,
  input: UpdateMoneyIdeaRequest,
): Promise<MoneyIdea> {
  const current = await ideas.get(ctx.userId, id);
  if (!current) throw notFound('This idea no longer exists');
  if (input.projectId && !(await projects.get(ctx.userId, input.projectId))) {
    throw notFound('That project no longer exists');
  }
  const next: ideas.MoneyIdeaRecord = { ...current, ...input, updatedAt: new Date().toISOString() };
  next.experimentCount = next.experiments.length;
  next.searchTerms = terms(next);
  Object.assign(next, textStatsOf('moneyIdea', next));
  const { id: _id, ...patch } = next;
  await ideas.update(ctx.userId, id, patch);
  // Linking to a project also shows up in both items' "Linked" lists.
  if (input.projectId && input.projectId !== current.projectId) {
    await links.add(ctx.userId, `moneyIdea:${id}`, `project:${input.projectId}`, 'manual');
    notifyChange(ctx, 'link');
  }
  notifyChange(ctx, 'moneyIdea', id);
  await recordAction(ctx, 'moneyIdea.edited', id);
  return toIdea(next);
}

export async function deleteIdea(ctx: Ctx, id: string): Promise<void> {
  if (!(await ideas.get(ctx.userId, id))) throw notFound('This idea no longer exists');
  await ideas.remove(ctx.userId, id);
  await links.removeAllFor(ctx.userId, `moneyIdea:${id}`);
  notifyChange(ctx, 'moneyIdea', id);
}

/** Turns a promising idea into a project that stays connected to it. */
export async function ideaToProject(
  ctx: Ctx,
  id: string,
): Promise<{ idea: MoneyIdea; project: Project }> {
  const idea = await ideas.get(ctx.userId, id);
  if (!idea) throw notFound('This idea no longer exists');
  const description = [
    idea.description,
    idea.whyItMightWork && `**Why it might work:** ${idea.whyItMightWork}`,
  ]
    .filter(Boolean)
    .join('\n\n');
  const project = await createProject(ctx, { name: idea.name, description });
  const updated = await updateIdea(ctx, id, { projectId: project.id });
  return { idea: updated, project };
}
