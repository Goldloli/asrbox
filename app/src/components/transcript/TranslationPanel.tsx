import { useEffect, useState } from 'react';
import { Link, useBlocker, useNavigate } from '@tanstack/react-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, Languages, Play, Save } from 'lucide-react';
import { apiClient, type LLMProvider, type TranscriptionTask, type TranslationLanguage, type TranslationRun, type TranslationVersion, type TranslationExportFormat, type TranslationExportMode, type TranslationExportOrder } from '../../lib/api';
import { useI18n, type DictionaryKey } from '../../lib/i18n';
import { queryKeys, useLLMProvidersQuery } from '../../lib/queries';
import { languageLabel, sameTranslationLanguage, translationLanguages, validTranslationLanguage } from '../../lib/translationLanguages';
import { downloadResponse, responseFilename } from '../../lib/downloads';
import { formatDate } from '../../lib/format';
import { openSegmentAudio, useAudioStore } from '../../stores/audioStore';
import { useUiStore } from '../../stores/uiStore';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, ErrorState, Input, Panel, PanelHeader, Progress, Select, Textarea } from '../weiui';

const isActive = (run: TranslationRun) => run.status === 'queued' || run.status === 'running';

// Mirrors backend/services/translation.py: the Ollama native protocol gets a 300-second
// request deadline (LOCAL_REQUEST_TIMEOUT), every other protocol 90 (REMOTE_REQUEST_TIMEOUT).
function translationRequestLimit(provider: LLMProvider | undefined, preset: string | undefined): number {
  const configured = provider?.compatibility?.protocol ?? 'auto';
  const protocol = configured === 'auto' ? provider?.preset ?? preset : configured;
  return protocol === 'ollama' ? 300 : 90;
}

function LanguageSelect({ value, onChange, target = false }: {
  value: TranslationLanguage; onChange: (value: TranslationLanguage) => void; target?: boolean;
}) {
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const languageOptions = translationLanguages
    .map(([code, zh, en]) => ({ value: code, label: locale === 'zh' ? zh : en }))
    .filter((option) => !normalizedQuery || option.label.toLocaleLowerCase().includes(normalizedQuery));
  return <div className="grid min-w-0 gap-2">
    <Input
      aria-label={`${t(target ? 'translation.targetLanguage' : 'translation.sourceLanguage')} · ${t('translation.languageSearch')}`}
      placeholder={t('translation.languageSearch')}
      value={query}
      onChange={(event) => setQuery(event.target.value)}
      className="h-9"
    />
    <Select aria-label={t(target ? 'translation.targetLanguage' : 'translation.sourceLanguage')}
      value={value.kind === 'preset' ? value.code : value.kind}
      onValueChange={code => {
        onChange(code === 'auto' ? { kind: 'auto' } : code === 'custom' ? { kind: 'custom', name: '' } : { kind: 'preset', code });
        setQuery('');
      }}
      options={[
        ...(!target ? [{ value: 'auto', label: t('translation.auto') }] : []),
        ...languageOptions,
        { value: 'custom', label: t('translation.custom') },
      ]} />
    {value.kind === 'custom' && <Input aria-label={`${t(target ? 'translation.targetLanguage' : 'translation.sourceLanguage')} · ${t('translation.customName')}`} placeholder={t('translation.customName')} value={value.name} onChange={e => onChange({ kind: 'custom', name: e.target.value })} />}
  </div>;
}

