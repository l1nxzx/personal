import type {
  CreateProjectRequest,
  Project,
  ProjectTaskCounts,
  UpdateProjectRequest,
} from '../../../shared/types.js';
import * as links from '../data/linkRepo.js';
import * as moneyIdeas from '../data/moneyIdeaRepo.js';
import * as projects from '../data/projectRepo.js';
import * as tasks from '../data/taskRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';

export const toProject = (r: projects.ProjectRecord): Project => ({
  id: r.id,
  name: r.name,
  goal: r.goal,
  description: r.description,
  status: r.status,
  targetDate: r.targetDate,
  milestones: r.milestones,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const terms = (p: Pick<projects.ProjectRecord, 'name' | 'goal' | 'description' | 'milestones'>) =>
  buildSearchTerms(p.name, p.goal, p.description, p.milestones.map((m) => m.title).join(' '));

export async function createProject(ctx: Ctx, input: CreateProjectRequest): Promise<Project> {
  const now = new Date().toISOString();
  const base = {
    name: input.name,
    goal: input.goal ?? '',
    description: input.description ?? '',
    milestones: [],
  };
  const record: projects.ProjectRecord = {
    id: projects.newId(ctx.userId),
    ...base,
    status: input.status ?? 'active',
    targetDate: input.targetDate ?? null,
    createdAt: now,
    updatedAt: now,
    searchTerms: terms(base),
  };
  await projects.create(ctx.userId, record);
  notifyChange(ctx, 'project', record.id);
  return toProject(record);
}

export async function getProject(ctx: Ctx, id: string): Promise<Project> {
  const r = await projects.get(ctx.userId, id);
  if (!r) throw notFound('This project no longer exists');
  return toProject(r);
}

/** Active first, then paused, then done; newest first within each. */
export async function listProjects(ctx: Ctx): Promise<Project[]> {
  const order = { active: 0, paused: 1, done: 2 } as const;
  return (await projects.listAll(ctx.userId))
    .sort((a, b) => order[a.status] - order[b.status] || b.updatedAt.localeCompare(a.updatedAt))
    .map(toProject);
}

/**
 * Task totals for active and paused projects (finished ones don't show progress). The client
 * already has every open task, so progress is total − open and stays live as tasks are ticked.
 */
export async function taskCounts(ctx: Ctx): Promise<ProjectTaskCounts> {
  const current = (await projects.listAll(ctx.userId)).filter((p) => p.status !== 'done');
  const counts = await Promise.all(current.map((p) => tasks.countByProject(ctx.userId, p.id)));
  return Object.fromEntries(current.map((p, i) => [p.id, counts[i]!]));
}

export async function updateProject(
  ctx: Ctx,
  id: string,
  input: UpdateProjectRequest,
): Promise<Project> {
  const current = await projects.get(ctx.userId, id);
  if (!current) throw notFound('This project no longer exists');
  const next = { ...current, ...input, updatedAt: new Date().toISOString() };
  next.searchTerms = terms(next);
  const { id: _id, ...patch } = next;
  await projects.update(ctx.userId, id, patch);
  notifyChange(ctx, 'project', id);
  return toProject(next);
}

/** Deletes the project; its tasks stay, just without a project. */
export async function deleteProject(ctx: Ctx, id: string): Promise<void> {
  if (!(await projects.get(ctx.userId, id))) throw notFound('This project no longer exists');
  await projects.remove(ctx.userId, id);
  await Promise.all([
    tasks.clearProject(ctx.userId, id),
    moneyIdeas.clearProject(ctx.userId, id),
    links.removeAllFor(ctx.userId, `project:${id}`),
  ]);
  notifyChange(ctx, 'project', id);
  notifyChange(ctx, 'task');
}
