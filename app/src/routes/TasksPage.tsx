import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArchiveX, Clipboard, Download, FileAudio, FolderOpen, History, RotateCcw, Scissors, Square, Trash2, Wand2 } from 'lucide-react';
import { apiClient, getActiveTaskItems, type TaskStatus, type TranscriptionTask } from '../lib/api';
import { queryKeys, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration, formatPercent } from '../lib/format';
import { Button, EmptyState, ErrorState, Panel, PanelHeader, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { ConfirmAction } from '../components/ConfirmAction';
import { StatusPill } from '../components/StatusPill';
import { TaskTimeline, type TaskTimelineTab } from '../components/TaskTimeline';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';

const statuses: Array<'all' | TaskStatus> = ['all', 'queued', 'transcribing', 'completed', 'failed', 'failed_resumable', 'cancelled'];
const outputFileFormats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

export function TasksPage() {
  const queryClient = useQueryClient();
  const { t, statusLabel } = useI18n();
  const toast = useToast();
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [detailTab, setDetailTab] = useState<'timeline' | 'transcript'>('timeline');
  const [timelineTab, setTimelineTab] = useState<TaskTimelineTab>('diagnostics');
  const [batchBusy, setBatchBusy] = useState(false);
  const tasksQuery = useTasksQuery();
  const activeTasksQuery = useActiveTasksQuery();
  const tasks = tasksQuery.data?.items ?? [];

  const filteredTasks = useMemo(() => (status === 'all' ? tasks : tasks.filter((task) => task.status === status)), [status, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? tasks[0];
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id)),
    [selectedTaskIds, tasks],
  );
  const selectedCompletedTasks = selectedTasks.filter((task) => task.status === 'completed');
  const selectedExportFormats = Array.from(new Set(selectedCompletedTasks.flatMap((task) => getTaskOutputFormats(task)))).slice(0, 6);
  const allFilteredSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.includes(task.id));

  const diagnosticsQuery = useQuery({
    queryKey: selectedTask ? queryKeys.taskDiagnostics(selectedTask.id) : ['tasks', 'empty', 'diagnostics'],
    queryFn: () => apiClient.getTaskDiagnostics(selectedTask!.id),
    enabled: Boolean(selectedTask),
    retry: 1,
  });
  const logsQuery = useQuery({
    queryKey: selectedTask ? queryKeys.taskLogs(selectedTask.id) : ['tasks', 'empty', 'logs'],
    queryFn: () => apiClient.getTaskLogs(selectedTask!.id),
    enabled: Boolean(selectedTask),
    retry: 1,
  });
  const versionsQuery = useQuery({
    queryKey: selectedTask ? queryKeys.taskVersions(selectedTask.id) : ['tasks', 'empty', 'versions'],
    queryFn: () => apiClient.getTaskVersions(selectedTask!.id),
    enabled: Boolean(selectedTask),
    retry: 1,
  });

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeTasks });
  };

  const cancel = useTaskMutation(apiClient.cancelTask.bind(apiClient), refresh, t('toast.taskCancelled'));
  const retry = useTaskMutation(apiClient.retryTask.bind(apiClient), refresh, t('toast.taskRetried'));
  const retranscribe = useTaskMutation(apiClient.retranscribeTask.bind(apiClient), refresh, t('toast.taskRetranscribed'));
  const postprocess = useTaskMutation(apiClient.postprocessTask.bind(apiClient), refresh, t('toast.taskPostprocessStarted'));
  const retryChunks = useTaskMutation(apiClient.retryFailedChunks.bind(apiClient), refresh, t('toast.taskChunksRetried'));
  const cleanupArtifacts = useTaskMutation(apiClient.cleanupTaskArtifacts.bind(apiClient), refresh, t('toast.taskArtifactsCleaned'));
  const remove = useTaskMutation(apiClient.deleteTask.bind(apiClient), refresh, t('toast.taskDeleted'));

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => (
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    ));
  };

  const toggleFilteredSelection = () => {
    const filteredIds = filteredTasks.map((task) => task.id);
    setSelectedTaskIds((current) => (
      allFilteredSelected
        ? current.filter((id) => !filteredIds.includes(id))
        : Array.from(new Set([...current, ...filteredIds]))
    ));
  };

  const runBatchTaskAction = async (mutationFn: (id: string) => Promise<unknown>, successMessage: string) => {
    if (selectedTaskIds.length === 0) return;
    setBatchBusy(true);
    try {
      await Promise.all(selectedTaskIds.map((id) => mutationFn(id)));
      toast.success(successMessage, `${selectedTaskIds.length} ${t('tasks.batchItems')}`);
      setSelectedTaskIds([]);
      refresh();
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    } finally {
      setBatchBusy(false);
    }
  };

  const exportSelectedTasks = (format: string) => {
    selectedCompletedTasks.forEach((task) => {
      const link = document.createElement('a');
      link.href = apiClient.exportTaskUrl(task.id, format);
      link.rel = 'noopener noreferrer';
      link.download = '';
      link.click();
    });
    toast.info(t('tasks.batchExportStarted'), `${selectedCompletedTasks.length} ${t('tasks.batchItems')} · ${format.toUpperCase()}`);
  };

  const copyTaskText = async (task: TranscriptionTask) => {
    try {
      await navigator.clipboard.writeText(task.text ?? '');
      toast.success(t('toast.copied'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_420px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('tasks.eyebrow')}
          title={t('tasks.title')}
          description={`${tasks.length} ${t('tasks.description')} · ${getActiveTaskItems(activeTasksQuery.data).length} ${t('tasks.active')}`}
          action={
            <div className="hidden gap-2 lg:flex">
              {statuses.map((item) => (
                <Button key={item} size="sm" variant={status === item ? 'primary' : 'secondary'} onClick={() => setStatus(item)}>
                  {statusLabel(item)}
                </Button>
              ))}
            </div>
          }
        />
        <div className="grid gap-3 p-4">
          {tasksQuery.error && <ErrorState title={t('common.unableToLoad')} error={tasksQuery.error} />}
          {filteredTasks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-xl border app-control px-3 py-2">
              <label className="flex items-center gap-2 text-xs text-app-muted">
                <input
                  type="checkbox"
                  checked={allFilteredSelected}
                  onChange={toggleFilteredSelection}
                  className="size-4 rounded border app-control accent-[var(--app-accent)]"
                />
                {selectedTaskIds.length > 0 ? `${selectedTaskIds.length} ${t('tasks.batchSelected')}` : t('tasks.batchSelectAll')}
              </label>
              <div className="flex flex-1 flex-wrap justify-end gap-2">
                <ConfirmAction
                  title={t('confirm.cancelTitle')}
                  description={t('confirm.batchCancelTaskDescription')}
                  confirmLabel={t('common.cancel')}
                  tone="secondary"
                  onConfirm={() => runBatchTaskAction(apiClient.cancelTask.bind(apiClient), t('toast.taskCancelled'))}
                >
                  <Button size="sm" variant="secondary" disabled={selectedTaskIds.length === 0 || batchBusy}>
                    <Square className="size-4" />
                    {t('common.cancel')}
                  </Button>
                </ConfirmAction>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={selectedTaskIds.length === 0 || batchBusy}
                  onClick={() => runBatchTaskAction(apiClient.retryTask.bind(apiClient), t('toast.taskRetried'))}
                >
                  <RotateCcw className="size-4" />
                  {t('tasks.retry')}
                </Button>
                {selectedExportFormats.map((format) => (
                  <Button
                    key={format}
                    size="sm"
                    variant="secondary"
                    disabled={selectedCompletedTasks.length === 0}
                    onClick={() => exportSelectedTasks(format)}
                  >
                    <Download className="size-4" />
                    {format.toUpperCase()}
                  </Button>
                ))}
                <ConfirmAction
                  title={t('confirm.deleteTitle')}
                  description={t('confirm.batchDeleteTaskDescription')}
                  confirmLabel={t('common.delete')}
                  onConfirm={() => runBatchTaskAction(apiClient.deleteTask.bind(apiClient), t('toast.taskDeleted'))}
                >
                  <Button size="sm" variant="danger" disabled={selectedTaskIds.length === 0 || batchBusy}>
                    <Trash2 className="size-4" />
                    {t('common.delete')}
                  </Button>
                </ConfirmAction>
              </div>
            </div>
          )}
          <div className="grid gap-2">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedTask?.id === task.id}
                checked={selectedTaskIds.includes(task.id)}
                onToggle={() => toggleTaskSelection(task.id)}
                onSelect={() => setSelectedTaskId(task.id)}
              />
            ))}
            {filteredTasks.length === 0 && (
              <EmptyState
                title={t('tasks.noMatching')}
                body={t('tasks.noMatchingBody')}
                icon={<FileAudio className="size-5" />}
                action={
                  <Button asChild>
                    <Link to="/">{t('transcribe.start')}</Link>
                  </Button>
                }
              />
            )}
          </div>
        </div>
      </Panel>

      <div className="grid content-start gap-4">
        <Panel className="overflow-hidden">
          <PanelHeader
            eyebrow={t('tasks.inspector')}
            title={selectedTask?.filename ?? t('tasks.noSelected')}
            description={selectedTask ? `${selectedTask.id} · ${formatDate(selectedTask.updated_at)}` : t('tasks.selectFromQueue')}
            action={selectedTask && <StatusPill status={selectedTask.status} />}
          />
          {selectedTask ? (
            <div className="grid gap-4 p-5">
              <Progress value={selectedTask.progress} />
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label={t('tasks.engine')} value={selectedTask.model_name ?? selectedTask.provider_id ?? selectedTask.source} />
                <Metric label={t('tasks.duration')} value={formatDuration(selectedTask.duration_ms)} />
                <Metric label={t('tasks.created')} value={formatDate(selectedTask.created_at)} />
                <Metric label={t('tasks.progress')} value={formatPercent(selectedTask.progress)} />
              </div>
              {selectedTask.error && <ErrorState title={selectedTask.error_code ?? 'Task error'} error={selectedTask.error} />}
              {selectedTask.status === 'completed' && (
                <div className="grid gap-3 rounded-xl border app-control p-3">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-app">{t('tasks.outputFiles')}</h3>
                    <Button size="sm" variant="secondary" onClick={() => copyTaskText(selectedTask)} disabled={!selectedTask.text}>
                      <Clipboard className="size-4" />
                      {t('tasks.copyFullText')}
                    </Button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {outputFileFormats.map((format) => (
                      <Button key={format} asChild size="sm" variant="secondary">
                        <a href={apiClient.exportTaskUrl(selectedTask.id, format)}>
                          <Download className="size-4" />
                          {format.toUpperCase()}
                        </a>
                      </Button>
                    ))}
                    <Button
                      size="sm"
                      variant="secondary"
                      disabled
                      title={t('tasks.openFileLocationUnavailable')}
                    >
                      <FolderOpen className="size-4" />
                      {t('tasks.openFileLocation')}
                    </Button>
                  </div>
                </div>
              )}
              <div className="flex flex-wrap gap-2">
                <ConfirmAction
                  title={t('confirm.cancelTitle')}
                  description={t('confirm.cancelTaskDescription')}
                  confirmLabel={t('common.cancel')}
                  tone="secondary"
                  onConfirm={() => cancel.mutate(selectedTask.id)}
                >
                  <Button size="sm" variant="secondary">
                    <Square className="size-4" />
                    {t('common.cancel')}
                  </Button>
                </ConfirmAction>
                <Button size="sm" variant="secondary" onClick={() => retry.mutate(selectedTask.id)}>
                  <RotateCcw className="size-4" />
                  {t('tasks.retry')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => retranscribe.mutate(selectedTask.id)}>
                  <Wand2 className="size-4" />
                  {t('tasks.retranscribe')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => postprocess.mutate(selectedTask.id)}>
                  <Scissors className="size-4" />
                  {t('tasks.postprocess')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => retryChunks.mutate(selectedTask.id)}>
                  <RotateCcw className="size-4" />
                  {t('tasks.retryChunks')}
                </Button>
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    setDetailTab('timeline');
                    setTimelineTab('versions');
                  }}
                >
                  <History className="size-4" />
                  {t('tasks.versions')}
                </Button>
                <ConfirmAction
                  title={t('confirm.cleanupTitle')}
                  description={t('confirm.cleanupTaskDescription')}
                  confirmLabel={t('tasks.cleanup')}
                  tone="secondary"
                  onConfirm={() => cleanupArtifacts.mutate(selectedTask.id)}
                >
                  <Button size="sm" variant="secondary">
                    <ArchiveX className="size-4" />
                    {t('tasks.cleanup')}
                  </Button>
                </ConfirmAction>
                <ConfirmAction
                  title={t('confirm.deleteTitle')}
                  description={t('confirm.deleteTaskDescription')}
                  confirmLabel={t('common.delete')}
                  onConfirm={() => remove.mutate(selectedTask.id)}
                >
                  <Button size="sm" variant="danger">
                    <Trash2 className="size-4" />
                    {t('common.delete')}
                  </Button>
                </ConfirmAction>
              </div>
            </div>
          ) : (
            <EmptyState
              title={t('tasks.noSelected')}
              action={
                <Button asChild>
                  <Link to="/">{t('transcribe.start')}</Link>
                </Button>
              }
            />
          )}
        </Panel>

        {selectedTask && (
          <Panel className="overflow-hidden">
            <div className="p-5">
              <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as 'timeline' | 'transcript')} className="grid gap-4">
                <TabsList>
                  <TabsTrigger value="timeline">{t('tasks.timeline')}</TabsTrigger>
                  <TabsTrigger value="transcript">{t('transcript.title')}</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline">
                  <TaskTimeline
                    diagnostics={diagnosticsQuery.data}
                    logs={logsQuery.data}
                    versions={versionsQuery.data}
                    currentText={selectedTask.text}
                    value={timelineTab}
                    onValueChange={setTimelineTab}
                  />
                </TabsContent>
                <TabsContent value="transcript">
                  <TranscriptViewer task={selectedTask} />
                </TabsContent>
              </Tabs>
            </div>
          </Panel>
        )}
      </div>
    </section>
  );
}