export function TranslationPanel({ task, runId }: { task: TranscriptionTask; runId?: string }) {
  const { t, locale, statusLabel } = useI18n();
  const toast = useToast();
  const navigate = useNavigate();
  const client = useQueryClient();
  const providers = useLLMProvidersQuery();
  const lastProviderId = useUiStore(state => state.lastLLMProviderId);
  const [providerId, setProviderId] = useState(lastProviderId ?? '');
  const [sourceId, setSourceId] = useState('');
  const [sourceLanguage, setSourceLanguage] = useState<TranslationLanguage>({ kind: 'auto' });
  const [targetLanguage, setTargetLanguage] = useState<TranslationLanguage>({ kind: 'preset', code: 'zh-Hans' });
  const [dirty, setDirty] = useState(false);
  useBlocker({ shouldBlockFn: () => dirty && !window.confirm(t('translation.leave')), enableBeforeUnload: dirty });
  const sources = useQuery({ queryKey: queryKeys.taskVersions(task.id), queryFn: () => apiClient.getTaskVersions(task.id) });
  const runs = useQuery({ queryKey: queryKeys.translationRuns(task.id), queryFn: () => apiClient.listTranslationRuns(task.id),
    refetchInterval: query => query.state.data?.items.some(isActive) ? 1200 : 5000 });
  const available = (providers.data?.items ?? []).filter(p => p.enabled);
  const provider = available.find(p => p.id === providerId) ?? available[0];
  const sourceVersionId = sourceId || String(sources.data?.[0]?.id ?? '');
  const current = runId ? runs.data?.items.find(r => r.id === runId) : runs.data?.items[0];
  const currentProvider = providers.data?.items.find(p => p.id === current?.llm_provider_id);
  const requestLimit = translationRequestLimit(currentProvider, current?.provider_preset);
  const active = runs.data?.items.some(isActive);
  const validLanguages = validTranslationLanguage(sourceLanguage) && validTranslationLanguage(targetLanguage, true) && !sameTranslationLanguage(sourceLanguage, targetLanguage);
  const refresh = () => client.invalidateQueries({ queryKey: queryKeys.translationRuns(task.id) });
  const selectRun = (id: string) => navigate({ to: '/ai', search: { task: task.id, mode: 'translation', run: id }, replace: true });

  const start = useMutation({
    mutationFn: () => apiClient.createTranslationRun(task.id, { provider_id: provider!.id, source_version_id: Number(sourceVersionId), source_language: sourceLanguage, target_language: targetLanguage }),
    onSuccess: async run => {
      useUiStore.getState().setLastLLMProviderId(provider!.id);
      client.setQueryData<{ items: TranslationRun[] }>(queryKeys.translationRuns(task.id), old => ({ items: [run, ...(old?.items ?? [])] }));
      await selectRun(run.id); refresh();
    },
  });
  const action = useMutation({ mutationFn: (kind: 'cancel' | 'retry') => apiClient.translationAction(task.id, current!.id, kind), onSuccess: refresh });
  const error = sources.error ?? runs.error ?? providers.error ?? start.error ?? action.error;

  return <Panel className="grid h-full min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] overflow-hidden">
    <PanelHeader title={t('translation.title')} description={task.filename} />
    <div className="grid min-h-0 min-w-0 content-start gap-4 overflow-y-auto p-4 sm:p-5">
      <div className="grid min-w-0 gap-3 min-[1500px]:grid-cols-[minmax(190px,1.2fr)_minmax(150px,1fr)_minmax(150px,1fr)_auto] min-[1500px]:items-end">
        <label className="grid min-w-0 gap-2 text-sm">{t('translation.provider')}
          <Select aria-label={t('translation.provider')} value={provider?.id ?? ''} onValueChange={setProviderId}
            options={available.map(p => ({ value: p.id, label: `${p.name} · ${p.default_model ?? ''}` }))} />
        </label>
        <div className="grid min-w-0 gap-2 text-sm"><span>{t('translation.sourceLanguage')}</span><LanguageSelect value={sourceLanguage} onChange={setSourceLanguage} /></div>
        <div className="grid min-w-0 gap-2 text-sm"><span>{t('translation.targetLanguage')}</span><LanguageSelect target value={targetLanguage} onChange={setTargetLanguage} /></div>
        <Button className="h-11 w-full whitespace-nowrap px-6 min-[1500px]:w-auto" disabled={!provider?.default_model || !sourceVersionId || !validLanguages || task.status !== 'completed' || active || start.isPending || dirty} onClick={() => start.mutate()}><Languages className="size-4" />{t('translation.start')}</Button>
      </div>
      {!validLanguages && <p role="alert" className="text-sm text-app-muted">{t('translation.invalidLanguage')}</p>}
      {task.status !== 'completed' && <p role="status" className="text-sm text-app-muted">{t('translation.notReady')}</p>}
      <details open className="group rounded-xl border app-border">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-app">{t('translation.advancedSettings')}</summary>
        <div className="grid gap-3 border-t app-border p-3">
          <label className="grid min-w-0 gap-2 text-sm">{t('translation.sourceVersion')}
            <Select aria-label={t('translation.sourceVersion')} value={sourceVersionId} onValueChange={setSourceId}
              options={(sources.data ?? []).map(s => ({ value: String(s.id), label: `#${s.id} · ${s.version_type ?? ''} · ${formatDate(s.created_at)}` }))} />
          </label>
          <p className="text-xs leading-5 text-app-muted">{t(provider?.is_local ? 'translation.local' : 'translation.remote')} {t('translation.quality')}</p>
          <Button asChild variant="secondary" className="w-fit"><Link to="/settings" search={{ tab: 'llm' }}>{t('proofreading.configureProvider')}</Link></Button>
        </div>
      </details>
      {error && <ErrorState error={error} />}
      {runId && runs.isSuccess && !current && <p role="alert">{t('translation.missingRun')}</p>}
      {!current && !runId && <p className="text-sm text-app-muted">{t('translation.empty')}</p>}
      {(current || !!runs.data?.items.length) && <details open className="group rounded-xl border app-border">
        <summary className="cursor-pointer list-none px-3 py-2.5 text-sm font-semibold text-app">{t('translation.runDetails')}</summary>
        <div className="grid gap-3 border-t app-border p-3">
          {!!runs.data?.items.length && <label className="grid min-w-0 gap-2 text-sm">{t('translation.history')}
            <Select aria-label={t('translation.history')} value={current?.id ?? ''} onValueChange={id => { void selectRun(id); }} options={runs.data.items.map(run => ({ value: run.id,
              label: `${languageLabel(run.source_language, locale)} → ${languageLabel(run.target_language, locale)} · ${formatDate(run.created_at)} · ${run.status === 'running' ? t('translation.running') : statusLabel(run.status)}` }))} />
          </label>}
          {current && <>
            <div className="flex flex-wrap items-center gap-2 text-xs text-app-muted"><Badge>{current.status === 'running' ? t('translation.running') : statusLabel(current.status)}</Badge><span>{current.provider_name} · {current.model_name} · #{current.source_version_id}</span></div>
            {!current.source_is_current && <p role="status" className="rounded-lg border app-border p-3 text-sm">{t('translation.sourceUpdated')}</p>}
            <Progress value={current.total_segments ? current.completed_segments / current.total_segments * 100 : 0} />
            <p className="text-xs text-app-muted" role="status">{t('translation.progress', { completed: current.completed_segments, total: current.total_segments, batches: current.completed_batches, totalBatches: current.total_batches })}</p>
            {current.status === 'running' && <TranslationWait key={`${current.id}:${current.attempt}:${current.updated_at}`} since={current.updated_at} limit={requestLimit} />}
          </>}
        </div>
      </details>}
      {current && <>
        {isActive(current) ? <>
          <Button className="w-fit" variant="secondary" disabled={action.isPending} onClick={() => action.mutate('cancel')}>{t('translation.cancel')}</Button>
          <p className="text-xs text-app-muted">{t('translation.cancelNote')}</p>
        </> : current.status !== 'completed' && <>
          {current.error_code && <div role="alert" className="grid gap-1 text-sm text-app-muted"><p>{t(errorLabel(current.error_code), { limit: requestLimit })}</p><code className="break-all text-xs">{current.error_code}</code></div>}
          <Button className="w-fit" variant="secondary" disabled={!current.can_retry || action.isPending} onClick={() => action.mutate('retry')}>{t('translation.retry')}</Button>
          <p className="text-xs text-app-muted">{t(current.can_retry ? 'translation.retryNote' : 'translation.unavailableRetry')}</p>
        </>}
        {current.latest_translation_version_id && <TranslationReview key={current.id} task={task} run={current} onDirty={setDirty} onError={error => toast.error(t('translation.actionFailed'), toastErrorMessage(error))} />}
      </>}
    </div>
  </Panel>;
}

