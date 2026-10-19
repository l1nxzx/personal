import type { CreateTaskRequest, Page, Task, UpdateTaskRequest } from '../../../shared/types.js';
import * as links from '../data/linkRepo.js';
import * as projects from '../data/projectRepo.js';
import * as tasks from '../data/taskRepo.js';
import { notFound } from '../lib/errors.js';
import { buildSearchTerms } from '../lib/text.js';
import { notifyChange, type Ctx } from './context.js';

export const toTask = (r: tasks.TaskRecord): Task => ({
  id: r.id,
  title: r.title,
  notes: r.notes,
  dueDate: r.dueDate,
  plannedDate: r.plannedDate,
  priority: r.priority,
  subtasks: r.subtasks,
  status: r.status,
  completedAt: r.completedAt,
  projectId: r.projectId,
  createdAt: r.createdAt,
  updatedAt: r.updatedAt,
});

const terms = (t: { title: string; notes: string; subtasks: { title: string }[] }) =>
  buildSearchTerms(t.title, t.notes, t.subtasks.map((s) => s.title).join(' '));

async function checkProject(ctx: Ctx, projectId: string | null | undefined) {
  if (projectId && !(await projects.get(ctx.userId, projectId))) {
    throw notFound('That project no longer exists');
  }
}

export async function createTask(ctx: Ctx, input: CreateTaskRequest): Promise<Task> {
  await checkProject(ctx, input.projectId);
  const now = new Date().toISOString();
  const record: tasks.TaskRecord = {
    id: tasks.newId(ctx.userId),
    title: input.title,
    notes: input.notes ?? '',
    dueDate: input.dueDate ?? null,
    plannedDate: input.plannedDate ?? null,
    priority: input.priority ?? 'none',
    subtasks: [],
    status: 'open',
    completedAt: null,
    projectId: input.projectId ?? null,
    createdAt: now,
    updatedAt: now,
    searchTerms: [],
  };
  record.searchTerms = terms(record);
  await tasks.create(ctx.userId, record);
  notifyChange(ctx, 'task', record.id);
  return toTask(record);
}

export async function updateTask(ctx: Ctx, id: string, input: UpdateTaskRequest): Promise<Task> {
  const current = await tasks.get(ctx.userId, id);
  if (!current) throw notFound('This task no longer exists');
  if (input.projectId !== undefined) await checkProject(ctx, input.projectId);

  const next: tasks.TaskRecord = { ...current, ...input, updatedAt: new Date().toISOString() };
  if (input.status && input.status !== current.status) {
    next.completedAt = input.status === 'done' ? next.updatedAt : null;
  }
  next.searchTerms = terms(next);

  const { id: _id, ...patch } = next;
  await tasks.update(ctx.userId, id, patch);
  notifyChange(ctx, 'task', id);
  return toTask(next);
}

export async function deleteTask(ctx: Ctx, id: string): Promise<void> {
  if (!(await tasks.get(ctx.userId, id))) throw notFound('This task no longer exists');
  await tasks.remove(ctx.userId, id);
  await links.removeAllFor(ctx.userId, `task:${id}`);
  notifyChange(ctx, 'task', id);
}

export async function getTask(ctx: Ctx, id: string): Promise<Task> {
  const record = await tasks.get(ctx.userId, id);
  if (!record) throw notFound('This task no longer exists');
  return toTask(record);
}

export async function listOpen(ctx: Ctx): Promise<Task[]> {
  return (await tasks.listOpen(ctx.userId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toTask);
}

export async function listDone(ctx: Ctx, limit: number, cursor?: string): Promise<Page<Task>> {
  const page = await tasks.listDone(ctx.userId, limit, cursor);
  return { items: page.items.map(toTask), nextCursor: page.nextCursor };
}

export async function listByProject(ctx: Ctx, projectId: string): Promise<Task[]> {
  return (await tasks.listByProject(ctx.userId, projectId))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map(toTask);
}
