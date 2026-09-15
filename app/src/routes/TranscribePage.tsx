import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, Circle, DownloadCloud, FileAudio, Files, Loader2, Play, PlugZap, RefreshCw, Settings, ShieldAlert, Square, Trash2 } from 'lucide-react';
import { apiClient, type TranscriptionPreflight } from '../lib/api';
import { queryKeys, useModelsQuery, useProvidersQuery, useReadinessQuery, useSettingsQuery, useTasksQuery } from '../lib/queries';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, ErrorState, Field, Panel, PanelHeader, Progress, Select, Tooltip, TooltipContent, TooltipTrigger } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { StatusPill } from '../components/StatusPill';
import { ConfirmAction } from '../components/ConfirmAction';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import {
  backendLanguage,
  languageOptions,
  normalizeLanguageValue,
  postprocessOptions,
  type TranscriptionLanguage,
} from '../lib/transcriptionOptions';
import { useDesktopServerControl } from '../lib/useDesktopServerControl';
import { desktopCapabilities, type DesktopMediaFile } from '../lib/desktopCapabilities';
import { modelDeviceSummaryKey } from '../lib/modelDevices';
import { downloadResponse } from '../lib/downloads';

const formats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];
const activeTaskStatuses = new Set(['queued', 'importing', 'preprocessing', 'waiting_model', 'downloading_model', 'transcribing', 'postprocessing', 'exporting']);
const MEDIA_PATH_PATTERN = /\.(aac|aif|aiff|flac|m4a|mkv|mov|mp3|mp4|ogg|opus|wav|webm|wma)$/i;

