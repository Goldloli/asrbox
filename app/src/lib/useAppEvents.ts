import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, type AppEvent } from './api';
import { queryKeys } from './queries';
import { useServerStore } from '../stores/serverStore';
import { runEventStreamLoop } from './eventStream';

export function useAppEvents() {
  const queryClient = useQueryClient();
  const serverUrl = useServerStore((state) => state.serverUrl);
  const apiToken = useServerStore((state) => state.apiToken);

  useEffect(() => {
    const controller = new AbortController();

    const handleEvent = (raw: unknown) => {
      const payload = raw as AppEvent;
      if (!payload || typeof payload !== 'object' || typeof payload.type !== 'string') {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
        return;
      }
      if (payload.type.startsWith('task.')) {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
        queryClient.invalidateQueries({ queryKey: queryKeys.activeTasks });
      }
      if (payload.type === 'model.download.updated') {
        queryClient.invalidateQueries({ queryKey: queryKeys.models });
        queryClient.invalidateQueries({ queryKey: queryKeys.activeDownloads });
        queryClient.invalidateQueries({ queryKey: queryKeys.modelStorage });
      }
      if (payload.type === 'runtime.warning') queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
    };

    void runEventStreamLoop({
      url: apiClient.eventsUrl(),
      apiToken,
      signal: controller.signal,
      onEvent: handleEvent,
    });
    return () => controller.abort();
  }, [apiToken, queryClient, serverUrl]);
}
