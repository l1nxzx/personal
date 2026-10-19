import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateProjectRequest,
  Project,
  ProjectTaskCounts,
  Task,
  UpdateProjectRequest,
} from '../../../../shared/types';
import { apiFetch } from '../../lib/apiFetch';

export const projectsKey = ['projects'] as const;

export function useProjects() {
  return useQuery({
    queryKey: projectsKey,
    queryFn: async () => (await apiFetch<{ items: Project[] }>('/projects')).items,
    staleTime: 5 * 60_000,
  });
}

export const taskCountsKey = ['projects', 'task-counts'] as const;

/**
 * Tasks per active or paused project, open and done. Only creating, deleting or moving a task
 * changes these; completing one doesn't, since progress is total − open (open tasks are live).
 */
export function useProjectTaskCounts() {
  return useQuery({
    queryKey: taskCountsKey,
    queryFn: async () =>
      (await apiFetch<{ counts: ProjectTaskCounts }>('/projects/task-counts')).counts,
    staleTime: 5 * 60_000,
  });
}

/** id → project, for showing a task's project name. */
export function useProjectNames(): Map<string, string> {
  const { data } = useProjects();
  return new Map((data ?? []).map((p) => [p.id, p.name]));
}

export function useProject(id: string) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: ['project', id],
    queryFn: async () => (await apiFetch<{ project: Project }>(`/projects/${id}`)).project,
    initialData: () => qc.getQueryData<Project[]>(projectsKey)?.find((p) => p.id === id),
    initialDataUpdatedAt: () => qc.getQueryState(projectsKey)?.dataUpdatedAt,
  });
}

export function useProjectTasks(id: string) {
  return useQuery({
    queryKey: ['tasks', 'project', id],
    queryFn: async () => (await apiFetch<{ items: Task[] }>(`/projects/${id}/tasks`)).items,
  });
}

export function useCreateProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateProjectRequest) =>
      (await apiFetch<{ project: Project }>('/projects', { method: 'POST', body: input })).project,
    onSuccess: (p) => {
      qc.setQueryData(['project', p.id], p);
      void qc.invalidateQueries({ queryKey: projectsKey });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}

export function useUpdateProject(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (patch: UpdateProjectRequest) =>
      (await apiFetch<{ project: Project }>(`/projects/${id}`, { method: 'PATCH', body: patch }))
        .project,
    onMutate: (patch) => {
      qc.setQueryData<Project>(['project', id], (p) => (p ? { ...p, ...patch } : p));
    },
    onSuccess: (p) => {
      qc.setQueryData(['project', id], p);
      void qc.invalidateQueries({ queryKey: projectsKey });
    },
    onError: () => void qc.invalidateQueries({ queryKey: ['project', id] }),
  });
}

export function useDeleteProject() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/projects/${id}`, { method: 'DELETE' }),
    onSuccess: (_v, id) => {
      qc.removeQueries({ queryKey: ['project', id] });
      void qc.invalidateQueries({ queryKey: projectsKey });
      void qc.invalidateQueries({ queryKey: ['tasks'] });
      void qc.invalidateQueries({ queryKey: ['home'] });
    },
  });
}
