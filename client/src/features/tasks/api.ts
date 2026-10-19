import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateTaskRequest, Page, Task, UpdateTaskRequest } from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';
import { keys } from '../../lib/keys';
import { taskCountsKey } from '../projects/api';

export function useOpenTasks() {
  return useQuery({
    queryKey: keys.openTasks,
    queryFn: async () => (await apiFetch<{ items: Task[] }>('/tasks/open')).items,
  });
}

export function useDoneTasks(enabled = true) {
  return useInfiniteQuery({
    queryKey: keys.doneTasks,
    queryFn: ({ pageParam }) =>
      apiFetch<Page<Task>>('/tasks/done', { query: { limit: 40, cursor: pageParam } }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
    enabled,
  });
}

export function useTask(id: string | null) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['task', id],
    queryFn: async () => (await apiFetch<{ task: Task }>(`/tasks/${id}`)).task,
    enabled: !!id,
    // Usually already in the open-tasks list: show that instantly.
    initialData: () => qc.getQueryData<Task[]>(keys.openTasks)?.find((t) => t.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(keys.openTasks)?.dataUpdatedAt,
  });
}

export function useCreateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateTaskRequest) =>
      (await apiFetch<{ task: Task }>('/tasks', { method: 'POST', body: input })).task,
    onSuccess: (task) => {
      qc.setQueryData<Task[]>(keys.openTasks, (list) => (list ? [...list, task] : list));
      if (task.projectId) {
        void qc.invalidateQueries({ queryKey: ['tasks', 'project'] });
        void qc.invalidateQueries({ queryKey: taskCountsKey });
      }
    },
  });
}

/** Optimistic: the open list updates immediately and rolls back on failure. */
export function useUpdateTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: UpdateTaskRequest }) =>
      (await apiFetch<{ task: Task }>(`/tasks/${id}`, { method: 'PATCH', body: patch })).task,
    onMutate: async ({ id, patch }) => {
      await qc.cancelQueries({ queryKey: keys.openTasks });
      const previous = qc.getQueryData<Task[]>(keys.openTasks);
      const known =
        previous?.find((t) => t.id === id) ??
        qc.getQueryData<Task>(['task', id]) ??
        findDone(qc, id);
      if (known) {
        const next: Task = { ...known, ...patch };
        qc.setQueryData(['task', id], next);
        qc.setQueryData<Task[]>(keys.openTasks, (list) => {
          if (!list) return list;
          const without = list.filter((t) => t.id !== id);
          return next.status === 'open'
            ? list.some((t) => t.id === id)
              ? list.map((t) => (t.id === id ? next : t))
              : [...without, next]
            : without;
        });
      }
      return { previous };
    },
    onError: (_err, { id }, context) => {
      if (context?.previous) qc.setQueryData(keys.openTasks, context.previous);
      void qc.invalidateQueries({ queryKey: ['task', id] });
    },
    onSuccess: (task, { patch }) => {
      qc.setQueryData(['task', task.id], task);
      qc.setQueryData<Task[]>(keys.openTasks, (list) =>
        list?.map((t) => (t.id === task.id ? task : t)),
      );
      if (patch.status) void qc.invalidateQueries({ queryKey: keys.doneTasks });
      if (patch.projectId !== undefined) void qc.invalidateQueries({ queryKey: taskCountsKey });
      void qc.invalidateQueries({ queryKey: ['tasks', 'project'] });
    },
  });
}

function findDone(qc: ReturnType<typeof useQueryClient>, id: string): Task | undefined {
  const done = qc.getQueryData<{ pages: Page<Task>[] }>(keys.doneTasks);
  return done?.pages.flatMap((p) => p.items).find((t) => t.id === id);
}

export function useDeleteTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/tasks/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.setQueryData<Task[]>(keys.openTasks, (list) => list?.filter((t) => t.id !== id));
      qc.removeQueries({ queryKey: ['task', id] });
      void qc.invalidateQueries({ queryKey: ['tasks', 'project'] });
      void qc.invalidateQueries({ queryKey: taskCountsKey });
      void qc.invalidateQueries({ queryKey: keys.doneTasks });
    },
  });
}
