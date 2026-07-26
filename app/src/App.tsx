import { useEffect, useState } from 'react';
import { RouterProvider } from '@tanstack/react-router';
import { QueryClient, QueryClientProvider, useQueryClient } from '@tanstack/react-query';
import { router } from './router';
import { TooltipProvider } from './components/weiui';
import { ToastProvider } from './components/Toast';
import { useAppEvents } from './lib/useAppEvents';
import { useDesktopServerControl } from './lib/useDesktopServerControl';
import { useUiStore } from './stores/uiStore';
import { useI18n } from './lib/i18n';
import asrboxIcon from './assets/asrbox-icon.png';
import { AppUpdateRuntime } from './components/AppUpdateRuntime';

const queryClient = new QueryClient();

function AppRuntime() {
  const bootstrap = useDesktopServerBootstrap();
  useAppEvents();
  if (bootstrap.showStartup) return <DesktopStartupScreen {...bootstrap} />;
  return <RouterProvider router={router} />;
}

function useDesktopServerBootstrap() {
  const queryClient = useQueryClient();
  const { isDesktop, startServerAsync } = useDesktopServerControl();
  const [status, setStatus] = useState<'idle' | 'starting' | 'ready' | 'error'>('idle');
  const [startupError, setStartupError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!isDesktop) {
      setStatus('ready');
      return;
    }
    let cancelled = false;
    setStatus('starting');
    setStartupError(null);

    startServerAsync({ showToast: false })
      .then(() => {
        if (cancelled) return;
        queryClient.invalidateQueries();
        setStatus('ready');
      })
      .catch((error) => {
        if (cancelled) return;
        setStartupError(error instanceof Error ? error.message : String(error));
        setStatus('error');
      });

    return () => {
      cancelled = true;
    };
    // startServerAsync is intentionally omitted: the hook returns a fresh wrapper per render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, queryClient, attempt]);

  return {
    showStartup: isDesktop && status !== 'ready',
    isStarting: status === 'starting',
    startupError,
    retry: () => setAttempt((value) => value + 1),
  };
}

function DesktopStartupScreen({
  isStarting,
  startupError,
  retry,
}: {
  isStarting: boolean;
  startupError: string | null;
  retry: () => void;
}) {
  const { t } = useI18n();
  return (
    <div className="app-bg grid h-dvh place-items-center px-6 text-center">
      <div className="grid justify-items-center gap-5">
        <img src={asrboxIcon} alt="ASRbox" className="size-24 rounded-3xl shadow-lg" />
        <div className="grid gap-2">
          <p className="text-base font-semibold text-app">{startupError ? t('toast.backendStartFailed') : t('status.startingBackend')}</p>
          <p className="max-w-sm text-sm text-app-muted">
            {startupError ?? (isStarting ? t('status.backendPreparing') : t('common.loading'))}
          </p>
        </div>
        {startupError && (
          <button
            type="button"
            className="rounded-lg border app-border bg-[var(--app-control)] px-4 py-2 text-sm font-medium text-app transition hover:bg-[var(--app-control-hover)]"
            onClick={retry}
          >
            {t('tasks.retry')}
          </button>
        )}
      </div>
    </div>
  );
}

function ThemeRuntime() {
  const theme = useUiStore((state) => state.theme);
  const density = useUiStore((state) => state.density);
  const fontScale = useUiStore((state) => state.fontScale);
  const reducedMotion = useUiStore((state) => state.reducedMotion);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const applyTheme = () => {
      const resolved = theme === 'system' ? (media.matches ? 'dark' : 'light') : theme;
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    };

    applyTheme();
    media.addEventListener('change', applyTheme);
    return () => media.removeEventListener('change', applyTheme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', density);
  }, [density]);

  useEffect(() => {
    document.documentElement.setAttribute('data-font-scale', fontScale);
  }, [fontScale]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const applyMotion = () => {
      const resolved = reducedMotion === 'system' ? (media.matches ? 'reduce' : 'normal') : reducedMotion;
      document.documentElement.setAttribute('data-reduced-motion', resolved);
    };

    applyMotion();
    media.addEventListener('change', applyMotion);
    return () => media.removeEventListener('change', applyMotion);
  }, [reducedMotion]);

  return null;
}

export default function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <ToastProvider>
          <ThemeRuntime />
          <AppUpdateRuntime />
          <AppRuntime />
        </ToastProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
