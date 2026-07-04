import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { FileAudio, Files, Play, RefreshCw, ShieldAlert } from 'lucide-react';
import { apiClient, type TranscriptionPreflight } from '../lib/api';
import { queryKeys, useModelsQuery, useProvidersQuery, useReadinessQuery, useTasksQuery } from '../lib/queries';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, EmptyState, ErrorState, Field, Panel, PanelHeader, Progress, Select } from '../components/weiui';
import { TranscriptViewer } from '../components/TranscriptViewer';
import { StatusPill } from '../components/StatusPill';
import { cn } from '../lib/cn';
import { useI18n } from '../lib/i18n';
import {
  backendLanguage,
  languageOptions,
  normalizeLanguageValue,
  postprocessOptions,
  type TranscriptionLanguage,
} from '../lib/transcriptionOptions';

const formats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

export function TranscribePage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const [files, setFiles] = useState<File[]>([]);
  const [backend, setBackend] = useState('local');
  const [modelName, setModelName] = useState('whisper-base');
  const [providerId, setProviderId] = useState('');
  const [language, setLanguage] = useState<TranscriptionLanguage>('zh-Hans');
  const [outputFormats, setOutputFormats] = useState<string[]>(['txt', 'srt', 'json']);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [preflight, setPreflight] = useState<TranscriptionPreflight | null>(null);

  const readinessQuery = useReadinessQuery();
  const tasksQuery = useTasksQuery();
  const modelsQuery = useModelsQuery();
  const providersQuery = useProvidersQuery();
  const tasks = tasksQuery.data?.items ?? [];
  const models = modelsQuery.data?.models ?? [];
  const providers = providersQuery.data?.items ?? [];

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, tasks]);

  useEffect(() => {
    const firstDownloaded = models.find((model) => model.downloaded)?.model_name ?? models[0]?.model_name;
    if (firstDownloaded && !models.some((model) => model.model_name === modelName)) setModelName(firstDownloaded);
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

  const preflightMutation = useMutation({
    mutationFn: async () => {
      if (!files[0]) throw new Error(t('transcribe.chooseFirst'));
      return apiClient.preflightTranscription(files[0]);
    },
    onSuccess: setPreflight,
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      if (files.length === 0) throw new Error(t('transcribe.chooseAtLeastOne'));
      const firstCheck = await apiClient.preflightTranscription(files[0]);
      setPreflight(firstCheck);
      if (!firstCheck.supported_format || !firstCheck.has_audio_stream) {
        throw new Error(firstCheck.warnings[0] || t('transcribe.unsupported'));
      }
      const payload = {
        backend,
        modelName: backend === 'local' ? modelName : undefined,
        providerId: backend === 'provider' ? providerId : undefined,
        language: backendLanguage(language),
        outputFormats,
        ...postprocessOptions(language),
      };
      if (files.length === 1) return apiClient.createTranscription({ file: files[0], ...payload });
      return apiClient.createBatchTranscription({ files, ...payload });
    },
    onSuccess: (result) => {
      const task = 'id' in result ? result : result.items?.[0] ?? result.tasks?.[0];
      if (task) setSelectedTaskId(task.id);
      refreshTasks();
    },
  });

  const toggleFormat = (format: string) => {
    setOutputFormats((current) =>
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format],
    );
  };

  const readinessIssues = [
    ...(readinessQuery.data?.issues ?? []),
    ...(readinessQuery.data?.warnings ?? []),
    ...(readinessQuery.data?.missing_models ?? []).map((model) => `Missing model: ${model}`),
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-[360px_minmax(0,1fr)_340px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow="Input"
          title={t('transcribe.title')}
          description={t('transcribe.description')}
          action={
            <Button variant="ghost" size="icon" onClick={() => tasksQuery.refetch()} title={t('common.refresh')}>
              <RefreshCw className="size-4" />
            </Button>
          }
        />
        <div className="grid gap-4 p-5">
          <label className="grid min-h-36 cursor-pointer place-items-center rounded-xl border border-dashed border-white/15 bg-white/[0.03] px-4 py-6 text-center transition hover:border-amber-300/40 hover:bg-amber-300/5">
            <div className="grid justify-items-center gap-3">
              <div className="grid size-12 place-items-center rounded-xl border border-white/10 bg-zinc-950 text-amber-200">
                {files.length > 1 ? <Files className="size-5" /> : <FileAudio className="size-5" />}
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-100">
                  {files.length ? `${files.length} ${t('transcribe.filesSelected')}` : t('transcribe.chooseFile')}
                </p>
                <p className="mt-1 text-xs text-zinc-500">{files[0]?.name ?? t('transcribe.fileHint')}</p>
              </div>
            </div>
            <input
              className="sr-only"
              type="file"
              accept="audio/*,video/*"
              multiple
              onChange={(event) => {
                setFiles(Array.from(event.target.files ?? []));
                setPreflight(null);
              }}
            />
          </label>

          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" onClick={() => preflightMutation.mutate()} disabled={!files[0] || preflightMutation.isPending}>
              <ShieldAlert className="size-4" />
              {t('transcribe.preflight')}
            </Button>
            <Button onClick={() => createMutation.mutate()} disabled={files.length === 0 || createMutation.isPending}>
              <Play className="size-4" />
              {createMutation.isPending ? t('transcribe.starting') : files.length > 1 ? t('transcribe.startBatch') : t('transcribe.start')}
            </Button>
          </div>

          {preflight && (
            <div className="grid gap-3 rounded-xl border border-white/10 bg-zinc-950/50 p-4">
              <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium text-zinc-100">{preflight.filename}</span>
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
                    <p key={warning} className="text-xs text-amber-200">{warning}</p>
                  ))}
                </div>
              )}
            </div>
          )}

          {readinessIssues.length > 0 && (
            <div className="grid gap-1 rounded-xl border border-amber-400/20 bg-amber-400/10 p-4">
              {readinessIssues.slice(0, 4).map((issue) => <p key={issue} className="text-xs text-amber-100">{issue}</p>)}
            </div>
          )}

          {(preflightMutation.error || createMutation.error) && (
            <ErrorState error={preflightMutation.error ?? createMutation.error} />
          )}

          <div className="grid gap-2">
            <h2 className="text-sm font-semibold text-zinc-100">{t('transcribe.recentTasks')}</h2>
            <div className="grid max-h-[36vh] gap-2 overflow-auto pr-1">
              {tasks.map((task) => (
                <button
                  key={task.id}
                  className={cn(
                    'grid gap-2 rounded-xl border px-3 py-3 text-left transition hover:border-white/20 hover:bg-white/[0.04]',
                    selectedTask?.id === task.id ? 'border-amber-300/40 bg-amber-300/10' : 'border-white/10 bg-white/[0.03]',
                  )}
                  onClick={() => setSelectedTaskId(task.id)}
                >
                  <div className="flex min-w-0 items-center justify-between gap-3">
                    <span className="truncate text-sm font-medium text-zinc-100">{task.filename}</span>
                    <StatusPill status={task.status} />
                  </div>
                  <Progress value={task.progress} />
                  <span className="text-xs text-zinc-500">{task.model_name ?? task.provider_id ?? task.source} · {formatPercent(task.progress)}</span>
                </button>
              ))}
              {tasks.length === 0 && <EmptyState title={t('transcribe.noTasks')} body={t('transcribe.noTasksBody')} />}
            </div>
          </div>
        </div>
      </Panel>

      <TranscriptViewer task={selectedTask} />

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('transcribe.engine')} title={t('transcribe.runOptions')} description={t('transcribe.runDescription')} />
        <div className="grid gap-4 p-5">
          <Field label={t('transcribe.backend')}>
            <Select
              value={backend}
              onValueChange={setBackend}
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
                onValueChange={setModelName}
                options={(models.length ? models : [{ model_name: modelName, display_name: modelName }]).map((model) => ({
                  value: model.model_name,
                  label: `${model.display_name}${'downloaded' in model && model.downloaded === false ? ` · ${t('transcribe.notDownloaded')}` : ''}`,
                }))}
              />
            </Field>
          ) : (
            <Field label={t('transcribe.provider')}>
              <Select
                value={providerId || 'none'}
                onValueChange={(value) => setProviderId(value === 'none' ? '' : value)}
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
              onValueChange={(value) => setLanguage(normalizeLanguageValue(value))}
              options={languageOptions(locale)}
            />
          </Field>
          <Field label={t('transcribe.exports')}>
            <div className="flex flex-wrap gap-2">
              {formats.map((format) => (
                <Button
                  key={format}
                  type="button"
                  size="sm"
                  variant={outputFormats.includes(format) ? 'primary' : 'secondary'}
                  onClick={() => toggleFormat(format)}
                >
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </Field>
        </div>
      </Panel>
    </section>
  );
}
