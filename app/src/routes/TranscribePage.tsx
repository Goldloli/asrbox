import { useEffect, useMemo, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { CheckCircle2, ChevronDown, Circle, Download, DownloadCloud, FileAudio, Files, FolderOpen, Loader2, MoreHorizontal, Play, PlugZap, Settings, ShieldAlert, Square, Trash2 } from 'lucide-react';
import { apiClient, type TranscriptionPreflight } from '../lib/api';
import { queryKeys, useModelsQuery, useProvidersQuery, useReadinessQuery, useSettingsQuery, useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, ContentSection, ErrorState, Field, PageTitle, Panel, Progress, Select } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { StatusPill } from '../components/StatusPill';
import { ConfirmAction } from '../components/ConfirmAction';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import {
  backendLanguage,
  languageOptionsForModel,
  modelSupportsAutoLanguage,
  normalizeLanguageValue,
  postprocessOptions,
  type TranscriptionLanguage,
} from '../lib/transcriptionOptions';
import { useDesktopServerControl } from '../lib/useDesktopServerControl';
import { desktopCapabilities, type DesktopMediaFile } from '../lib/desktopCapabilities';
import { modelDeviceSummaryKey } from '../lib/modelDevices';
import { downloadResponse } from '../lib/downloads';
import { localizeSystemNotice } from '../lib/userMessages';
import { LocalizedTechnicalMessage } from '../components/LocalizedTechnicalMessage';

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
  const recentTasks = tasks.slice(0, 8);
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
    if (backend !== 'local') return;
    if ((language === 'auto' || language === 'mixed') && !modelSupportsAutoLanguage(selectedModel?.languages)) {
      setLanguage('zh-Hans');
    }
  }, [backend, language, selectedModel]);

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
  const downloadResultForTask = async (task: (typeof tasks)[number], format: 'srt' | 'txt') => {
    try {
      const response = await apiClient.exportTask(task.id, format);
      const savedPath = await downloadResponse(response, `${task.filename}.${format}`, { saveAsText: true });
      if (savedPath) toast.info(t('toast.downloadStarted'), format.toUpperCase());
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };
  const downloadQuickResult = async (format: 'srt' | 'txt') => {
    if (selectedTask) await downloadResultForTask(selectedTask, format);
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
    <section className="grid min-h-full gap-4">
      <Panel className="product-page overflow-hidden shadow-none">
        <div className="flex flex-col gap-5 p-6 lg:p-7">
          <PageTitle
            title={t('transcribe.title')}
          />
          <label
            className={cn(
              'grid min-h-[202px] cursor-pointer place-items-center rounded-2xl border border-dashed app-control px-6 py-8 text-center transition hover:border-[color:var(--app-accent)] hover:bg-[var(--app-accent-soft)]',
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
            <div className="grid justify-items-center gap-3.5">
              <div className="grid size-16 place-items-center rounded-2xl border app-control text-app-muted">
                {selectedFileCount > 1 ? <Files className="size-8" strokeWidth={1.7} /> : <FileAudio className="size-8" strokeWidth={1.7} />}
              </div>
              <div>
                <p className="text-lg font-semibold text-app">
                  {dragActive ? t('transcribe.dropFiles') : selectedFileCount ? `${selectedFileCount} ${t('transcribe.filesSelected')}` : t('transcribe.chooseFile')}
                </p>
                <p className="mt-1.5 text-sm text-app-muted">{dragActive ? t('transcribe.dropHint') : selectedFilename ?? t('transcribe.fileHint')}</p>
                {!selectedFilename && <p className="mt-2 text-xs text-app-faint">mp3、wav、m4a、aac、mp4、mov</p>}
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

          <div className="grid min-w-0 gap-4 lg:grid-cols-2 lg:items-start xl:grid-cols-[minmax(130px,0.7fr)_minmax(190px,1.2fr)_minmax(150px,0.85fr)_minmax(150px,0.8fr)_minmax(150px,0.75fr)]">
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
              <Field label={t('transcribe.model')}>
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
            <Field label={t('transcribe.language')}>
              <Select
                value={language}
                onValueChange={(value) => {
                  defaultsDirtyRef.current.language = true;
                  setLanguage(normalizeLanguageValue(value));
                }}
                options={languageOptionsForModel(locale, backend === 'local' ? selectedModel?.languages : undefined)}
              />
            </Field>
            <Field label={locale === 'zh' ? '更多设置' : 'More settings'}>
              <details className="group relative">
                <summary
                  role="button"
                  aria-label={locale === 'zh' ? '更多设置' : 'More settings'}
                  className="app-control flex h-11 cursor-pointer list-none items-center justify-between rounded-[10px] border px-3.5 text-sm font-medium text-app outline-none focus:border-[color:var(--app-accent)] focus:ring-2 focus:ring-[color:var(--app-accent)]/15"
                >
                  <span>{locale === 'zh' ? '默认参数' : 'Default parameters'}</span>
                  <ChevronDown className="size-4 text-app-muted transition group-open:rotate-180" />
                </summary>
                <div className="app-panel absolute right-0 z-30 mt-2 grid w-72 gap-3 rounded-xl border p-3 shadow-xl">
                  <Button variant="secondary" onClick={() => preflightMutation.mutate()} disabled={selectedFileCount === 0 || preflightMutation.isPending}>
                    <ShieldAlert className="size-4" />
                    {t('transcribe.preflight')}
                  </Button>
                </div>
              </details>
            </Field>
            <div className="flex min-w-0 items-end xl:pt-7">
              <Button onClick={() => createMutation.mutate()} disabled={selectedFileCount === 0 || createMutation.isPending || selectedModelIncompatible} className="h-11 w-full min-w-0 px-5 text-base">
                <Play className="size-5 fill-current" />
                {createMutation.isPending ? t('transcribe.starting') : selectedFileCount > 1 ? t('transcribe.startBatch') : t('transcribe.start')}
              </Button>
            </div>
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
                    <LocalizedTechnicalMessage key={warning} message={localizeSystemNotice(warning, locale)} className="text-xs text-app-accent" />
                  ))}
                </div>
              )}
            </div>
          )}

          {readinessIssues.length > 0 && (
            <div className="grid gap-1 rounded-xl border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
              {readinessIssues.slice(0, 4).map((issue) => (
                <LocalizedTechnicalMessage key={issue} message={localizeSystemNotice(issue, locale)} className="text-xs text-app-accent" />
              ))}
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

          {tasks.length > 0 && <ContentSection
            className="min-h-0 flex-1"
            title={t('transcribe.recentTasks')}
            action={
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
                  <Button variant="secondary" size="sm" disabled={clearTasksMutation.isPending}>
                    <Trash2 className="size-4" />
                    {t('tasks.clearAll')}
                  </Button>
                </ConfirmAction>
              </div>
            }
          >
            <div className="max-h-[44vh] overflow-auto rounded-xl border app-border">
              <div className="product-table-head hidden grid-cols-[minmax(0,2fr)_100px_minmax(150px,1fr)_160px_110px_120px] items-center gap-3 border-b app-border px-5 py-3 lg:grid">
                <span>{t('tasks.fileName')}</span>
                <span>{t('tasks.duration')}</span>
                <span>{t('transcribe.model')}</span>
                <span>{t('tasks.created')}</span>
                <span>{t('tasks.status')}</span>
                <span>{t('tasks.actions')}</span>
              </div>
              <div className="divide-y divide-[color:var(--app-border)]">
                {recentTasks.map((task) => (
                  <div
                    key={task.id}
                    className={cn(
                      'relative grid min-h-[58px] items-center gap-3 px-5 py-2.5 transition hover:bg-[var(--app-control)] lg:grid-cols-[minmax(0,2fr)_100px_minmax(150px,1fr)_160px_110px_120px]',
                      selectedTask?.id === task.id && 'bg-[var(--app-accent-soft)] before:absolute before:inset-y-0 before:left-0 before:w-0.5 before:bg-[var(--app-accent)]',
                    )}
                  >
                    <button className="flex min-w-0 items-center gap-3 text-left" onClick={() => setSelectedTaskId(task.id)}>
                      <span className="grid size-8 shrink-0 place-items-center rounded-lg bg-[var(--app-accent-soft)] text-app-accent"><FileAudio className="size-4" /></span>
                      <span className="min-w-0"><span className="block truncate text-sm font-semibold text-app">{task.filename}</span>
                      <span className="mt-1 block truncate text-xs text-app-muted lg:hidden">
                        {formatDuration(task.duration_ms)} · {task.model_name ?? task.provider_id ?? task.source}
                      </span></span>
                    </button>
                    <span className="hidden text-xs text-app-muted lg:block">{formatDuration(task.duration_ms)}</span>
                    <span className="hidden truncate text-xs text-app-muted lg:block">{task.model_name ?? task.provider_id ?? task.source}</span>
                    <span className="hidden truncate text-xs text-app-muted lg:block">{formatDate(task.created_at)}</span>
                    <div className="justify-self-start lg:justify-self-auto"><StatusPill status={task.status} /></div>
                    <div className="hidden items-center gap-1 lg:flex">
                      <Button size="icon" variant="ghost" title={t('tasks.openFileLocation')} aria-label={`${t('tasks.openFileLocation')} ${task.filename}`} disabled={!desktopCapabilities.canOpenFileLocation} onClick={() => void desktopCapabilities.openFileLocation(task.normalized_audio_path ?? task.audio_path)}><FolderOpen className="size-4" /></Button>
                      <Button size="icon" variant="ghost" title="SRT" aria-label={`SRT ${task.filename}`} onClick={() => void downloadResultForTask(task, 'srt')}><Download className="size-4" /></Button>
                      <Button asChild size="icon" variant="ghost" title={t('common.details')} aria-label={`${t('common.details')} ${task.filename}`}>
                        <Link to="/tasks" search={{ task: task.id }}><MoreHorizontal className="size-4" /></Link>
                      </Button>
                    </div>
                    {activeTaskStatuses.has(task.status) && <Progress className="col-span-full" value={task.progress} />}
                  </div>
                ))}
              </div>
            </div>
          </ContentSection>}
        </div>
      </Panel>

      <TranscriptViewer
        task={selectedTask}
        mode="summary"
        audioPlayerHost={null}
        onDownloadFormat={(format) => void downloadQuickResult(format)}
      />
    </section>
  );
}
