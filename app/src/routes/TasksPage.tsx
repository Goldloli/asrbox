import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { ArchiveX, BrainCircuit, CheckSquare, Clipboard, Download, FileAudio, Filter, Folder, FolderOpen, History, RotateCcw, Scissors, Search, Square, Star, Trash2, Wand2, X } from 'lucide-react';
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
import { ErrorDiagnosticsPanel, FilterCheckboxGroup, Metric, TaskRow, useTaskMutation } from '../components/tasks/TaskWorkbenchParts';
import { desktopCapabilities } from '../lib/desktopCapabilities';
import { downloadResponse } from '../lib/downloads';
import { isApproximateTimelineModel } from '../lib/modelCatalog';

const statuses: Array<'all' | TaskStatus> = ['all', 'queued', 'importing', 'transcribing', 'completed', 'failed', 'failed_resumable', 'cancelled'];
type DateFilter = 'all' | 'today' | '7d' | '30d';
type ErrorFilter = 'all' | 'with' | 'without';
const outputFileFormats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

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
  const [clearingTasks, setClearingTasks] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [selectionMode, setSelectionMode] = useState(false);
  const search = useSearch({ strict: false }) as { task?: string };
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
  const selectedTask = selectedTaskId ? tasks.find((task) => task.id === selectedTaskId) : undefined;
  const selectedTasks = useMemo(
    () => tasks.filter((task) => selectedTaskIds.includes(task.id)),
    [selectedTaskIds, tasks],
  );
  const selectedCompletedTasks = selectedTasks.filter((task) => task.status === 'completed');
  const selectedRecentExports = selectedTask ? recentExports.filter((item) => item.taskId === selectedTask.id).slice(0, 5) : [];
  const allFilteredSelected = filteredTasks.length > 0 && filteredTasks.every((task) => selectedTaskIds.includes(task.id));
  const activeTaskCount = getActiveTaskItems(activeTasksQuery.data).length;
  const activeFilterCount =
    statusFilters.length +
    modelFilters.length +
    providerFilters.length +
    (dateFilter !== 'all' ? 1 : 0) +
    (errorFilter !== 'all' ? 1 : 0) +
    (collectionFilter !== 'all' ? 1 : 0);

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
    if (selectedTaskId && !tasks.some((task) => task.id === selectedTaskId)) setSelectedTaskId(null);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    if (search.task && tasks.some((task) => task.id === search.task)) setSelectedTaskId(search.task);
  }, [search.task, tasks]);

  const clearAllTasks = async () => {
    setClearingTasks(true);
    try {
      const result = await apiClient.clearTasks();
      setSelectedTaskId(null);
      setSelectedTaskIds([]);
      refresh();
      toast.success(t('toast.tasksCleared'), `${result.deleted} ${t('tasks.batchItems')}`);
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    } finally {
      setClearingTasks(false);
    }
  };

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

  const exportSelectedTasks = async (format: string) => {
    try {
      const saved = await Promise.all(selectedCompletedTasks.map((task) => downloadTaskFormat(task, format)));
      const savedCount = saved.filter(Boolean).length;
      if (savedCount > 0) toast.info(t('tasks.batchExportStarted'), `${savedCount} ${t('tasks.batchItems')} · ${format.toUpperCase()}`);
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const recordRecentExport = (task: TranscriptionTask, format: string) => {
    setRecentExports((current) => [
      { taskId: task.id, filename: task.filename, format, createdAt: new Date().toISOString() },
      ...current,
    ].slice(0, 20));
  };

  const downloadTaskFormat = async (task: TranscriptionTask, format: string) => {
    const response = await apiClient.exportTask(task.id, format);
    const savedPath = await downloadResponse(response, `${task.filename}.${format}`, { saveAsText: true });
    if (!savedPath) return false;
    recordRecentExport(task, format);
    return true;
  };

  const clearFilters = () => {
    setStatusFilters([]);
    setCollectionFilter('all');
    setDateFilter('all');
    setErrorFilter('all');
    setModelFilters([]);
    setProviderFilters([]);
  };

  const toggleSelectionMode = () => {
    setSelectionMode((current) => {
      const next = !current;
      if (!next) setSelectedTaskIds([]);
      return next;
    });
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
    <section className="mx-auto grid max-w-5xl gap-4 pb-28 xl:pb-0">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('tasks.eyebrow')}
          title={t('tasks.title')}
          description={t('tasks.listOnlyDescription')}
          action={
            <div className="flex flex-wrap justify-end gap-2">
              <Button size="sm" variant={showFilters ? 'primary' : 'secondary'} onClick={() => setShowFilters((current) => !current)}>
                <Filter className="size-4" />
                {activeFilterCount > 0 ? `${t('tasks.filters')} ${activeFilterCount}` : t('tasks.filters')}
              </Button>
              <Button size="sm" variant={selectionMode ? 'primary' : 'secondary'} onClick={toggleSelectionMode}>
                <CheckSquare className="size-4" />
                {selectionMode ? t('common.cancel') : t('tasks.selectMode')}
              </Button>
              <ConfirmAction
                title={t('confirm.clearTasksTitle')}
                description={t('confirm.clearTasksDescription')}
                confirmLabel={t('tasks.clearAll')}
                onConfirm={clearAllTasks}
              >
                <Button size="sm" variant="danger" disabled={tasks.length === 0 || clearingTasks}>
                  <Trash2 className="size-4" />
                  {t('tasks.clearAll')}
                </Button>
              </ConfirmAction>
            </div>
          }
        />
        <div className="grid gap-3 p-4">
          {tasksQuery.error && <ErrorState title={t('common.unableToLoad')} error={tasksQuery.error} />}
          <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
              <Input
                value={taskSearchQuery}
                onChange={(event) => setTaskSearchQuery(event.target.value)}
                placeholder={t('search.placeholder')}
                className="pl-9"
              />
            </div>
            <div className="flex flex-wrap gap-2 text-xs text-app-muted">
              <Badge>{tasks.length} {t('tasks.description')}</Badge>
              <Badge tone={activeTaskCount > 0 ? 'warning' : 'neutral'}>{activeTaskCount} {t('tasks.active')}</Badge>
              <Badge>{filteredTasks.length} {t('tasks.filtered')}</Badge>
            </div>
          </div>

          {showFilters && (
            <div className="grid gap-3 rounded-xl border app-control p-3">
              <div className="flex items-center justify-between gap-3">
                <h2 className="text-sm font-semibold text-app">{t('tasks.filters')}</h2>
                <Button size="sm" variant="ghost" onClick={clearFilters} disabled={activeFilterCount === 0}>
                  <X className="size-4" />
                  {t('tasks.clearFilters')}
                </Button>
              </div>
              <div className="flex flex-wrap gap-2">
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
              <div className="grid gap-2 md:grid-cols-3">
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
          )}

          {selectionMode && filteredTasks.length > 0 && (
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
                {outputFileFormats.map((format) => (
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

          <div className="grid max-h-[calc(100dvh-260px)] min-h-80 gap-2 overflow-auto pr-1">
            {filteredTasks.map((task) => (
              <TaskRow
                key={task.id}
                task={task}
                selected={selectedTask?.id === task.id}
                checked={selectedTaskIds.includes(task.id)}
                favorited={favoriteTaskIds.includes(task.id)}
                collection={taskCollectionsById[task.id]}
                selectionMode={selectionMode}
                onToggle={() => toggleTaskSelection(task.id)}
                onSelect={() => (selectionMode ? toggleTaskSelection(task.id) : setSelectedTaskId(task.id))}
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

      {selectedTask && (
        <div className="fixed inset-0 z-50">
          <button
            type="button"
            className="absolute inset-0 bg-[var(--app-overlay)]"
            aria-label={t('tasks.closeDetails')}
            onClick={() => setSelectedTaskId(null)}
          />
          <aside className="absolute inset-y-0 right-0 grid w-full max-w-[920px] grid-rows-[auto_minmax(0,1fr)] overflow-hidden border-l app-border bg-[var(--app-panel-solid)] text-app shadow-2xl shadow-[var(--app-shadow)]">
            <header className="flex items-start justify-between gap-4 border-b app-border px-5 py-4">
              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase text-app-accent">{t('tasks.inspector')}</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-app">{selectedTask.filename}</h2>
                <p className="mt-1 text-xs text-app-muted">{selectedTask.id} · {formatDate(selectedTask.updated_at)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <StatusPill status={selectedTask.status} />
                <Button size="icon" variant="ghost" aria-label={t('tasks.closeDetails')} title={t('tasks.closeDetails')} onClick={() => setSelectedTaskId(null)}>
                  <X className="size-4" />
                </Button>
              </div>
            </header>
            <div className="grid content-start gap-4 overflow-auto p-5">
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
              {selectedTask.status === 'completed' && selectedTask.segments.length > 0 && (
                <Button asChild variant="secondary" className="w-fit">
                  <Link to="/ai" search={{ task: selectedTask.id }}>
                    <BrainCircuit className="size-4" />
                    {t('tasks.aiProofreading')}
                  </Link>
                </Button>
              )}
              {selectedTask.status === 'completed' && selectedTask.segments.length > 0 && (
                <Button asChild variant="secondary" className="w-fit">
                  <Link to="/ai" search={{ task: selectedTask.id, mode: 'translation' }}>
                    <BrainCircuit className="size-4" />{t('translation.title')}
                  </Link>
                </Button>
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
                  {isApproximateTimelineModel(selectedTask.model_name) && (
                    <p className="text-xs leading-5 text-app-muted">{t('tasks.approximateTimelineNote')}</p>
                  )}
                  <div className="flex flex-wrap gap-2">
                    {outputFileFormats.map((format) => (
                      <Button
                        key={format}
                        size="sm"
                        variant="secondary"
                        onClick={() => {
                          downloadTaskFormat(selectedTask, format)
                            .then((saved) => {
                              if (saved) toast.info(t('toast.downloadStarted'), format.toUpperCase());
                            })
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
                      disabled={!desktopCapabilities.canOpenFileLocation}
                      title={desktopCapabilities.canOpenFileLocation ? t('tasks.openFileLocation') : t('tasks.openFileLocationUnavailable')}
                      onClick={() => {
                        desktopCapabilities.openFileLocation(selectedTask.normalized_audio_path ?? selectedTask.audio_path)
                          .catch((error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)));
                      }}
                    >
                      <FolderOpen className="size-4" />
                      {t('tasks.openFileLocation')}
                    </Button>
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
              <div className="flex flex-wrap gap-2 rounded-xl border app-control p-3">
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
              <Tabs value={detailTab} onValueChange={(value) => setDetailTab(value as 'timeline' | 'transcript')} className="grid gap-4 rounded-xl border app-control p-3">
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
          </aside>
        </div>
      )}
    </section>
  );
}
