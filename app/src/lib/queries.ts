import { useQuery } from '@tanstack/react-query';
import { apiClient } from './api';

export const queryKeys = {
  health: ['health'] as const,
  readiness: ['transcriptions', 'readiness'] as const,
  tasks: ['tasks'] as const,
  activeTasks: ['tasks', 'active'] as const,
  task: (id: string) => ['tasks', id] as const,
  taskDiagnostics: (id: string) => ['tasks', id, 'diagnostics'] as const,
  taskLogs: (id: string) => ['tasks', id, 'logs'] as const,
  taskVersions: (id: string) => ['tasks', id, 'versions'] as const,
  models: ['models'] as const,
  activeDownloads: ['models', 'active-downloads'] as const,
  modelStorage: ['models', 'storage'] as const,
  providers: ['providers'] as const,
  settings: ['settings'] as const,
  runtime: ['runtime-status'] as const,
};

export function useHealthQuery() {
  return useQuery({ queryKey: queryKeys.health, queryFn: () => apiClient.getHealth(), retry: 1, refetchInterval: 8000 });
}

export function useReadinessQuery() {
  return useQuery({ queryKey: queryKeys.readiness, queryFn: () => apiClient.getReadiness(), retry: 1, refetchInterval: 8000 });
}

export function useTasksQuery() {
  return useQuery({ queryKey: queryKeys.tasks, queryFn: () => apiClient.listTasks(), retry: 1, refetchInterval: 3500 });
}

export function useActiveTasksQuery() {
  return useQuery({ queryKey: queryKeys.activeTasks, queryFn: () => apiClient.listActiveTasks(), retry: 1, refetchInterval: 2500 });
}

export function useModelsQuery() {
  return useQuery({ queryKey: queryKeys.models, queryFn: () => apiClient.listModels(), retry: 1, refetchInterval: 5000 });
}

export function useActiveDownloadsQuery() {
  return useQuery({
    queryKey: queryKeys.activeDownloads,
    queryFn: () => apiClient.listActiveDownloads(),
    retry: 1,
    refetchInterval: 2000,
  });
}

export function useModelStorageQuery() {
  return useQuery({ queryKey: queryKeys.modelStorage, queryFn: () => apiClient.getModelStorage(), retry: 1, refetchInterval: 15000 });
}

export function useProvidersQuery() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => apiClient.listProviders(), retry: 1 });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => apiClient.getSettings(), retry: 1 });
}

export function useRuntimeQuery() {
  return useQuery({ queryKey: queryKeys.runtime, queryFn: () => apiClient.getRuntimeStatus(), retry: 1, refetchInterval: 10000 });
}
