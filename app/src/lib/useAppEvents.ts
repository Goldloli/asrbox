import { useEffect } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { apiClient, type AppEvent } from './api';
import { queryKeys } from './queries';

export function useAppEvents() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let source: EventSource;
    try {
      source = new EventSource(apiClient.eventsUrl());
    } catch {
      return;
    }

    source.onmessage = (event) => {
      try {
        const payload = JSON.parse(event.data) as AppEvent;
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
      } catch {
        queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      }
    };

    source.onerror = () => {
      source.close();
    };

    return () => source.close();
  }, [queryClient]);
}
