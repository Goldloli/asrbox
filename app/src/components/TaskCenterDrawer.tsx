import * as DialogPrimitive from '@radix-ui/react-dialog';
import { DownloadCloud, ListChecks, X } from 'lucide-react';
import { Badge, Button, Progress } from './weiui';
import { getActiveDownloadItems, getActiveTaskItems, type ModelProgress, type TranscriptionTask } from '../lib/api';
import { useActiveDownloadsQuery, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatPercent } from '../lib/format';
import { useI18n } from '../lib/i18n';

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
                {activeTasks.length} {t('tasks.active')} · {downloads.length} {t('status.modelDownload')}
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

function TaskSection({ title, empty, children }: { title: string; empty: string; children: React.ReactNode }) {
  const hasItems = Array.isArray(children) ? children.length > 0 : Boolean(children);
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
      <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-app">{task.filename}</span>
        <Badge tone={task.status === 'completed' ? 'success' : task.status === 'failed' || task.status === 'failed_resumable' ? 'danger' : 'warning'}>
          {statusLabel}
        </Badge>
      </div>
      <Progress value={task.progress} />
      <p className="truncate text-xs text-app-muted">{task.model_name ?? task.provider_id ?? task.source} · {formatPercent(task.progress)}</p>
    </div>
  );
}

function TaskCenterDownload({ download }: { download: ModelProgress }) {
  return (
    <div className="grid gap-2 rounded-lg border app-border bg-[var(--app-control)] px-3 py-3">
      <div className="flex min-w-0 items-center justify-between gap-3 text-sm">
        <span className="truncate font-medium text-app">{download.model_name}</span>
        <Badge tone={download.status === 'error' ? 'danger' : download.status === 'complete' ? 'success' : 'warning'}>
          {download.status}
        </Badge>
      </div>
      <Progress value={download.progress} />
      <p className="truncate text-xs text-app-muted">
        <DownloadCloud className="mr-1 inline size-3" />
        {download.filename ?? download.source ?? formatPercent(download.progress)}
      </p>
    </div>
  );
}
