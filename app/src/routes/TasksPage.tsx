import { useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearch } from '@tanstack/react-router';
import { Activity, ArchiveX, BrainCircuit, CheckCircle2, CheckSquare, ChevronDown, Clipboard, Download, FileAudio, Filter, Folder, FolderOpen, History, RotateCcw, Scissors, Search, Square, Star, Trash2, Wand2, X } from 'lucide-react';
import { apiClient, getActiveTaskItems, type TaskStatus, type TranscriptionTask } from '../lib/api';
import { queryKeys, useActiveTasksQuery, useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, DataRow, EmptyState, ErrorState, Input, Panel, Progress, Select, Textarea } from '../components/weiui';
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
const quickActiveStatuses: TaskStatus[] = ['queued', 'importing', 'preprocessing', 'waiting_model', 'downloading_model', 'transcribing', 'postprocessing', 'exporting'];
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
  const quickFilter = statusFilters.length === 0
    ? 'recent'
    : statusFilters.length === 1 && statusFilters[0] === 'completed'
      ? 'completed'
      : statusFilters.length === quickActiveStatuses.length && quickActiveStatuses.every((status) => statusFilters.includes(status))
        ? 'active'
        : 'custom';

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
    if (!selectedTaskId && !selectionMode && tasks[0]) setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, selectionMode, tasks]);

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
    <section className="grid h-full min-h-0 w-full overflow-hidden bg-[var(--app-panel)] pb-20 md:pb-0">
      <div className="grid h-full min-h-0 min-w-0 xl:grid-cols-[232px_minmax(0,1fr)] min-[1680px]:grid-cols-[280px_minmax(0,1fr)]">
      <Panel data-testid="task-center-list" className="flex min-h-0 flex-col overflow-hidden rounded-none border-y-0 border-l-0 shadow-none">
        <div className="grid gap-3.5 border-b app-border px-4 py-5">
          <div className="flex items-center justify-between gap-3">
            <h1 aria-label={t('tasks.title')} data-testid="page-title" className="text-[22px] font-bold tracking-tight text-app">{t('tasks.listTitle')}</h1>
            <div className="flex items-center gap-1">
              <Button size="icon" variant={showFilters ? 'primary' : 'ghost'} onClick={() => setShowFilters((current) => !current)} title={t('tasks.filters')} aria-label={t('tasks.filters')}>
                <Filter className="size-4" />
              </Button>
              <Button size="icon" variant={selectionMode ? 'primary' : 'ghost'} onClick={toggleSelectionMode} title={t('tasks.selectMode')} aria-label={t('tasks.selectMode')}>
                <CheckSquare className="size-4" />
              </Button>
            </div>
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
            <Input
              value={taskSearchQuery}
              onChange={(event) => setTaskSearchQuery(event.target.value)}
              placeholder={t('search.placeholder')}
              className="pl-9"
            />
          </div>
          <div className="grid grid-cols-3 items-end gap-2 text-center text-[13px] font-semibold text-app-muted">
            <button type="button" aria-pressed={quickFilter === 'recent'} className={cn('min-w-0 border-b-2 px-1 pb-2', quickFilter === 'recent' ? 'border-[var(--app-accent)] text-app-accent' : 'border-transparent')} onClick={clearFilters}>{t('transcribe.recentTasks')}</button>
            <button type="button" aria-pressed={quickFilter === 'active'} className={cn('min-w-0 border-b-2 px-1 pb-2', quickFilter === 'active' ? 'border-[var(--app-accent)] text-app-accent' : 'border-transparent')} onClick={() => setStatusFilters(quickActiveStatuses)}>{t('tasks.active')} <span className="rounded bg-[var(--app-control)] px-1">{activeTaskCount}</span></button>
            <button type="button" aria-pressed={quickFilter === 'completed'} className={cn('min-w-0 border-b-2 px-1 pb-2', quickFilter === 'completed' ? 'border-[var(--app-accent)] text-app-accent' : 'border-transparent')} onClick={() => setStatusFilters(['completed'])}>{statusLabel('completed')} <span className="rounded bg-[var(--app-control)] px-1">{tasks.filter((task) => task.status === 'completed').length}</span></button>
          </div>
        </div>
        <div className="flex min-h-0 flex-1 flex-col gap-3 p-3">
          {tasksQuery.error && <ErrorState title={t('common.unableToLoad')} error={tasksQuery.error} />}

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

          <div className="grid min-h-0 flex-1 content-start overflow-auto pr-1">
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

      {selectedTask ? (
        <div className="grid min-h-0 min-w-0 overflow-hidden max-xl:fixed max-xl:inset-0 max-xl:z-50 max-xl:overflow-y-auto max-xl:bg-[var(--app-overlay)] max-xl:p-3 xl:grid-cols-[minmax(0,1fr)_clamp(280px,25vw,340px)]">
          <button
            type="button"
            className="max-xl:fixed max-xl:inset-0 max-xl:-z-10 xl:hidden"
            aria-label={t('tasks.closeDetails')}
            onClick={() => setSelectedTaskId(null)}
          />
          <aside
            data-testid="task-center-detail"
            className="app-panel flex min-h-0 flex-col overflow-hidden border-y-0 border-l-0 app-border rounded-none shadow-none max-xl:min-h-[70vh] max-xl:rounded-xl max-xl:border"
          >
            <header className="z-10 flex min-h-[116px] items-start border-b app-border px-5 py-5 min-[1680px]:px-6">
              <div className="min-w-0">
                <p className="text-sm font-semibold text-app-muted">{t('tasks.currentTask')}</p>
                <h2 className="mt-2 truncate text-[26px] font-bold tracking-tight text-app">{selectedTask.filename}</h2>
                <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-app-muted">
                  <span>{formatDate(selectedTask.updated_at)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{formatDuration(selectedTask.duration_ms)}</span>
                  <span aria-hidden="true">·</span>
                  <span>{selectedTask.model_name ?? selectedTask.provider_id ?? selectedTask.source}</span>
                </p>
              </div>
            </header>
            <div className="grid min-h-0 flex-1 content-start gap-5 overflow-auto px-6 py-5">
              <Progress value={selectedTask.progress} className="h-1.5" />
              {selectedTask.error && <ErrorState title={selectedTask.error_code ?? 'Task error'} error={selectedTask.error} />}
              <TranscriptViewer task={selectedTask} mode="detail" />
            </div>
          </aside>
          <aside
            data-testid="task-center-inspector"
            className="app-panel flex min-h-0 min-w-0 flex-col overflow-hidden border-y-0 border-r-0 app-border rounded-none shadow-none max-xl:min-h-[40vh] max-xl:rounded-xl max-xl:border"
          >
            <div className="flex min-h-[74px] items-center justify-between gap-3 border-b app-border px-5 py-4">
              <h2 className="text-xl font-bold text-app">{t('tasks.inspector')}</h2>
              <StatusPill status={selectedTask.status} />
            </div>
            <div className="grid min-h-0 min-w-0 flex-1 grid-cols-[minmax(0,1fr)] content-start gap-5 overflow-auto p-5 [&>*]:min-w-0">
              <div className="flex items-center gap-3 border-b app-border pb-5">
                <div className={cn('grid size-11 shrink-0 place-items-center rounded-full', selectedTask.status === 'completed' ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]' : 'bg-[var(--app-accent-soft)] text-app-accent')}>
                  {selectedTask.status === 'completed' ? <CheckCircle2 className="size-6" /> : <Activity className="size-6" />}
                </div>
                <div className="min-w-0">
                  <p className="text-sm text-app-muted">{t('tasks.status')}</p>
                  <p className="mt-1 text-lg font-semibold text-app">{statusLabel(selectedTask.status)}</p>
                </div>
              </div>
              <div className="grid gap-1">
                <DataRow label={t('tasks.taskId')} value={<span className="break-all text-right">{selectedTask.id}</span>} />
                <DataRow label={t('tasks.created')} value={formatDate(selectedTask.created_at)} />
                {selectedTask.completed_at && <DataRow label={t('tasks.completedAt')} value={formatDate(selectedTask.completed_at)} />}
                <DataRow label={t('tasks.duration')} value={formatDuration(selectedTask.duration_ms)} />
                <DataRow label={t('tasks.progress')} value={formatPercent(selectedTask.progress)} />
                <DataRow label={t('tasks.language')} value={selectedTask.language ?? '—'} />
                <DataRow label={t('tasks.engine')} value={<span className="break-words text-right">{selectedTask.model_name ?? selectedTask.provider_id ?? selectedTask.source}</span>} />
              </div>
              {selectedTask.status === 'completed' && (
                <div className="grid min-w-0 gap-3 border-t app-border pt-5">
                  <div className="flex min-w-0 flex-wrap items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-app">{t('tasks.outputFiles')}</h3>
                    <Button size="sm" variant="secondary" onClick={() => copyTaskText(selectedTask)} disabled={!selectedTask.text}>
                      <Clipboard className="size-4" />
                      {t('tasks.copyFullText')}
                    </Button>
                  </div>
                  {isApproximateTimelineModel(selectedTask.model_name) && (
                    <p className="text-xs leading-5 text-app-muted">{t('tasks.approximateTimelineNote')}</p>
                  )}
                  <div className="grid gap-2">
                    {(['srt', 'txt'] as const).map((format) => (
                      <Button
                        key={format}
                        variant={format === 'srt' ? 'primary' : 'secondary'}
                        className="h-12 w-full text-[15px]"
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
                      size="md"
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
              {selectedTask.status === 'completed' && selectedTask.segments.length > 0 && (
                <div className="grid gap-2">
                  <Button asChild variant="secondary" className="w-fit">
                    <Link to="/ai" search={{ task: selectedTask.id }}>
                      <BrainCircuit className="size-4" />
                      {t('tasks.aiProofreading')}
                    </Link>
                  </Button>
                  <Button asChild variant="secondary" className="w-fit">
                    <Link to="/ai" search={{ task: selectedTask.id, mode: 'translation' }}>
                      <BrainCircuit className="size-4" />{t('translation.title')}
                    </Link>
                  </Button>
                </div>
              )}
              <details className="group rounded-xl border app-control">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-app focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--app-accent)]/25">
                  <span>{t('tasks.tagsAndNotes')}</span>
                  <ChevronDown className="size-4 shrink-0 text-app-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t app-border p-3">
                  <div className="grid gap-2">
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
                  <div className="grid gap-2">
                    <h3 className="text-sm font-semibold text-app">{t('tasks.notes')}</h3>
                    <Textarea
                      value={taskNotesById[selectedTask.id] ?? ''}
                      onChange={(event) => setTaskNotesById((current) => ({ ...current, [selectedTask.id]: event.target.value }))}
                      placeholder={t('tasks.notesPlaceholder')}
                      className="min-h-24"
                    />
                  </div>
                  <div className="grid gap-2">
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
                </div>
              </details>
              <details className="group rounded-xl border app-control" open={Boolean(selectedTask.error)}>
                <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-3 py-2.5 text-sm font-semibold text-app focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--app-accent)]/25">
                  <span>{t('tasks.timeline')}</span>
                  <ChevronDown className="size-4 shrink-0 text-app-muted transition-transform group-open:rotate-180" />
                </summary>
                <div className="grid gap-3 border-t app-border p-3">
                  {(selectedTask.error || selectedTask.status === 'failed' || selectedTask.status === 'failed_resumable') && (
                    <ErrorDiagnosticsPanel
                      task={selectedTask}
                      diagnostics={diagnosticsQuery.data ?? []}
                      logs={logsQuery.data ?? []}
                      onRetry={() => retry.mutate(selectedTask.id)}
                      onRetryChunks={() => retryChunks.mutate(selectedTask.id)}
                    />
                  )}
                  <TaskTimeline
                    diagnostics={diagnosticsQuery.data}
                    logs={logsQuery.data}
                    versions={versionsQuery.data}
                    quality={qualityQuery.data}
                    currentText={selectedTask.text}
                    value={timelineTab}
                    onValueChange={setTimelineTab}
                  />
                </div>
              </details>
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
              <div className="grid gap-2">
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
            </div>
          </aside>
        </div>
      ) : (
        <Panel className="hidden rounded-none border-y-0 border-r-0 shadow-none xl:grid place-items-center">
          <EmptyState
            title={t('tasks.inspectorEmptyTitle')}
            body={t('tasks.inspectorEmptyBody')}
            icon={<FileAudio className="size-5" />}
          />
        </Panel>
      )}
      </div>
    </section>
  );
}