function TranslationWait({ since, limit }: { since: string; limit: number }) {
  const { t } = useI18n();
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  // Persisted backend timestamps without an offset are UTC, not local time.
  const timestamp = Date.parse(/(?:Z|[+-]\d{2}:?\d{2})$/i.test(since) ? since : `${since}Z`);
  const seconds = Number.isFinite(timestamp) ? Math.max(0, Math.floor((now - timestamp) / 1000)) : 0;
  return <p className="text-xs text-app-muted" data-testid="translation-wait">{t('translation.waiting', { seconds, limit })}</p>;
}

function errorLabel(code: string): DictionaryKey {
  if (code.includes('TIMEOUT')) return 'translation.errorTimeout';
  if (code.includes('RATE_LIMIT')) return 'translation.errorRate';
  if (code.includes('CONTEXT')) return 'translation.errorContext';
  if (code.includes('RESPONSE_TOO_LARGE')) return 'translation.errorLarge';
  if (code.includes('PARAMETERS_REJECTED') || code.includes('FORMAT_UNSUPPORTED')) return 'translation.errorCompatibility';
  if (code.includes('TRUNCATED') || code.includes('REFUSED')) return 'translation.errorIncomplete';
  if (code.includes('INVALID_RESPONSE')) return 'translation.errorStructure';
  if (code.includes('PROVIDER') || code.includes('API_KEY') || code.includes('MODEL_REQUIRED')) return 'translation.errorProvider';
  return 'translation.errorGeneric';
}

