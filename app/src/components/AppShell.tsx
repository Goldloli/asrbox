import { Activity, AlertTriangle, CheckCircle2, CloudOff, Cpu, DownloadCloud, PlugZap, Radio } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { TaskCenterDrawer } from './TaskCenterDrawer';
import { GlobalSearch } from './GlobalSearch';
import { CommandPalette } from './CommandPalette';
import { GlobalShortcuts } from './GlobalShortcuts';
import { PersistentAudioPlayer } from './PersistentAudioPlayer';
import { Badge, Button } from './weiui';
import { useActiveDownloadsQuery, useActiveTasksQuery, useHealthQuery, useRuntimeQuery } from '../lib/queries';
import { formatBytes, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { getActiveDownloadItems, getActiveTaskItems } from '../lib/api';
import { useDesktopServerControl } from '../lib/useDesktopServerControl';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();

  return (
    <div className="app-bg flex h-dvh min-w-[320px] overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:border focus:border-[color:var(--app-accent)] focus:bg-[var(--app-panel-solid)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <GlobalShortcuts />
        <CommandPalette />
        <TopStatusBar />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-auto focus:outline-none">
          <div className="mx-auto w-full max-w-[1680px] p-4 xl:p-5">{children}</div>
        </main>
        <PersistentAudioPlayer />
        <MobileNav />
        <BottomTaskBar />
      </div>
    </div>
  );
}

function TopStatusBar() {
  const healthQuery = useHealthQuery();
  const runtimeQuery = useRuntimeQuery();
  const desktopServer = useDesktopServerControl();
  const { t } = useI18n();
  const connected = healthQuery.isSuccess;
  const runtime = runtimeQuery.data;

  return (
    <header className="app-shell-surface flex h-14 shrink-0 items-center justify-between border-b app-border px-4 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="grid size-8 place-items-center rounded-lg border app-control">
          <Radio className="size-4 text-app-accent" />
        </div>
        <div>
          <p className="text-sm font-semibold text-app">ASRbox</p>
          <p className="text-xs text-app-muted">{t('app.subtitle')}</p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <GlobalSearch />
        <div className="hidden items-center gap-2 md:flex">
          {connected ? (
            <Badge tone="success">
              <CheckCircle2 className="mr-1 size-3" />
              {t('status.backendOnline')}
            </Badge>
          ) : desktopServer.isDesktop && desktopServer.isStarting ? (
            <Badge tone="warning">
              <PlugZap className="mr-1 size-3" />
              {t('status.startingBackend')}
            </Badge>
          ) : (
            <>
              <Link to="/settings" search={{ tab: 'storage' }} aria-label={t('status.openDiagnostics')} className="transition hover:opacity-80">
                <Badge tone="danger">
                  <CloudOff className="mr-1 size-3" />
                  {t('status.backendOffline')}
                </Badge>
              </Link>
              {desktopServer.isDesktop && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => desktopServer.startServer()}
                  disabled={desktopServer.isStarting}
                  title={t('status.startBackend')}
                >
                  <PlugZap className="size-3.5" />
                  {desktopServer.isStarting ? t('status.startingBackend') : t('status.startBackend')}
                </Button>
              )}
            </>
          )}
          {runtime && (
            <>
              <Link to="/settings" search={{ tab: 'storage' }} aria-label={t('status.openDiagnostics')} className="transition hover:opacity-80">
                <Badge tone={runtime.ffmpeg_available && runtime.ffprobe_available ? 'success' : 'warning'}>
                  {runtime.ffmpeg_available && runtime.ffprobe_available ? t('status.ffmpegReady') : t('status.ffmpegMissing')}
                </Badge>
              </Link>
              <Badge tone={runtime.torch_cuda_available || runtime.torch_mps_available ? 'accent' : 'neutral'}>
                <Cpu className="mr-1 size-3" />
                {runtime.torch_cuda_available ? 'CUDA' : runtime.torch_mps_available ? 'MPS' : 'CPU'}
              </Badge>
              {runtime.free_disk_bytes != null && <Badge tone="neutral">{t('status.freeDisk')} {formatBytes(runtime.free_disk_bytes)}</Badge>}
            </>
          )}
        </div>
      </div>
    </header>
  );
}

function BottomTaskBar() {
  const { t, statusLabel } = useI18n();
  const activeTasksQuery = useActiveTasksQuery();
  const downloadsQuery = useActiveDownloadsQuery();
  const activeTasks = getActiveTaskItems(activeTasksQuery.data);
  const downloads = getActiveDownloadItems(downloadsQuery.data);
  const topTask = activeTasks[0];
  const topDownload = downloads[0];
  const hasError = activeTasksQuery.isError || downloadsQuery.isError;

  return (
    <footer className="app-shell-surface flex h-11 shrink-0 items-center gap-2 overflow-x-auto border-t app-border px-3">
      <Link to="/tasks" className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-app-muted transition hover:bg-[var(--app-control)] hover:text-app">
        <Activity className="size-3.5" />
        {topTask ? (
          <>
            <span className="max-w-36 truncate text-app-soft">{topTask.filename}</span>
            <span className="shrink-0">{statusLabel(topTask.status)} · {formatPercent(topTask.progress)}</span>
          </>
        ) : (
          <span>{t('status.noActiveTask')}</span>
        )}
      </Link>
      <Link to="/models" className="flex min-w-0 shrink-0 items-center gap-2 rounded-lg px-2 py-1.5 text-xs text-app-muted transition hover:bg-[var(--app-control)] hover:text-app">
        <DownloadCloud className="size-3.5" />
        {topDownload ? (
          <>
            <span className="max-w-36 truncate text-app-soft">{topDownload.model_name}</span>
            <span className="shrink-0">{topDownload.status} · {formatPercent(topDownload.progress)}</span>
          </>
        ) : (
          <span>{t('status.noModelDownload')}</span>
        )}
      </Link>
      <TaskCenterDrawer />
      {hasError && (
        <Link
          to="/settings"
          search={{ tab: 'storage' }}
          aria-label={t('status.openDiagnostics')}
          className="ml-auto flex shrink-0 items-center gap-2 rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-1.5 text-xs text-[var(--app-danger)] transition hover:brightness-95"
        >
          <AlertTriangle className="size-4" />
          {t('status.liveUnavailable')}
        </Link>
      )}
    </footer>
  );
}