function TaskRow({
  task,
  selected,
  checked,
  onToggle,
  onSelect,
}: {
  task: TranscriptionTask;
  selected: boolean;
  checked: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <article
      className={cn(
        'grid grid-cols-[auto_minmax(0,1fr)] items-start gap-3 rounded-xl border px-4 py-3 transition hover:border-white/20 hover:bg-white/[0.04]',
        selected ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]',
      )}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onToggle}
        aria-label={task.filename}
        className="mt-1 size-4 rounded border app-control accent-[var(--app-accent)]"
      />
      <button type="button" className="grid min-w-0 gap-3 text-left" onClick={onSelect}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="truncate text-sm font-semibold text-zinc-100">{task.filename}</h2>
            <p className="mt-1 text-xs text-zinc-500">{task.model_name ?? task.provider_id ?? task.source} · {formatDuration(task.duration_ms)}</p>
          </div>
          <StatusPill status={task.status} />
        </div>
        <Progress value={task.progress} />
        <div className="flex justify-between gap-3 text-xs text-zinc-500">
          <span>{formatDate(task.updated_at)}</span>
          <span>{formatPercent(task.progress)}</span>
        </div>
      </button>
    </article>
  );
}

function Metric({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-zinc-200">{value || '-'}</p>
    </div>
  );
}

function useTaskMutation<T>(mutationFn: (id: string) => Promise<T>, onSuccess: () => void, successMessage: string) {
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      onSuccess();
      toast.success(successMessage);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
}
