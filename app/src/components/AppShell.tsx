import { Activity, AlertTriangle, CheckCircle2, CloudOff, Cpu, DownloadCloud, Radio } from 'lucide-react';
import { type ReactNode } from 'react';
import { Sidebar } from './Sidebar';
import { Badge, Progress } from './weiui';
import { useActiveDownloadsQuery, useActiveTasksQuery, useHealthQuery, useRuntimeQuery } from '../lib/queries';
import { formatBytes, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { getActiveDownloadItems, getActiveTaskItems } from '../lib/api';

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <div className="app-bg flex h-dvh min-w-[320px] overflow-hidden">
      <Sidebar />
      <div className="flex min-w-0 flex-1 flex-col">
        <TopStatusBar />
        <main className="min-h-0 flex-1 overflow-auto">
          <div className="mx-auto w-full max-w-[1680px] p-4 xl:p-5">{children}</div>
        </main>
        <BottomTaskBar />
      </div>
    </div>
  );
}

function TopStatusBar() {
  const healthQuery = useHealthQuery();
  const runtimeQuery = useRuntimeQuery();
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

      <div className="hidden items-center gap-2 md:flex">
        <Badge tone={connected ? 'success' : 'danger'}>
          {connected ? <CheckCircle2 className="mr-1 size-3" /> : <CloudOff className="mr-1 size-3" />}
          {connected ? t('status.backendOnline') : t('status.backendOffline')}
        </Badge>
        {runtime && (
          <>
            <Badge tone={runtime.ffmpeg_available ? 'success' : 'warning'}>
              {runtime.ffmpeg_available ? t('status.ffmpegReady') : t('status.ffmpegMissing')}
            </Badge>
            <Badge tone={runtime.torch_cuda_available || runtime.torch_mps_available ? 'accent' : 'neutral'}>
              <Cpu className="mr-1 size-3" />
              {runtime.torch_cuda_available ? 'CUDA' : runtime.torch_mps_available ? 'MPS' : 'CPU'}
            </Badge>
            {runtime.free_disk_bytes != null && <Badge tone="neutral">{t('status.freeDisk')} {formatBytes(runtime.free_disk_bytes)}</Badge>}
          </>
        )}
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
    <footer className="app-shell-surface grid min-h-14 shrink-0 grid-cols-1 gap-2 border-t app-border px-4 py-2 lg:grid-cols-[1fr_1fr_auto] lg:items-center">
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs text-app-muted">
          <Activity className="size-3.5" />
          {t('status.activeTask')}
        </div>
        {topTask ? (
          <div className="grid gap-1">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
              <span className="truncate text-app-soft">{topTask.filename}</span>
              <span className="shrink-0 text-app-muted">
                {statusLabel(topTask.status)} · {formatPercent(topTask.progress)}
              </span>
            </div>
            <Progress value={topTask.progress} />
          </div>
        ) : (
          <p className="text-xs text-app-faint">{t('status.noActiveTask')}</p>
        )}
      </div>
      <div className="min-w-0">
        <div className="mb-1 flex items-center gap-2 text-xs text-app-muted">
          <DownloadCloud className="size-3.5" />
          {t('status.modelDownload')}
        </div>
        {topDownload ? (
          <div className="grid gap-1">
            <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
              <span className="truncate text-app-soft">{topDownload.model_name}</span>
              <span className="shrink-0 text-app-muted">
                {topDownload.status} · {formatPercent(topDownload.progress)}
              </span>
            </div>
            <Progress value={topDownload.progress} />
          </div>
        ) : (
          <p className="text-xs text-app-faint">{t('status.noModelDownload')}</p>
        )}
      </div>
      {hasError && (
        <div className="flex items-center gap-2 rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
          <AlertTriangle className="size-4" />
          {t('status.liveUnavailable')}
        </div>
      )}
    </footer>
  );
}
