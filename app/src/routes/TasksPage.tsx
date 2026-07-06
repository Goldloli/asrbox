import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { ArchiveX, Clipboard, Download, FileAudio, Folder, FolderOpen, History, RotateCcw, Scissors, Search, Square, Star, Trash2, Wand2 } from 'lucide-react';
import { apiClient, getActiveTaskItems, type TaskStatus, type TranscriptionTask } from '../lib/api';
import { queryKeys, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, EmptyState, ErrorState, Input, Panel, PanelHeader, Progress, Select, Tabs, TabsContent, TabsList, TabsTrigger, Textarea } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { ConfirmAction } from '../components/ConfirmAction';
import { StatusPill } from '../components/StatusPill';
import { TaskTimeline, type TaskTimelineTab } from '../components/TaskTimeline';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';
import { ErrorDiagnosticsPanel, FilterCheckboxGroup, Metric, TaskRow, useTaskMutation } from '../components/tasks/TaskWorkbenchParts';

const statuses: Array<'all' | TaskStatus> = ['all', 'queued', 'transcribing', 'completed', 'failed', 'failed_resumable', 'cancelled'];
type DateFilter = 'all' | 'today' | '7d' | '30d';
type ErrorFilter = 'all' | 'with' | 'without';
const outputFileFormats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];
const lastTaskStorageKey = 'asrbox-last-task-id';
const exportPresets = [
  { key: 'subtitles', labelKey: 'tasks.exportPresetSubtitles', formats: ['srt', 'vtt', 'ass'] },
  { key: 'text', labelKey: 'tasks.exportPresetText', formats: ['txt', 'md'] },
  { key: 'debug', labelKey: 'tasks.exportPresetDebug', formats: ['json', 'txt'] },
] as const;

interface RecentExport {
  taskId: string;
  filename: string;
  format: string;
  createdAt: string;
}

