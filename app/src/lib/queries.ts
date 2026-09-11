import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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
  taskQuality: (id: string) => ['tasks', id, 'quality'] as const,
  models: ['models'] as const,
  activeDownloads: ['models', 'active-downloads'] as const,
  modelStorage: ['models', 'storage'] as const,
  modelStorageRelocation: ['models', 'storage', 'relocation'] as const,
  providers: ['providers'] as const,
  llmProviderPresets: ['llm-providers', 'presets'] as const,
  llmProviders: ['llm-providers'] as const,
  chatSessions: ['chat', 'sessions'] as const,
  chatSession: (id: string) => ['chat', 'sessions', id] as const,
  proofreadingRuns: (taskId: string) => ['tasks', taskId, 'proofreading-runs'] as const,
  proofreadingRun: (taskId: string, runId: string) => ['tasks', taskId, 'proofreading-runs', runId] as const,
  translationRuns: (taskId: string) => ['tasks', taskId, 'translation-runs'] as const,
  translationVersions: (taskId: string, runId: string) => ['tasks', taskId, 'translation-runs', runId, 'versions'] as const,
  translationVersion: (taskId: string, runId: string, versionId: number) => ['tasks', taskId, 'translation-runs', runId, 'versions', versionId] as const,
  settings: ['settings'] as const,
  mediaStorageSettings: ['settings', 'media-storage'] as const,
  cudaAcceleration: ['settings', 'cuda-acceleration'] as const,
  runtime: ['runtime-status'] as const,
};

export function useHealthQuery(enabled = true) {
  return useQuery({ queryKey: queryKeys.health, queryFn: () => apiClient.getHealth(), retry: 1, enabled, refetchInterval: 8000 });
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

export function useModelStorageRelocationQuery() {
  return useQuery({
    queryKey: queryKeys.modelStorageRelocation,
    queryFn: () => apiClient.getModelStorageRelocation(),
    retry: 1,
    refetchInterval: (query) => ['running', 'cancelling'].includes(query.state.data?.status ?? '') ? 750 : 5000,
  });
}

export function useProvidersQuery() {
  return useQuery({ queryKey: queryKeys.providers, queryFn: () => apiClient.listProviders(), retry: 1 });
}

export function useLLMProviderPresetsQuery() {
  return useQuery({ queryKey: queryKeys.llmProviderPresets, queryFn: () => apiClient.listLLMProviderPresets(), retry: 1 });
}

export function useLLMProvidersQuery() {
  return useQuery({ queryKey: queryKeys.llmProviders, queryFn: () => apiClient.listLLMProviders(), retry: 1 });
}

export function useChatSessionsQuery() {
  return useQuery({ queryKey: queryKeys.chatSessions, queryFn: () => apiClient.listChatSessions(), retry: 1 });
}

export function useChatSessionQuery(id: string | null) {
  return useQuery({
    queryKey: queryKeys.chatSession(id ?? ''),
    queryFn: () => apiClient.getChatSession(id!),
    enabled: Boolean(id),
    retry: 1,
  });
}

export function useSettingsQuery() {
  return useQuery({ queryKey: queryKeys.settings, queryFn: () => apiClient.getSettings(), retry: 1 });
}

export function useMediaStorageSettingsQuery() {
  return useQuery({ queryKey: queryKeys.mediaStorageSettings, queryFn: () => apiClient.getMediaStorageSettings(), retry: 1 });
}

export function useCudaAccelerationQuery(enabled = true) {
  return useQuery({
    queryKey: queryKeys.cudaAcceleration,
    queryFn: () => apiClient.getCudaAcceleration(),
    retry: 1,
    enabled,
    refetchInterval: (query) => (query.state.data?.job?.status === 'running' ? 750 : 15000),
  });
}

export function useCudaAccelerationToggleMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (enabled: boolean) => apiClient.updateCudaAcceleration({ enabled }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cudaAcceleration });
    },
  });
}

export function useCudaKitDownloadMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.startCudaKitDownload(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cudaAcceleration });
    },
  });
}

export function useCudaKitDownloadCancelMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.cancelCudaKitDownload(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cudaAcceleration });
    },
  });
}

export function useCudaKitDeleteMutation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => apiClient.deleteCudaKit(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.cudaAcceleration });
    },
  });
}

export function useRuntimeQuery() {
  return useQuery({ queryKey: queryKeys.runtime, queryFn: () => apiClient.getRuntimeStatus(), retry: 1, refetchInterval: 10000 });
}
