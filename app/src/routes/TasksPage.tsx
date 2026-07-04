import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArchiveX, FileAudio, RotateCcw, Scissors, Square, Trash2, Wand2 } from 'lucide-react';
import { apiClient, getActiveTaskItems, type TaskStatus, type TranscriptionTask } from '../lib/api';
import { queryKeys, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration, formatPercent } from '../lib/format';
import { Button, EmptyState, ErrorState, Panel, PanelHeader, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { StatusPill } from '../components/StatusPill';
import { TaskTimeline } from '../components/TaskTimeline';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';

const statuses: Array<'all' | TaskStatus> = ['all', 'queued', 'transcribing', 'completed', 'failed', 'failed_resumable', 'cancelled'];

export function TasksPage() {
  const queryClient = useQueryClient();
  const { t, statusLabel } = useI18n();
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const tasksQuery = useTasksQuery();
  const activeTasksQuery = useActiveTasksQuery();
  const tasks = tasksQuery.data?.items ?? [];

  const filteredTasks = useMemo(() => (status === 'all' ? tasks : tasks.filter((task) => task.status === status)), [status, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? tasks[0];

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
          <div className="grid gap-2">
            {filteredTasks.map((task) => (
              <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} onSelect={() => setSelectedTaskId(task.id)} />
            ))}
            {filteredTasks.length === 0 && <EmptyState title={t('tasks.noMatching')} body={t('tasks.noMatchingBody')} icon={<FileAudio className="size-5" />} />}
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
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => cancel.mutate(selectedTask.id)}>
                  <Square className="size-4" />
                  {t('common.cancel')}
                </Button>
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
                <Button size="sm" variant="secondary" onClick={() => cleanupArtifacts.mutate(selectedTask.id)}>
                  <ArchiveX className="size-4" />
                  {t('tasks.cleanup')}
                </Button>
                <Button size="sm" variant="danger" onClick={() => remove.mutate(selectedTask.id)}>
                  <Trash2 className="size-4" />
                  {t('common.delete')}
                </Button>
              </div>
            </div>
          ) : (
            <EmptyState title={t('tasks.noSelected')} />
          )}
        </Panel>

        {selectedTask && (
          <Panel className="overflow-hidden">
            <div className="p-5">
              <Tabs defaultValue="timeline" className="grid gap-4">
                <TabsList>
                  <TabsTrigger value="timeline">{t('tasks.timeline')}</TabsTrigger>
                  <TabsTrigger value="transcript">{t('transcript.title')}</TabsTrigger>
                </TabsList>
                <TabsContent value="timeline">
                  <TaskTimeline diagnostics={diagnosticsQuery.data} logs={logsQuery.data} versions={versionsQuery.data} />
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

function TaskRow({ task, selected, onSelect }: { task: TranscriptionTask; selected: boolean; onSelect: () => void }) {
  return (
    <button
      className={cn(
        'grid gap-3 rounded-xl border px-4 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]',
        selected ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]',
      )}
      onClick={onSelect}
    >
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