function TranslationReview({ task, run, onDirty, onError }: {
  task: TranscriptionTask; run: TranslationRun; onDirty: (dirty: boolean) => void; onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const client = useQueryClient();
  const [versionId, setVersionId] = useState(run.latest_translation_version_id!);
  const [dirty, setDirty] = useState(false);
  const history = useQuery({ queryKey: queryKeys.translationVersions(task.id, run.id), queryFn: () => apiClient.listTranslationVersions(task.id, run.id), refetchInterval: 5000 });
  const version = useQuery({ queryKey: queryKeys.translationVersion(task.id, run.id, versionId), queryFn: () => apiClient.getTranslationVersion(task.id, run.id, versionId) });
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  useEffect(() => () => onDirty(false), [onDirty]);
  return <div className="grid min-w-0 gap-3 border-t app-border pt-4">
    <label className="grid min-w-0 gap-2 text-sm">{t('translation.savedVersions')}
      <Select aria-label={t('translation.savedVersions')} value={String(versionId)} onValueChange={id => {
        if (!dirty || window.confirm(t('translation.leave'))) { setDirty(false); setVersionId(Number(id)); }
      }} options={(history.data?.items ?? []).map(v => ({ value: String(v.id), label: `v${v.revision} · ${formatDate(v.created_at)}` }))} />
    </label>
    {(history.error || version.error) && <ErrorState error={history.error ?? version.error} />}
    {version.data && <TranslationEditor key={versionId} task={task} run={run} version={version.data} onDirty={setDirty} onError={onError} onSaved={saved => {
      setDirty(false); onDirty(false);
      client.setQueryData(queryKeys.translationVersion(task.id, run.id, saved.id), saved);
      setVersionId(saved.id);
      client.invalidateQueries({ queryKey: queryKeys.translationRuns(task.id) });
    }} />}
  </div>;
}

function TranslationEditor({ task, run, version, onDirty, onSaved, onError }: {
  task: TranscriptionTask; run: TranslationRun; version: TranslationVersion; onDirty: (dirty: boolean) => void;
  onSaved: (version: TranslationVersion) => void; onError: (error: unknown) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const mediaUnavailable = useAudioStore(state => state.activeAudioTaskId === task.id && state.audioUnavailable);
  const [draft, setDraft] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [mode, setMode] = useState<TranslationExportMode>('translated');
  const [order, setOrder] = useState<TranslationExportOrder>('source-first');
  const [format, setFormat] = useState<TranslationExportFormat>('srt');
  const changes = version.segments.filter(s => draft[s.id] !== undefined && draft[s.id] !== s.text).map(s => ({ id: s.id, text: draft[s.id] }));
  const dirty = changes.length > 0;
  useEffect(() => { onDirty(dirty); }, [dirty, onDirty]);
  const save = useMutation({ mutationFn: () => apiClient.editTranslationVersion(task.id, run.id, version.id, version.segments.map(s => ({ id: s.id, text: draft[s.id] ?? s.text }))), onSuccess: saved => { onSaved(saved); setDraft({}); toast.success(t('translation.saved')); } });
  const download = useMutation({ mutationFn: async () => {
    const response = await apiClient.exportTranslation(task.id, run.id, version.id, format, mode, order);
    return downloadResponse(response, responseFilename(response, `translation-v${version.id}-${mode}.${format}`), { saveAsText: true });
  }, onError });
  const play = useMutation({ mutationFn: async ({ startAt, endAt }: { startAt: number; endAt: number }) => {
    const url = await apiClient.taskAudioUrl(task.id);
    openSegmentAudio({ taskId: task.id, url, title: task.filename, start: startAt, end: endAt });
  }, onError });
  const query = search.trim().toLocaleLowerCase();
  const segments = version.segments.filter(s => `${s.source_text}\n${draft[s.id] ?? s.text}`.toLocaleLowerCase().includes(query));
  return <div className="grid min-w-0 gap-3">
    <Input aria-label={t('translation.search')} placeholder={t('translation.search')} value={search} onChange={e => setSearch(e.target.value)} />
    {(!task.audio_path || mediaUnavailable) && <p className="text-xs text-app-muted">{t('translation.noMedia')}</p>}
    <div className="min-w-0 overflow-hidden rounded-xl border app-border" data-testid="translation-segments">
      <div className="grid grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] gap-3 bg-[var(--app-control-strong)] px-3 py-2.5 text-sm font-semibold text-app-muted">
        <span>{t('tasks.duration')}</span><span>{t('translation.source')}</span><span>{t('translation.target')}</span>
      </div>
      {segments.map(s => <div key={s.id} className="grid min-h-[70px] min-w-0 grid-cols-[92px_minmax(0,1fr)_minmax(0,1fr)] gap-3 border-t app-border px-3 py-3">
        <div className="flex flex-wrap items-start gap-2 text-xs text-app-muted"><span>{s.start.toFixed(2)}–{s.end.toFixed(2)}</span>{s.speaker && <bdi>{s.speaker}</bdi>}
          <Button size="icon" variant="ghost" className="size-7" aria-label={t('translation.play', { id: s.id })} disabled={!task.audio_path || play.isPending} onClick={() => play.mutate({ startAt: s.start, endAt: s.end })}><Play className="size-3" /></Button>
        </div>
        <p dir="auto" className="whitespace-pre-wrap text-sm leading-6 [overflow-wrap:anywhere] [unicode-bidi:plaintext]">{s.source_text}</p>
        <Textarea dir="auto" aria-label={`${t('translation.target')} ${s.id}`} value={draft[s.id] ?? s.text} disabled={!run.can_edit || save.isPending} onChange={e => setDraft(old => ({ ...old, [s.id]: e.target.value }))} className="min-h-12 w-full min-w-0 border-0 bg-transparent p-0 text-sm leading-6 shadow-none [overflow-wrap:anywhere] [unicode-bidi:plaintext]" />
      </div>)}
      {!segments.length && <p>{t('translation.noMatches')}</p>}
    </div>
    {dirty && <p role="status" className="text-sm text-app-muted">{t('translation.unsaved')}</p>}
    {save.error && <ErrorState title={t('translation.saveConflict')} error={save.error} />}
    <div className="flex flex-wrap gap-2">
      <Button disabled={!run.can_edit || !dirty || changes.some(s => !s.text.trim()) || save.isPending} onClick={() => save.mutate()}><Save className="size-4" />{t('translation.save')}</Button>
      <Button variant="secondary" disabled={!dirty || save.isPending} onClick={() => { if (window.confirm(t('translation.leave'))) setDraft({}); }}>{t('translation.discard')}</Button>
    </div>
    <div className="grid min-w-0 gap-3 border-t app-border pt-3 sm:grid-cols-3">
      <label className="grid min-w-0 gap-2 text-xs">{t('translation.exportMode')}<Select aria-label={t('translation.exportMode')} value={mode} onValueChange={v => setMode(v as TranslationExportMode)} options={['translated', 'bilingual'].map(value => ({ value, label: t(value === 'translated' ? 'translation.translated' : 'translation.bilingual') }))} /></label>
      <label className="grid min-w-0 gap-2 text-xs">{t('translation.exportOrder')}<Select aria-label={t('translation.exportOrder')} value={order} onValueChange={v => setOrder(v as TranslationExportOrder)} disabled={mode !== 'bilingual'} options={[{ value: 'source-first', label: t('translation.sourceFirst') }, { value: 'target-first', label: t('translation.targetFirst') }]} /></label>
      <label className="grid min-w-0 gap-2 text-xs">{t('translation.format')}<Select aria-label={t('translation.format')} value={format} onValueChange={v => setFormat(v as TranslationExportFormat)} options={['srt', 'vtt', 'ass', 'txt', 'json', 'md'].map(value => ({ value, label: value.toUpperCase() }))} /></label>
    </div>
    <Button className="w-fit" variant="secondary" disabled={!run.can_export || download.isPending} onClick={() => download.mutate()}><Download className="size-4" />{t('translation.export')}</Button>
  </div>;
}
