import * as DialogPrimitive from '@radix-ui/react-dialog';
import { Children, type ReactNode } from 'react';
import { DownloadCloud, FileAudio, FolderOpen, ListChecks, PackageCheck, X } from 'lucide-react';
import { Button, Progress } from './weiui';
import { getActiveDownloadItems, getActiveTaskItems, type ModelProgress, type TranscriptionTask } from '../lib/api';
import { useActiveDownloadsQuery, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatBytes, formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { ResultItemContent } from './ResultItem';
import { cancelAppUpdateDownload, startAppUpdateDownload, useAppUpdateStore } from '../stores/appUpdateStore';
import { useUiStore } from '../stores/uiStore';
import { desktopCapabilities, type AppUpdateDownloadState } from '../lib/desktopCapabilities';
import { localizedErrorPresentation } from '../lib/errorMessages';
import { LocalizedTechnicalMessage } from './LocalizedTechnicalMessage';

export function TaskCenterDrawer() {
  const { t, statusLabel } = useI18n();
  const tasksQuery = useTasksQuery();
  const activeTasksQuery = useActiveTasksQuery();
  const downloadsQuery = useActiveDownloadsQuery();
  const tasks = tasksQuery.data?.items ?? [];
  const activeTasks = getActiveTaskItems(activeTasksQuery.data);
  const downloads = getActiveDownloadItems(downloadsQuery.data);
  const failedTasks = tasks.filter((task) => task.status === 'failed' || task.status === 'failed_resumable');
  const completedTasks = tasks.filter((task) => task.status === 'completed');
  const appUpdateDownload = useAppUpdateStore((state) => state.download);
  const updateChannel = useUiStore((state) => state.updateChannel);
  const showAppUpdate = appUpdateDownload.status !== 'idle';

  return (
    <DialogPrimitive.Root>
      <DialogPrimitive.Trigger asChild>
        <Button variant="secondary" size="sm" className="h-8 shrink-0">
          <ListChecks className="size-4" />
          {t('taskCenter.trigger')}
        </Button>
      </DialogPrimitive.Trigger>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-[70] bg-black/50" />
        <DialogPrimitive.Content className="fixed inset-y-0 right-0 z-[80] grid w-[min(440px,calc(100vw-24px))] grid-rows-[auto_minmax(0,1fr)] border-l border-[color:var(--app-border)] bg-[var(--app-panel-solid)] p-0 text-app shadow-2xl shadow-[var(--app-shadow)]">
          <div className="flex items-start justify-between gap-4 border-b app-border px-5 py-4">
            <div className="min-w-0">
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-accent">{t('taskCenter.eyebrow')}</p>
              <DialogPrimitive.Title className="text-lg font-semibold">{t('taskCenter.title')}</DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1 text-sm text-app-muted">
                {activeTasks.length} {t('tasks.active')} · {downloads.length + (showAppUpdate ? 1 : 0)} {t('taskCenter.downloads')}
              </DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close className="grid size-8 place-items-center rounded-lg text-app-muted transition hover:bg-[var(--app-control)] hover:text-app">
              <X className="size-4" />
            </DialogPrimitive.Close>
          </div>
          <div className="grid content-start gap-4 overflow-auto p-5">
            <TaskSection title={t('taskCenter.activeTasks')} empty={t('status.noActiveTask')}>
              {activeTasks.slice(0, 6).map((task) => <TaskCenterTask key={task.id} task={task} statusLabel={statusLabel(task.status)} />)}
            </TaskSection>
            <TaskSection title={t('taskCenter.downloads')} empty={t('status.noModelDownload')}>
              {downloads.slice(0, 6).map((download) => <TaskCenterDownload key={download.model_name} download={download} />)}
              {showAppUpdate && <TaskCenterAppUpdate key="application-update" download={appUpdateDownload} channel={updateChannel} />}
            </TaskSection>
            <TaskSection title={t('taskCenter.failedTasks')} empty={t('taskCenter.noFailedTasks')}>
              {failedTasks.slice(0, 6).map((task) => <TaskCenterTask key={task.id} task={task} statusLabel={statusLabel(task.status)} />)}
            </TaskSection>
            <TaskSection title={t('taskCenter.completedTasks')} empty={t('taskCenter.noCompletedTasks')}>
              {completedTasks.slice(0, 6).map((task) => <TaskCenterTask key={task.id} task={task} statusLabel={statusLabel(task.status)} />)}
            </TaskSection>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function TaskCenterAppUpdate({
  download,
  channel,
}: {
  download: AppUpdateDownloadState;
  channel: 'stable' | 'prerelease';
}) {
  const { locale, t } = useI18n();
  const installerKind = useAppUpdateStore((state) => state.versionInfo.installerKind);
  const active = ['preparing', 'downloading', 'verifying', 'cancelling'].includes(download.status);
  const retry = () => {
    if (!download.version) return;
    void startAppUpdateDownload(download.version, channel).catch(() => undefined);
  };
  return (
    <div className="grid gap-2 rounded-lg border app-border bg-[var(--app-control)] px-3 py-3">
      <ResultItemContent
        icon={<PackageCheck className="size-4" />}
        title={t('about.applicationUpdate')}
        description={`${download.filename ?? download.version ?? 'ASRbox'} · ${formatBytes(download.downloadedBytes)}`}
        meta={download.status}
        tone={download.status === 'error' ? 'danger' : download.status === 'completed' ? 'success' : 'warning'}
      />
      {(active || download.progress != null) && <Progress value={download.progress} />}
      {download.error && <LocalizedTechnicalMessage message={localizedErrorPresentation(new Error(download.error), locale)} className="text-xs text-[var(--app-danger)]" />}
      <div className="flex flex-wrap gap-2">
        {active && (
          <Button size="sm" variant="secondary" onClick={() => void cancelAppUpdateDownload().catch(() => undefined)} disabled={download.status === 'cancelling'}>
            {t('common.cancel')}
          </Button>
        )}
        {(download.status === 'error' || download.status === 'cancelled') && download.version && (
          <Button size="sm" variant="secondary" onClick={retry}>{t('common.retry')}</Button>
        )}
        {download.status === 'completed' && (
          <>
            <Button size="sm" onClick={() => void desktopCapabilities.openDownloadedUpdate().catch(() => undefined)}>
              {installerKind === 'nsis' ? t('about.openInstallerNsis') : t('about.openInstaller')}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => void desktopCapabilities.openUpdateFileLocation().catch(() => undefined)}>
              <FolderOpen className="size-4" />
              {t('about.openFileLocation')}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}

function TaskSection({ title, empty, children }: { title: string; empty: string; children: ReactNode }) {
  const hasItems = Children.toArray(children).length > 0;
  return (
    <section className="grid gap-2">
      <h2 className="text-sm font-semibold text-app">{title}</h2>
      {hasItems ? children : <p className="rounded-lg border app-border px-3 py-4 text-sm text-app-muted">{empty}</p>}
    </section>
  );
}

function TaskCenterTask({ task, statusLabel }: { task: TranscriptionTask; statusLabel: string }) {
  return (
    <div className="grid gap-2 rounded-lg border app-border bg-[var(--app-control)] px-3 py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <ResultItemContent
          icon={<FileAudio className="size-4" />}
          title={task.filename}
          description={`${task.model_name ?? task.provider_id ?? task.source} · ${formatPercent(task.progress)}`}
          meta={statusLabel}
          tone={task.status === 'completed' ? 'success' : task.status === 'failed' || task.status === 'failed_resumable' ? 'danger' : 'warning'}
        />
      </div>
      <Progress value={task.progress} />
    </div>
  );
}

function TaskCenterDownload({ download }: { download: ModelProgress }) {
  return (
    <div className="grid gap-2 rounded-lg border app-border bg-[var(--app-control)] px-3 py-3">
      <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <ResultItemContent
          icon={<DownloadCloud className="size-4" />}
          title={download.model_name}
          description={download.filename ?? download.source ?? formatPercent(download.progress)}
          meta={download.status}
          tone={download.status === 'error' ? 'danger' : download.status === 'complete' ? 'success' : 'warning'}
        />
      </div>
      <Progress value={download.progress} />
    </div>
  );
}
