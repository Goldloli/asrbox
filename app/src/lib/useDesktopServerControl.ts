import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';
import { apiClient } from './api';
import { desktopCapabilities } from './desktopCapabilities';
import { queryKeys } from './queries';
import { useServerStore } from '../stores/serverStore';
import { toastErrorMessage, useToast } from '../components/Toast';
import { useI18n } from './i18n';

type StartServerOptions = {
  showToast?: boolean;
};

let desktopStartPromise: Promise<string> | null = null;
const desktopStartEvent = 'asrbox-desktop-start-state';

function emitDesktopStartState() {
  window.dispatchEvent(new Event(desktopStartEvent));
}

function startDesktopServer(t: ReturnType<typeof useI18n>['t']) {
  if (!desktopStartPromise) {
    desktopStartPromise = (async () => {
      const serverUrl = await desktopCapabilities.startServer();
      if (!serverUrl) throw new Error(t('status.backendDesktopUnavailable'));
      useServerStore.getState().setServerUrl(serverUrl);
      const health = await apiClient.getHealth();
      if (health.status !== 'healthy' || health.backend_type !== 'web-first') {
        throw new Error(t('status.backendDesktopUnavailable'));
      }
      return serverUrl;
    })().finally(() => {
      desktopStartPromise = null;
      emitDesktopStartState();
    });
    emitDesktopStartState();
  }

  return desktopStartPromise;
}

export function useDesktopServerControl() {
  const queryClient = useQueryClient();
  const toast = useToast();
  const { t } = useI18n();
  const isDesktop = desktopCapabilities.runtime === 'tauri';
  const [sharedStarting, setSharedStarting] = useState(Boolean(desktopStartPromise));

  useEffect(() => {
    const update = () => setSharedStarting(Boolean(desktopStartPromise));
    window.addEventListener(desktopStartEvent, update);
    update();
    return () => window.removeEventListener(desktopStartEvent, update);
  }, []);

  const mutation = useMutation({
    mutationFn: async (_options?: StartServerOptions) => {
      return startDesktopServer(t);
    },
    onSuccess: (_serverUrl, options) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.health });
      queryClient.invalidateQueries({ queryKey: queryKeys.readiness });
      queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
      if (options?.showToast !== false) {
        toast.success(t('toast.backendStarted'));
      }
    },
    onError: (error, options) => {
      if (options?.showToast !== false) {
        toast.error(t('toast.backendStartFailed'), toastErrorMessage(error));
      }
    },
  });

  return {
    isDesktop,
    isStarting: mutation.isPending || sharedStarting,
    startServer: (options?: StartServerOptions) => mutation.mutate(options),
    startServerAsync: (options?: StartServerOptions) => mutation.mutateAsync(options),
  };
}