export function TasksPage() {
  const queryClient = useQueryClient();
  const { t, statusLabel } = useI18n();
  const toast = useToast();
  const [taskSearchQuery, setTaskSearchQuery] = useState('');
  const [statusFilters, setStatusFilters] = useState<TaskStatus[]>([]);
  const [modelFilters, setModelFilters] = useState<string[]>([]);
  const [providerFilters, setProviderFilters] = useState<string[]>([]);
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');
  const [errorFilter, setErrorFilter] = useState<ErrorFilter>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [detailTab, setDetailTab] = useState<'timeline' | 'transcript'>('timeline');
  const [timelineTab, setTimelineTab] = useState<TaskTimelineTab>('diagnostics');
  const [taskTagsById, setTaskTagsById] = useState<Record<string, string[]>>({});
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<string[]>([]);
  const [taskNotesById, setTaskNotesById] = useState<Record<string, string>>({});
  const [taskCollectionsById, setTaskCollectionsById] = useState<Record<string, string>>({});
  const [collectionFilter, setCollectionFilter] = useState('all');
  const [newCollectionName, setNewCollectionName] = useState('');
  const [recentExports, setRecentExports] = useState<RecentExport[]>([]);
  const [batchBusy, setBatchBusy] = useState(false);
  const tasksQuery = useTasksQuery();
  const activeTasksQuery = useActiveTasksQuery();
  const tasks = tasksQuery.data?.items ?? [];

  const collections = useMemo(
    () => Array.from(new Set(Object.values(taskCollectionsById).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [taskCollectionsById],
  );
  const modelOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.model_name).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );
  const providerOptions = useMemo(
    () => Array.from(new Set(tasks.map((task) => task.provider_id ?? task.source).filter(Boolean))).sort((a, b) => a.localeCompare(b)),
    [tasks],
  );
  const filteredTasks = useMemo(() => {
    const now = Date.now();
    const searchNeedle = taskSearchQuery.trim().toLowerCase();
    return tasks.filter((task) => {
      if (searchNeedle) {
        const haystack = [
          task.filename,
          task.text,
          task.id,
          task.model_name,
          task.provider_id,
          task.source,
          task.error,
          task.error_code,
          taskCollectionsById[task.id],
          taskNotesById[task.id],
          ...(taskTagsById[task.id] ?? []),
        ].join(' ').toLowerCase();
        if (!haystack.includes(searchNeedle)) return false;
      }
      if (statusFilters.length > 0 && !statusFilters.includes(task.status)) return false;
      if (collectionFilter === 'none' && taskCollectionsById[task.id]) return false;
      if (collectionFilter !== 'all' && collectionFilter !== 'none' && taskCollectionsById[task.id] !== collectionFilter) return false;
      if (modelFilters.length > 0 && (!task.model_name || !modelFilters.includes(task.model_name))) return false;
      const provider = task.provider_id ?? task.source;
      if (providerFilters.length > 0 && !providerFilters.includes(provider)) return false;
      const hasError = Boolean(task.error || task.error_code);
      if (errorFilter === 'with' && !hasError) return false;
      if (errorFilter === 'without' && hasError) return false;
      if (dateFilter !== 'all') {
        const updatedAt = new Date(task.updated_at).getTime();
        const ageDays = (now - updatedAt) / 86_400_000;
        if (dateFilter === 'today' && ageDays >= 1) return false;
        if (dateFilter === '7d' && ageDays > 7) return false;
        if (dateFilter === '30d' && ageDays > 30) return false;
      }
      return true;
    });
  }, [collectionFilter, dateFilter, errorFilter, modelFilters, providerFilters, statusFilters, taskCollectionsById, taskNotesById, taskSearchQuery, taskTagsById, tasks]);
  const selectedTask = tasks.find((task) => task.id === selectedTaskId) ?? filteredTasks[0] ?? tasks[0];
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id)),
    [selectedTaskIds, tasks],
  );
  const selectedCompletedTasks = selectedTasks.filter((task) => task.status === 'completed');
  const selectedExportFormats = Array.from(new Set(selectedCompletedTasks.flatMap((task) => getTaskOutputFormats(task)))).slice(0, 6);
  const selectedRecentExports = selectedTask ? recentExports.filter((item) => item.taskId === selectedTask.id).slice(0, 5) : [];
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
  const qualityQuery = useQuery({
    queryKey: selectedTask ? queryKeys.taskQuality(selectedTask.id) : ['tasks', 'empty', 'quality'],
    queryFn: () => apiClient.getTaskQuality(selectedTask!.id),
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

  useEffect(() => {
    if (selectedTaskId) localStorage.setItem(lastTaskStorageKey, selectedTaskId);
  }, [selectedTaskId]);

  useEffect(() => {
    if (selectedTaskId || tasks.length === 0) return;
    const lastTaskId = localStorage.getItem(lastTaskStorageKey);
    if (lastTaskId && tasks.some((task) => task.id === lastTaskId)) setSelectedTaskId(lastTaskId);
  }, [selectedTaskId, tasks]);

  const toggleTaskSelection = (taskId: string) => {
    setSelectedTaskIds((current) => (
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    ));
  };

  const toggleListValue = (values: string[], value: string) => (
    values.includes(value) ? values.filter((item) => item !== value) : [...values, value]
  );

  const toggleStatusFilter = (item: 'all' | TaskStatus) => {
    if (item === 'all') {
      setStatusFilters([]);
      return;
    }
    setStatusFilters((current) => toggleListValue(current, item) as TaskStatus[]);
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
      recordRecentExport(task, format);
    });
    toast.info(t('tasks.batchExportStarted'), `${selectedCompletedTasks.length} ${t('tasks.batchItems')} · ${format.toUpperCase()}`);
  };

  const recordRecentExport = (task: TranscriptionTask, format: string) => {
    setRecentExports((current) => [
      { taskId: task.id, filename: task.filename, format, createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 20));
  };

  const downloadTaskFormat = async (task: TranscriptionTask, format: string) => {
    const response = await fetch(apiClient.exportTaskUrl(task.id, format));
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const blobUrl = URL.createObjectURL(await response.blob());
    try {
      const link = document.createElement('a');
      link.href = blobUrl;
      link.rel = 'noopener noreferrer';
      link.download = `${task.filename}.${format}`;
      link.click();
      recordRecentExport(task, format);
    } finally {
      window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    }
  };

  const exportTaskFormats = async (task: TranscriptionTask, formats: readonly string[], label: string) => {
    try {
      await Promise.all(formats.map((format) => downloadTaskFormat(task, format)));
      toast.info(t('tasks.exportPresetStarted'), label);
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const copyTaskText = async (task: TranscriptionTask) => {
    try {
      await navigator.clipboard.writeText(task.text ?? '');
      toast.success(t('toast.copied'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const setTaskTags = (taskId: string, value: string) => {
    const tags = value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean);
    setTaskTagsById((current) => ({ ...current, [taskId]: Array.from(new Set(tags)) }));
  };

  const toggleFavorite = (taskId: string) => {
    setFavoriteTaskIds((current) => (
      current.includes(taskId) ? current.filter((id) => id !== taskId) : [...current, taskId]
    ));
  };

  const assignTaskCollection = (taskId: string, value: string) => {
    setTaskCollectionsById((current) => {
      const next = { ...current };
      if (value === 'none') {
        delete next[taskId];
      } else {
        next[taskId] = value;
      }
      return next;
    });
  };

  const createCollectionForTask = (taskId: string) => {
    const name = newCollectionName.trim();
    if (!name) return;
    assignTaskCollection(taskId, name);
    setCollectionFilter(name);
    setNewCollectionName('');
  };

  return (
    <section className="grid gap-4 pb-28 xl:grid-cols-[380px_minmax(0,1fr)] xl:pb-0">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('tasks.eyebrow')}
          title={t('tasks.title')}
          description={`${tasks.length} ${t('tasks.description')} · ${getActiveTaskItems(activeTasksQuery.data).length} ${t('tasks.active')}`}
          action={
            <div className="hidden gap-2 xl:hidden 2xl:flex">
              {statuses.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={(item === 'all' ? statusFilters.length === 0 : statusFilters.includes(item)) ? 'primary' : 'secondary'}
                  onClick={() => toggleStatusFilter(item)}
                >
                  {statusLabel(item)}
                </Button>
              ))}
            </div>
          }
        />
        <div className="grid gap-3 p-4">
          {tasksQuery.error && <ErrorState title={t('common.unableToLoad')} error={tasksQuery.error} />}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
            <Input
              value={taskSearchQuery}
              onChange={(event) => setTaskSearchQuery(event.target.value)}
              placeholder={t('search.placeholder')}
              className="pl-9"
            />
          </div>
          <div className="grid gap-3 rounded-xl border app-control p-3">
            <div className="flex flex-wrap gap-2 2xl:hidden">
              {statuses.map((item) => (
                <Button
                  key={item}
                  size="sm"
                  variant={(item === 'all' ? statusFilters.length === 0 : statusFilters.includes(item)) ? 'primary' : 'secondary'}
                  onClick={() => toggleStatusFilter(item)}
                >
                  {statusLabel(item)}
                </Button>
              ))}
            </div>
            <div className="grid gap-2">
              <label className="grid gap-2 text-xs font-medium text-app-muted">
                {t('tasks.collectionFilter')}
                <Select
                  value={collectionFilter}
                  onValueChange={setCollectionFilter}
                  options={[
                    { value: 'all', label: t('tasks.allCollections') },
                    { value: 'none', label: t('tasks.noCollection') },
                    ...collections.map((collection) => ({ value: collection, label: collection })),
                  ]}
                />
              </label>
              <label className="grid gap-2 text-xs font-medium text-app-muted">
                {t('tasks.dateFilter')}
                <Select
                  value={dateFilter}
                  onValueChange={(value) => setDateFilter(value as DateFilter)}
                  options={[
                    { value: 'all', label: t('tasks.dateAll') },
                    { value: 'today', label: t('tasks.dateToday') },
                    { value: '7d', label: t('tasks.dateLast7') },
                    { value: '30d', label: t('tasks.dateLast30') },
                  ]}
                />
              </label>
              <label className="grid gap-2 text-xs font-medium text-app-muted">
                {t('tasks.errorFilter')}
                <Select
                  value={errorFilter}
                  onValueChange={(value) => setErrorFilter(value as ErrorFilter)}
                  options={[
                    { value: 'all', label: t('tasks.errorAll') },
                    { value: 'with', label: t('tasks.withErrors') },
                    { value: 'without', label: t('tasks.withoutErrors') },
                  ]}
                />
              </label>
            </div>
            {modelOptions.length > 0 && (
              <FilterCheckboxGroup
                title={t('tasks.modelFilter')}
                options={modelOptions}
                values={modelFilters}
                onToggle={(value) => setModelFilters((current) => toggleListValue(current, value))}
              />
            )}
            {providerOptions.length > 0 && (
              <FilterCheckboxGroup
                title={t('tasks.platformFilter')}
                options={providerOptions}
                values={providerFilters}
                onToggle={(value) => setProviderFilters((current) => toggleListValue(current, value))}
              />
            )}
          </div>
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
          <div className="grid max-h-[calc(100dvh-420px)] min-h-64 gap-2 overflow-auto pr-1">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedTask?.id === task.id}
                checked={selectedTaskIds.includes(task.id)}
                favorited={favoriteTaskIds.includes(task.id)}
                collection={taskCollectionsById[task.id]}
                onToggle={() => toggleTaskSelection(task.id)}
                onSelect={() => setSelectedTaskId(task.id)}
              />
            ))}
            {filteredTasks.length === 0 && (
              <div className="flex items-start gap-3 rounded-lg border app-control px-3 py-3">
                <div className="grid size-10 shrink-0 place-items-center rounded-xl border app-control text-app-accent">
                  <FileAudio className="size-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-sm font-semibold text-app">{t('tasks.noMatching')}</h3>
                  <p className="mt-1 text-sm leading-6 text-app-muted">{t('tasks.noMatchingBody')}</p>
                </div>
                <div className="shrink-0">
                  <Button asChild size="sm">
                    <Link to="/">{t('transcribe.start')}</Link>
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Panel>

      <div className="grid min-w-0 content-start gap-4">
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
              <div className="grid gap-2 rounded-xl border app-control p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-app">{t('tasks.tags')}</h3>
                  <span className="text-xs text-app-muted">{t('tasks.tagsHint')}</span>
                </div>
                <Input
                  value={(taskTagsById[selectedTask.id] ?? []).join(', ')}
                  onChange={(event) => setTaskTags(selectedTask.id, event.target.value)}
                  placeholder={t('tasks.tagsPlaceholder')}
                />
                <div className="flex min-h-6 flex-wrap gap-2">
                  {(taskTagsById[selectedTask.id] ?? []).length > 0 ? (
                    taskTagsById[selectedTask.id].map((tag) => <Badge key={tag} tone="accent">{tag}</Badge>)
                  ) : (
                    <span className="text-xs text-app-muted">{t('tasks.noTags')}</span>
                  )}
                </div>
              </div>
              <div className="grid gap-2 rounded-xl border app-control p-3">
                <h3 className="text-sm font-semibold text-app">{t('tasks.notes')}</h3>
                <Textarea
                  value={taskNotesById[selectedTask.id] ?? ''}
                  onChange={(event) => setTaskNotesById((current) => ({ ...current, [selectedTask.id]: event.target.value }))}
                  placeholder={t('tasks.notesPlaceholder')}
                  className="min-h-24"
                />
              </div>
              <div className="grid gap-3 rounded-xl border app-control p-3">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="text-sm font-semibold text-app">{t('tasks.collection')}</h3>
                  <span className="text-xs text-app-muted">{t('tasks.collectionHint')}</span>
                </div>
                <Select
                  value={taskCollectionsById[selectedTask.id] ?? 'none'}
                  onValueChange={(value) => assignTaskCollection(selectedTask.id, value)}
                  options={[
                    { value: 'none', label: t('tasks.noCollection') },
                    ...collections.map((collection) => ({ value: collection, label: collection })),
                  ]}
                />
                <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
                  <Input
                    value={newCollectionName}
                    onChange={(event) => setNewCollectionName(event.target.value)}
                    placeholder={t('tasks.collectionPlaceholder')}
                  />
                  <Button size="sm" variant="secondary" onClick={() => createCollectionForTask(selectedTask.id)}>
                    <Folder className="size-4" />
                    {t('tasks.createCollection')}
                  </Button>
                </div>
              </div>
              {selectedTask.error && <ErrorState title={selectedTask.error_code ?? 'Task error'} error={selectedTask.error} />}
              {(selectedTask.error || selectedTask.status === 'failed' || selectedTask.status === 'failed_resumable') && (
                <ErrorDiagnosticsPanel
                  task={selectedTask}
                  diagnostics={diagnosticsQuery.data ?? []}
                  logs={logsQuery.data ?? []}
                  onRetry={() => retry.mutate(selectedTask.id)}
                  onRetryChunks={() => retryChunks.mutate(selectedTask.id)}
                />
              )}
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
                      <Button
                        key={format}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          downloadTaskFormat(selectedTask, format)
                            .then(() => toast.info(t('toast.downloadStarted'), format.toUpperCase()))
                            .catch((error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)));
                        }}
                      >
                        <Download className="size-4" />
                        {format.toUpperCase()}
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
                  <div className="flex flex-wrap gap-2 border-t app-border pt-3">
                    {exportPresets.map((preset) => (
                      <Button
                        key={preset.key}
                        size="sm"
                        variant="secondary"
                        onClick={() => exportTaskFormats(selectedTask, preset.formats, t(preset.labelKey))}
                      >
                        <Download className="size-4" />
                        {t(preset.labelKey)}
                      </Button>
                    ))}
                  </div>
                </div>
              )}
              <div className="grid gap-2 rounded-xl border app-control p-3">
                <h3 className="text-sm font-semibold text-app">{t('tasks.recentExports')}</h3>
                {selectedRecentExports.length > 0 ? (
                  <div className="grid gap-2">
                    {selectedRecentExports.map((item, index) => (
                      <div key={`${item.taskId}-${item.format}-${item.createdAt}-${index}`} className="flex items-center justify-between gap-3 rounded-lg border app-border px-3 py-2 text-xs">
                        <span className="truncate text-app">{item.filename}.{item.format}</span>
                        <span className="shrink-0 text-app-muted">{formatDate(item.createdAt)}</span>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-app-muted">{t('tasks.noRecentExports')}</p>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant={favoriteTaskIds.includes(selectedTask.id) ? 'primary' : 'secondary'}
                  onClick={() => toggleFavorite(selectedTask.id)}
                >
                  <Star className={cn('size-4', favoriteTaskIds.includes(selectedTask.id) && 'fill-current')} />
                  {favoriteTaskIds.includes(selectedTask.id) ? t('tasks.unfavorite') : t('tasks.favorite')}
                </Button>
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
                    quality={qualityQuery.data}
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