export function TranscribePage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const toast = useToast();
  const desktopServer = useDesktopServerControl();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const defaultsDirtyRef = useRef({ backend: false, model: false, provider: false, language: false });
  const [files, setFiles] = useState<File[]>([]);
  const [desktopFiles, setDesktopFiles] = useState<DesktopMediaFile[]>([]);
  const [uploadProgress, setUploadProgress] = useState<number | null>(null);
  const [backend, setBackend] = useState('local');
  const [modelName, setModelName] = useState('whisper-base');
  const [providerId, setProviderId] = useState('');
  const [language, setLanguage] = useState<TranscriptionLanguage>('zh-Hans');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [audioPlayerHost, setAudioPlayerHost] = useState<HTMLElement | null>(null);
  const [preflight, setPreflight] = useState<TranscriptionPreflight | null>(null);
  const [dragActive, setDragActive] = useState(false);

  const readinessQuery = useReadinessQuery();
  const settingsQuery = useSettingsQuery();
  const tasksQuery = useTasksQuery();
  const modelsQuery = useModelsQuery();
  const providersQuery = useProvidersQuery();
  const tasks = tasksQuery.data?.items ?? [];
  const models = modelsQuery.data?.models ?? [];
  const providers = providersQuery.data?.items ?? [];
  const recentTasks = tasks.slice(0, 5);
  const selectedFileCount = desktopFiles.length || files.length;
  const selectedFilename = desktopFiles[0]?.name ?? files[0]?.name;
  const selectedModel = models.find((model) => model.model_name === modelName);
  const selectedModelIncompatible = backend === 'local' && selectedModel?.compatible === false;

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    // Desktop: native drag events carry real file paths, so dropped media follows
    // the same path ingestion (reference/copy) as the picker. Browsers keep HTML5 drop.
    if (!desktopCapabilities.canPickMediaFiles) return;
    return desktopCapabilities.listenMediaFileDrop({
      onActiveChange: setDragActive,
      onDrop: (paths) => {
        const selected = paths
          .filter((path) => MEDIA_PATH_PATTERN.test(path))
          .map((path) => ({ path, name: path.split(/[\\/]/).pop() ?? path, size: 0 }));
        if (selected.length > 0) {
          setDesktopFiles(selected);
          setFiles([]);
          setPreflight(null);
        }
      },
    });
  }, []);

  useEffect(() => {
    const settings = settingsQuery.data;
    if (!settings) return;
    const dirty = defaultsDirtyRef.current;
    if (!dirty.backend) setBackend(settings.default_backend === 'provider' ? 'provider' : 'local');
    if (!dirty.model && settings.default_backend !== 'provider' && settings.default_model_name) setModelName(settings.default_model_name);
    if (!dirty.provider && settings.default_backend === 'provider' && settings.default_provider_id) setProviderId(settings.default_provider_id);
    if (!dirty.language) setLanguage(normalizeLanguageValue(settings.default_language));
  }, [settingsQuery.data]);

  useEffect(() => {
    const firstDownloaded = models.find((model) => model.downloaded && model.compatible !== false)?.model_name ?? models.find((model) => model.compatible !== false)?.model_name;
    const current = models.find((model) => model.model_name === modelName);
    if (firstDownloaded && (!current || current.compatible === false)) setModelName(firstDownloaded);
  }, [modelName, models]);

  useEffect(() => {
    const firstProvider = providers.find((provider) => provider.enabled)?.id ?? providers[0]?.id ?? '';
    if (!providerId && firstProvider) setProviderId(firstProvider);
  }, [providerId, providers]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0],
    [selectedTaskId, tasks],
  );

  const refreshTasks = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeTasks });
  };

  const selectFiles = (nextFiles: File[]) => {
    setFiles(nextFiles);
    setDesktopFiles([]);
    setPreflight(null);
  };

  const chooseMediaFiles = async () => {
    if (!desktopCapabilities.canPickMediaFiles) {
      fileInputRef.current?.click();
      return;
    }
    try {
      const selected = await desktopCapabilities.pickMediaFiles();
      if (selected.length > 0) {
        setDesktopFiles(selected);
        setFiles([]);
        setPreflight(null);
      }
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const droppedMediaFiles = (fileList: FileList) => Array.from(fileList).filter((file) => {
    if (file.type.startsWith('audio/') || file.type.startsWith('video/')) return true;
    return MEDIA_PATH_PATTERN.test(file.name);
  });

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (desktopFiles[0]) return apiClient.preflightPath(desktopFiles[0].path);
      if (!files[0]) throw new Error(t('transcribe.chooseFirst'));
      setUploadProgress(0);
      return apiClient.preflightTranscription(files[0], setUploadProgress);
    },
    onSuccess: (result) => {
      setPreflight(result);
      toast.success(t('toast.preflightComplete'), result.filename);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    onSettled: () => setUploadProgress(null),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (selectedFileCount === 0) throw new Error(t('transcribe.chooseAtLeastOne'));
      if (selectedModelIncompatible) throw new Error(selectedModel?.compatibility_error || t('common.incompatible'));
      if (preflight && (!preflight.supported_format || !preflight.has_audio_stream)) throw new Error(preflight.warnings[0] || t('transcribe.unsupported'));
      const payload = {
        backend,
        modelName: backend === 'local' ? modelName : undefined,
        providerId: backend === 'provider' ? providerId : undefined,
        language: backendLanguage(language),
        outputFormats: formats,
        ...postprocessOptions(language),
      };
      if (desktopFiles.length > 0) {
        return apiClient.createPathTranscriptions({ paths: desktopFiles.map((file) => file.path), ...payload });
      }
      setUploadProgress(0);
      if (files.length === 1) return apiClient.createTranscription({ file: files[0], ...payload, onUploadProgress: setUploadProgress });
      return apiClient.createBatchTranscription({ files, ...payload, onUploadProgress: setUploadProgress });
    },
    onSuccess: (result) => {
      const task = 'id' in result ? result : result.items?.[0] ?? result.tasks?.[0];
      if (task) setSelectedTaskId(task.id);
      refreshTasks();
      toast.success(t('toast.transcriptionStarted'), selectedFileCount > 1 ? `${selectedFileCount} ${t('transcribe.filesSelected')}` : selectedFilename);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    onSettled: () => setUploadProgress(null),
  });

  const clearTasksMutation = useMutation({
    mutationFn: () => apiClient.clearTasks(),
    onSuccess: (result) => {
      setSelectedTaskId(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.activeTasks });
      toast.success(t('toast.tasksCleared'), `${result.deleted} ${t('tasks.batchItems')}`);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const cancelTaskMutation = useMutation({
    mutationFn: (taskId: string) => apiClient.cancelTask(taskId),
    onSuccess: (task) => {
      refreshTasks();
      toast.success(t('toast.taskCancelled'), task.filename);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const selectedTaskIsActive = Boolean(selectedTask && activeTaskStatuses.has(selectedTask.status));
  const downloadQuickResult = async (format: 'srt' | 'txt') => {
    if (!selectedTask) return;
    try {
      const response = await apiClient.exportTask(selectedTask.id, format);
      const savedPath = await downloadResponse(response, `${selectedTask.filename}.${format}`, { saveAsText: true });
      if (savedPath) toast.info(t('toast.downloadStarted'), format.toUpperCase());
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const readinessIssues = [
    ...(readinessQuery.data?.issues ?? []),
    ...(readinessQuery.data?.warnings ?? []),
    ...(readinessQuery.data?.missing_models ?? []).map((model) => t('transcribe.missingModel', { model })),
  ];
  const firstRunChecklist = [
    {
      key: 'backend',
      label: t('onboarding.connectBackend'),
      done: readinessQuery.isSuccess,
      action: desktopServer.isDesktop ? (
        <Button variant="ghost" size="sm" onClick={() => desktopServer.startServer()} disabled={desktopServer.isStarting}>
          <PlugZap className="size-4" />
          {desktopServer.isStarting ? t('status.startingBackend') : t('status.startBackend')}
        </Button>
      ) : (
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings" search={{ tab: 'storage' }}>
            <Settings className="size-4" />
            {t('settings.title')}
          </Link>
        </Button>
      ),
    },
    {
      key: 'model',
      label: t('onboarding.downloadModel'),
      done: models.some((model) => model.downloaded),
      action: (
        <Button asChild variant="ghost" size="sm">
          <Link to="/models">
            <DownloadCloud className="size-4" />
            {t('models.title')}
          </Link>
        </Button>
      ),
    },
    {
      key: 'provider',
      label: t('onboarding.addProvider'),
      done: providers.some((provider) => provider.enabled),
      action: (
        <Button asChild variant="ghost" size="sm">
          <Link to="/settings" search={{ tab: 'providers' }}>
            <Settings className="size-4" />
            {t('providers.title')}
          </Link>
        </Button>
      ),
    },
    {
      key: 'file',
      label: t('onboarding.chooseFile'),
      done: selectedFileCount > 0,
      action: (
        <Button variant="ghost" size="sm" onClick={() => void chooseMediaFiles()}>
          <FileAudio className="size-4" />
          {t('transcribe.chooseFile')}
        </Button>
      ),
    },
    { key: 'start', label: t('onboarding.startTranscription'), done: tasks.length > 0 },
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
      <Panel className="flex flex-col overflow-hidden">
        <PanelHeader
          eyebrow="Input"
          title={t('transcribe.title')}
          description={t('transcribe.description')}
          action={
            <Button variant="ghost" size="icon" onClick={() => tasksQuery.refetch()} title={t('common.refresh')} aria-label={t('common.refresh')}>
              <RefreshCw className="size-4" />
            </Button>
          }
        />
        <div className="flex flex-1 flex-col gap-3 p-4 sm:gap-4 sm:p-5">
          <label
            className={cn(
              'grid min-h-28 cursor-pointer place-items-center rounded-xl border border-dashed app-control px-4 py-4 text-center transition hover:border-[color:var(--app-accent)] hover:bg-[var(--app-accent-soft)] sm:min-h-36 sm:py-6',
              dragActive && 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)]',
            )}
            onClick={(event) => {
              if (desktopCapabilities.canPickMediaFiles) {
                event.preventDefault();
                void chooseMediaFiles();
              }
            }}
            onDragEnter={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(true);
            }}
            onDragOver={(event) => {
              event.preventDefault();
              event.stopPropagation();
              event.dataTransfer.dropEffect = 'copy';
              setDragActive(true);
            }}
            onDragLeave={(event) => {
              event.preventDefault();
              event.stopPropagation();
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setDragActive(false);
              }
            }}
            onDrop={(event) => {
              event.preventDefault();
              event.stopPropagation();
              setDragActive(false);
              const nextFiles = droppedMediaFiles(event.dataTransfer.files);
              if (nextFiles.length > 0) selectFiles(nextFiles);
            }}
          >
            <div className="grid justify-items-center gap-3">
              <div className="grid size-10 place-items-center rounded-xl border app-control text-app-accent sm:size-12">
                {selectedFileCount > 1 ? <Files className="size-5" /> : <FileAudio className="size-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-app">
                  {dragActive ? t('transcribe.dropFiles') : selectedFileCount ? `${selectedFileCount} ${t('transcribe.filesSelected')}` : t('transcribe.chooseFile')}
                </p>
                <p className="mt-1 text-xs text-app-muted">{dragActive ? t('transcribe.dropHint') : selectedFilename ?? t('transcribe.fileHint')}</p>
              </div>
            </div>
            <input
              ref={fileInputRef}
              className="sr-only"
              type="file"
              accept="audio/*,video/*"
              multiple
              onChange={(event) => {
                selectFiles(Array.from(event.target.files ?? []));
              }}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <span>
                  <Button
                    variant="secondary"
                    onClick={() => preflightMutation.mutate()}
                    disabled={selectedFileCount === 0 || preflightMutation.isPending}
                    className="w-full"
                    title={selectedFileCount === 0 ? t('transcribe.preflightDisabled') : t('transcribe.preflightHelp')}
                  >
                    <ShieldAlert className="size-4" />
                    {t('transcribe.preflight')}
                  </Button>
                </span>
              </TooltipTrigger>
              <TooltipContent>{selectedFileCount > 0 ? t('transcribe.preflightHelp') : t('transcribe.preflightDisabled')}</TooltipContent>
            </Tooltip>
            <Button onClick={() => createMutation.mutate()} disabled={selectedFileCount === 0 || createMutation.isPending || selectedModelIncompatible}>
              <Play className="size-4" />
              {createMutation.isPending ? t('transcribe.starting') : selectedFileCount > 1 ? t('transcribe.startBatch') : t('transcribe.start')}
            </Button>
          </div>

          {uploadProgress !== null && (
            <div className="grid gap-2 rounded-lg border app-control px-3 py-2">
              <div className="flex items-center justify-between gap-3 text-xs text-app-muted">
                <span>{t('transcribe.uploading')}</span>
                <span>{formatPercent(uploadProgress)}</span>
              </div>
              <Progress value={uploadProgress} />
            </div>
          )}

          {preflight && (
            <div className="grid gap-3 rounded-xl border app-control p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-app">{preflight.filename}</span>
                <Badge tone={preflight.supported_format && preflight.has_audio_stream ? 'success' : 'danger'}>
                  {preflight.supported_format && preflight.has_audio_stream ? t('common.ready') : t('common.blocked')}
                </Badge>
              </div>
              <div className="flex flex-wrap gap-2">
                <Badge>{formatDuration(preflight.duration_ms)}</Badge>
                <Badge tone={preflight.will_chunk ? 'warning' : 'neutral'}>
                  {preflight.will_chunk ? `${preflight.chunk_count} ${t('transcribe.chunks')}` : t('transcribe.singlePass')}
                </Badge>
              </div>
              {preflight.warnings.length > 0 && (
                <div className="grid gap-1">
                  {preflight.warnings.map((warning) => (
                    <p key={warning} className="text-xs text-app-accent">{warning}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {readinessIssues.length > 0 && (
            <div className="grid gap-1 rounded-xl border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
              {readinessIssues.slice(0, 4).map((issue) => <p key={issue} className="text-xs text-app-accent">{issue}</p>)}
            </div>
          )}

          {(preflightMutation.error || createMutation.error) && (
            <ErrorState error={preflightMutation.error ?? createMutation.error} />
          )}

          {tasks.length === 0 && (
            <div className="grid gap-2 rounded-xl border app-control p-3">
              <div>
                <h2 className="text-sm font-semibold text-app">{t('onboarding.title')}</h2>
                <p className="mt-1 text-xs text-app-muted">{t('onboarding.description')}</p>
              </div>
              <div className="grid gap-2">
                {firstRunChecklist.map((item) => {
                  const Icon = item.done ? CheckCircle2 : Circle;
                  return (
                    <div key={item.key} className="flex min-h-9 items-center justify-between gap-3 rounded-lg bg-[var(--app-control)] px-3 py-1.5 sm:py-2">
                      <span className="flex min-w-0 items-center gap-2 text-sm text-app-soft">
                        <Icon className={cn('size-4 shrink-0', item.done ? 'text-[var(--app-success)]' : 'text-app-muted')} />
                        <span className="truncate">{item.label}</span>
                      </span>
                      {item.action && !item.done && <span className="shrink-0">{item.action}</span>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {tasks.length > 0 && <div className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-app">{t('transcribe.recentTasks')}</h2>
              <div className="flex flex-wrap items-center justify-end gap-2">
                {tasks.length > recentTasks.length && (
                  <Button asChild variant="ghost" size="sm">
                    <Link to="/tasks">{t('transcribe.viewAllTasks')}</Link>
                  </Button>
                )}
                {selectedTaskIsActive && selectedTask && (
                  <ConfirmAction
                    title={t('confirm.stopTaskTitle')}
                    description={t('confirm.stopTaskDescription')}
                    confirmLabel={t('common.stop')}
                    onConfirm={() => cancelTaskMutation.mutate(selectedTask.id)}
                  >
                    <Button variant="danger" size="sm" disabled={cancelTaskMutation.isPending}>
                      {cancelTaskMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Square className="size-4" />}
                      {cancelTaskMutation.isPending ? t('transcribe.stopping') : t('common.stop')}
                    </Button>
                  </ConfirmAction>
                )}
                <ConfirmAction
                  title={t('confirm.clearTasksTitle')}
                  description={t('confirm.clearTasksDescription')}
                  confirmLabel={t('tasks.clearAll')}
                  onConfirm={() => clearTasksMutation.mutate()}
                >
                  <Button variant="danger" size="sm" disabled={clearTasksMutation.isPending}>
                    <Trash2 className="size-4" />
                    {t('tasks.clearAll')}
                  </Button>
                </ConfirmAction>
              </div>
            </div>
            <div className="grid max-h-[36vh] min-h-0 flex-1 gap-2 overflow-auto pr-1 xl:max-h-none">
              {recentTasks.map((task) => (
                <button
                  key={task.id}
                  className={cn(
                    'grid gap-2 rounded-xl border px-3 py-3 text-left transition hover:border-[color:var(--app-accent)] hover:bg-[var(--app-accent-soft)]',
                    selectedTask?.id === task.id ? 'border-[color:var(--app-accent)] bg-[var(--app-accent-soft)]' : 'app-control',
                  )}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-app">{task.filename}</span>
                    <StatusPill status={task.status} />
                  </div>
                  <Progress value={task.progress} />
                  <span className="text-xs text-app-muted">{task.model_name ?? task.provider_id ?? task.source} · {formatPercent(task.progress)}</span>
                </button>
              ))}
            </div>
          </div>}
        </div>
      </Panel>

      <TranscriptViewer
        task={selectedTask}
        mode="summary"
        audioPlayerHost={audioPlayerHost}
        onDownloadFormat={(format) => void downloadQuickResult(format)}
      />

      <div className="grid content-start gap-4">
        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('transcribe.engine')} title={t('transcribe.runOptions')} description={t('transcribe.runDescription')} />
          <div className="grid gap-4 p-5">
            <Field label={t('transcribe.backend')}>
              <Select
                value={backend}
                onValueChange={(value) => {
                  defaultsDirtyRef.current.backend = true;
                  setBackend(value);
                }}
                options={[
                  { value: 'local', label: t('transcribe.localModel') },
                  { value: 'provider', label: t('transcribe.providerBackend') },
                ]}
              />
            </Field>
            {backend === 'local' ? (
              <Field label={t('transcribe.model')} hint={t('models.deviceSupportHint')}>
                <Select
                  value={modelName}
                  onValueChange={(value) => {
                    defaultsDirtyRef.current.model = true;
                    setModelName(value);
                  }}
                  options={(models.length ? models : [{ model_name: modelName, display_name: modelName, supported_devices: [] }]).map((model) => ({
                    value: model.model_name,
                    label: `${model.display_name} · ${t(modelDeviceSummaryKey(model.supported_devices))}${'downloaded' in model && model.downloaded === false ? ` · ${t('transcribe.notDownloaded')}` : ''}${'compatible' in model && model.compatible === false ? ` · ${t('common.incompatible')}` : ''}`,
                    disabled: 'compatible' in model && model.compatible === false,
                  }))}
                />
              </Field>
            ) : (
              <Field label={t('transcribe.provider')}>
                <Select
                  value={providerId || 'none'}
                  onValueChange={(value) => {
                    defaultsDirtyRef.current.provider = true;
                    setProviderId(value === 'none' ? '' : value);
                  }}
                  options={(providers.length ? providers : [{ id: 'none', name: t('transcribe.noProviders'), enabled: false }]).map((provider) => ({
                    value: provider.id,
                    label: provider.name,
                    disabled: provider.id === 'none',
                  }))}
                />
              </Field>
            )}
            <Field label={t('transcribe.language')} hint={t('transcribe.languageHint')}>
              <Select
                value={language}
                onValueChange={(value) => {
                  defaultsDirtyRef.current.language = true;
                  setLanguage(normalizeLanguageValue(value));
                }}
                options={languageOptions(locale)}
              />
            </Field>
          </div>
        </Panel>
        <div ref={setAudioPlayerHost} className="app-panel sticky top-4 rounded-xl border p-5 empty:hidden" />
      </div>
    </section>
  );
}
