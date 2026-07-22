import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import {
  AlertTriangle,
  BrainCircuit,
  CheckCheck,
  ChevronDown,
  ChevronRight,
  Clock3,
  ExternalLink,
  HardDrive,
  History,
  Loader2,
  RotateCcw,
  Settings2,
  Sparkles,
  Wifi,
} from 'lucide-react';
import {
  apiClient,
  type ProofreadingRun,
  type ProofreadingSuggestion,
  type TranscriptSegment,
  type TranscriptionTask,
} from '../../lib/api';
import { formatDate } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { queryKeys, useLLMProvidersQuery } from '../../lib/queries';
import { useUiStore } from '../../stores/uiStore';
import { ConfirmAction } from '../ConfirmAction';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, EmptyState, ErrorState, Panel, PanelHeader, Progress, Select } from '../weiui';

type ReviewItem =
  | { type: 'unchanged'; key: string; segments: TranscriptSegment[] }
  | { type: 'suggestion'; key: string; segment?: TranscriptSegment; suggestion: ProofreadingSuggestion };

export function ProofreadingPanel({ task }: { task: TranscriptionTask }) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const lastProviderId = useUiStore((state) => state.lastLLMProviderId);
  const setLastProviderId = useUiStore((state) => state.setLastLLMProviderId);
  const providers = useLLMProvidersQuery();
  const [providerId, setProviderId] = useState('');
  const [selectedRunId, setSelectedRunId] = useState('');
  const [selectedSuggestionIds, setSelectedSuggestionIds] = useState<number[]>([]);
  const [expandedRanges, setExpandedRanges] = useState<string[]>([]);
  const enabledProviders = useMemo(
    () => (providers.data?.items ?? []).filter((provider) => provider.enabled),
    [providers.data?.items],
  );

  useEffect(() => {
    const preferred = enabledProviders.find((provider) => provider.id === lastProviderId) ?? enabledProviders[0];
    if (!enabledProviders.some((provider) => provider.id === providerId)) setProviderId(preferred?.id ?? '');
  }, [enabledProviders, lastProviderId, providerId]);

  useEffect(() => {
    setSelectedRunId('');
    setSelectedSuggestionIds([]);
    setExpandedRanges([]);
  }, [task.id]);

  const runs = useQuery({
    queryKey: queryKeys.proofreadingRuns(task.id),
    queryFn: () => apiClient.listProofreadingRuns(task.id),
    retry: 1,
    refetchInterval: (query) => query.state.data?.items.some(isActiveRun) ? 1200 : false,
  });
  const versions = useQuery({
    queryKey: queryKeys.taskVersions(task.id),
    queryFn: () => apiClient.getTaskVersions(task.id),
    retry: 1,
  });
  const sortedRuns = useMemo(
    () => [...(runs.data?.items ?? [])].sort((left, right) => Date.parse(right.created_at) - Date.parse(left.created_at)),
    [runs.data?.items],
  );
  const currentRun = sortedRuns.find((run) => run.id === selectedRunId) ?? sortedRuns[0];
  const sourceSegments = useMemo(() => {
    const sourceVersion = versions.data?.find((version) => Number(version.id) === currentRun?.source_version_id);
    return sourceVersion?.segments ?? task.segments;
  }, [currentRun?.source_version_id, task.segments, versions.data]);
  const reviewItems = useMemo(
    () => currentRun ? buildReviewItems(sourceSegments, currentRun.suggestions) : [],
    [currentRun, sourceSegments],
  );
  const selectedProvider = enabledProviders.find((provider) => provider.id === providerId);
  const pendingSuggestions = currentRun?.suggestions.filter((item) => item.resolution === 'pending') ?? [];
  const allSelected = pendingSuggestions.length > 0 && pendingSuggestions.every((item) => selectedSuggestionIds.includes(item.id));
  const activeRun = sortedRuns.find(isActiveRun);
  const selectable = currentRun?.status === 'completed' && !currentRun.stale;
  const appliedCount = currentRun?.suggestions.filter((suggestion) => suggestion.resolution === 'applied').length ?? 0;

  useEffect(() => {
    setSelectedSuggestionIds([]);
    setExpandedRanges([]);
  }, [currentRun?.id]);

  const refreshRuns = () => queryClient.invalidateQueries({ queryKey: queryKeys.proofreadingRuns(task.id) });
  const start = useMutation({
    mutationFn: () => apiClient.createProofreadingRun(task.id, providerId),
    onSuccess: (run) => {
      setLastProviderId(providerId);
      setSelectedRunId(run.id);
      refreshRuns();
      toast.success(t('proofreading.started'));
    },
    onError: (error) => toast.error(t('proofreading.startFailed'), toastErrorMessage(error)),
  });
  const apply = useMutation({
    mutationFn: () => apiClient.applyProofreadingRun(task.id, currentRun!.id, selectedSuggestionIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.task(task.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskVersions(task.id) });
      refreshRuns();
      setSelectedSuggestionIds([]);
      toast.success(t('proofreading.applied'));
    },
    onError: (error) => {
      refreshRuns();
      toast.error(t('proofreading.applyFailed'), toastErrorMessage(error));
    },
  });

  const toggleSuggestion = (id: number) => setSelectedSuggestionIds((current) => (
    current.includes(id) ? current.filter((item) => item !== id) : [...current, id]
  ));
  const toggleAll = () => setSelectedSuggestionIds(allSelected ? [] : pendingSuggestions.map((item) => item.id));
  const toggleRange = (key: string) => setExpandedRanges((current) => (
    current.includes(key) ? current.filter((item) => item !== key) : [...current, key]
  ));
  const confirmDescription = t('proofreading.confirmDescription', {
    selected: selectedSuggestionIds.length,
    skipped: Math.max(pendingSuggestions.length - selectedSuggestionIds.length, 0),
  });

  if (!providers.isLoading && enabledProviders.length === 0) {
    return (
      <Panel className="min-w-0 overflow-hidden">
        <PanelHeader eyebrow={t('proofreading.eyebrow')} title={t('proofreading.title')} description={task.filename} />
        {providers.error ? (
          <div className="p-4"><ErrorState error={providers.error} /></div>
        ) : (
          <EmptyState
            title={t('proofreading.noProviders')}
            body={t('proofreading.noProvidersBody')}
            icon={<Settings2 className="size-5" />}
            action={<Button asChild><Link to="/settings" search={{ tab: 'llm' }}>{t('proofreading.configureProvider')}</Link></Button>}
          />
        )}
      </Panel>
    );
  }

  return (
    <Panel className="min-w-0 overflow-hidden">
      <PanelHeader
        eyebrow={t('proofreading.eyebrow')}
        title={t('proofreading.title')}
        description={task.filename}
        action={currentRun ? <RunStatus run={currentRun} /> : undefined}
      />
      <div className="grid min-w-0 gap-4 p-4 sm:p-5">
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto]">
          <Select
            value={providerId}
            onValueChange={setProviderId}
            placeholder={t('proofreading.chooseProvider')}
            options={enabledProviders.map((provider) => ({
              value: provider.id,
              label: `${provider.name} · ${provider.default_model ?? t('llmProviders.modelMissing')}`,
            }))}
          />
          <Button
            disabled={!providerId || start.isPending || Boolean(activeRun)}
            onClick={() => start.mutate()}
            className="h-10"
          >
            {start.isPending || activeRun ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {activeRun ? t('proofreading.running') : currentRun ? t('proofreading.rerun') : t('proofreading.start')}
          </Button>
        </div>

        {selectedProvider && (
          <p className="flex gap-2 rounded-lg border app-border px-3 py-2 text-xs leading-5 text-app-muted">
            {selectedProvider.is_local ? <HardDrive className="mt-0.5 size-4 shrink-0" /> : <Wifi className="mt-0.5 size-4 shrink-0" />}
            {selectedProvider.is_local ? t('proofreading.localDisclosure') : t('proofreading.remoteDisclosure')}
          </p>
        )}
        {(runs.error || versions.error || start.error || apply.error) && (
          <ErrorState error={runs.error ?? versions.error ?? start.error ?? apply.error} />
        )}

        {activeRun && currentRun?.id === activeRun.id && (
          <div className="grid gap-2 rounded-lg border app-control p-3">
            <Progress value={activeRun.total_batches > 0 ? (activeRun.completed_batches / activeRun.total_batches) * 100 : 5} />
            <p className="text-xs text-app-muted">
              {t('proofreading.batchProgress', { completed: activeRun.completed_batches, total: activeRun.total_batches || '—' })}
            </p>
          </div>
        )}

        {currentRun?.stale && currentRun.status !== 'applied' && (
          <Notice tone="danger" icon={<AlertTriangle className="mt-0.5 size-4 shrink-0" />}>
            {t('proofreading.stale')}
          </Notice>
        )}
        {currentRun && (currentRun.status === 'failed' || currentRun.status === 'interrupted') && (
          <RunFailure run={currentRun} onRetry={() => start.mutate()} />
        )}
        {currentRun?.status === 'completed' && currentRun.suggestions.length === 0 && (
          <div className="grid justify-items-center gap-3 rounded-lg border app-border px-4 py-8 text-center">
            <CheckCheck className="size-6 text-[var(--app-success)]" />
            <div>
              <p className="text-sm font-semibold text-app">{t('proofreading.noSuggestions')}</p>
              <p className="mt-1 text-xs leading-5 text-app-muted">{t('proofreading.noSuggestionsBody')}</p>
            </div>
            <Button size="sm" variant="secondary" disabled={start.isPending} onClick={() => start.mutate()}>
              <RotateCcw className="size-4" />{t('proofreading.rerun')}
            </Button>
          </div>
        )}

        {currentRun && currentRun.suggestions.length > 0 && (
          <div className="grid min-w-0 gap-3">
            {selectable && pendingSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center justify-between gap-3 border-y app-border py-2">
                <Button size="sm" variant="secondary" onClick={toggleAll}>
                  <CheckCheck className="size-4" />{allSelected ? t('proofreading.clearAll') : t('proofreading.selectAll')}
                </Button>
                <span className="text-xs text-app-muted">
                  {t('proofreading.selectedCount', { selected: selectedSuggestionIds.length, total: pendingSuggestions.length })}
                </span>
              </div>
            )}

            <div className="grid min-w-0 gap-2">
              {reviewItems.map((item) => item.type === 'unchanged' ? (
                <UnchangedRange
                  key={item.key}
                  item={item}
                  expanded={expandedRanges.includes(item.key)}
                  onToggle={() => toggleRange(item.key)}
                />
              ) : (
                <SuggestionCard
                  key={item.key}
                  item={item}
                  checked={selectedSuggestionIds.includes(item.suggestion.id)}
                  selectable={selectable && item.suggestion.resolution === 'pending'}
                  onToggle={() => toggleSuggestion(item.suggestion.id)}
                />
              ))}
            </div>

            {selectable && pendingSuggestions.length > 0 && (
              <div className="flex justify-end border-t app-border pt-3">
                <ConfirmAction
                  title={t('proofreading.confirmTitle')}
                  description={confirmDescription}
                  confirmLabel={t('proofreading.apply')}
                  tone="secondary"
                  onConfirm={() => apply.mutate()}
                >
                  <Button disabled={selectedSuggestionIds.length === 0 || apply.isPending}>
                    {apply.isPending ? <Loader2 className="size-4 animate-spin" /> : <CheckCheck className="size-4" />}
                    {t('proofreading.apply')} ({selectedSuggestionIds.length})
                  </Button>
                </ConfirmAction>
              </div>
            )}

            {currentRun.status === 'applied' && (
              <Notice tone="success" icon={<CheckCheck className="mt-0.5 size-4 shrink-0" />}>
                <div className="flex flex-1 flex-wrap items-center justify-between gap-3">
                  <span>{t('proofreading.appliedCount', { count: appliedCount })}</span>
                  <div className="flex flex-wrap gap-2">
                    <Button asChild size="sm" variant="secondary">
                      <Link to="/tasks" search={{ task: task.id }}><ExternalLink className="size-4" />{t('proofreading.viewNewTranscript')}</Link>
                    </Button>
                    <Button size="sm" variant="secondary" disabled={start.isPending} onClick={() => start.mutate()}>
                      <RotateCcw className="size-4" />{t('proofreading.rerun')}
                    </Button>
                  </div>
                </div>
              </Notice>
            )}
          </div>
        )}

        {sortedRuns.length > 1 && (
          <details className="rounded-lg border app-border">
            <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-3 text-sm font-medium text-app">
              <History className="size-4" />{t('proofreading.history')}<Badge className="ml-auto">{sortedRuns.length}</Badge>
            </summary>
            <div className="grid gap-1 border-t app-border p-2">
              {sortedRuns.map((run, index) => (
                <button
                  key={run.id}
                  type="button"
                  onClick={() => setSelectedRunId(run.id)}
                  className="flex min-w-0 items-center gap-2 rounded-lg px-3 py-2 text-left text-xs hover:bg-[var(--app-control)]"
                >
                  <span className="min-w-0 flex-1 truncate text-app-soft">{formatDate(run.created_at)} · {run.provider_name} · {run.model_name}</span>
                  {index === 0 && <Badge>{t('proofreading.latest')}</Badge>}
                  <RunStatus run={run} />
                </button>
              ))}
            </div>
          </details>
        )}
      </div>
    </Panel>
  );
}

function UnchangedRange({ item, expanded, onToggle }: {
  item: Extract<ReviewItem, { type: 'unchanged' }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const first = item.segments[0];
  const last = item.segments[item.segments.length - 1];
  const range = `${formatTimestamp(first.start)}–${formatTimestamp(last.end)}`;
  return (
    <div className="overflow-hidden rounded-lg border app-border bg-[var(--app-control)]/45">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-10 w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-app-muted hover:text-app"
      >
        {expanded ? <ChevronDown className="size-4 shrink-0" /> : <ChevronRight className="size-4 shrink-0" />}
        <span>{expanded ? t('proofreading.hideUnchanged') : t('proofreading.showUnchanged', { count: item.segments.length })}</span>
        <span className="ml-auto shrink-0 font-mono text-[11px]">{range}</span>
      </button>
      {expanded && (
        <div className="grid gap-2 border-t app-border px-3 py-3">
          {item.segments.map((segment) => (
            <div key={segment.id} className="grid gap-1 sm:grid-cols-[92px_minmax(0,1fr)]">
              <span className="font-mono text-[11px] text-app-faint">{formatTimestamp(segment.start)}–{formatTimestamp(segment.end)}</span>
              <p className="break-words text-sm leading-6 text-app-muted">{segment.text}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionCard({ item, checked, selectable, onToggle }: {
  item: Extract<ReviewItem, { type: 'suggestion' }>;
  checked: boolean;
  selectable: boolean;
  onToggle: () => void;
}) {
  const { t } = useI18n();
  const suggestion = item.suggestion;
  const time = item.segment ? `${formatTimestamp(item.segment.start)}–${formatTimestamp(item.segment.end)}` : `#${suggestion.segment_id}`;
  return (
    <label className="grid min-w-0 cursor-pointer grid-cols-[auto_minmax(0,1fr)] gap-3 rounded-lg border app-border p-3 has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-[color:var(--app-accent)]">
      <input
        type="checkbox"
        className="mt-1 size-4 accent-[var(--app-accent)]"
        checked={checked}
        onChange={onToggle}
        disabled={!selectable}
        aria-label={t('proofreading.selectSuggestion', { time })}
      />
      <div className="grid min-w-0 gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge><Clock3 className="mr-1 size-3" />{time}</Badge>
          {suggestion.resolution !== 'pending' && <Badge tone={suggestion.resolution === 'applied' ? 'success' : 'neutral'}>{suggestion.resolution}</Badge>}
        </div>
        <div className="grid gap-2 lg:grid-cols-2">
          <DiffBlock label={t('proofreading.original')} value={suggestion.original_text} comparison={suggestion.suggested_text} removed />
          <DiffBlock label={t('proofreading.suggestion')} value={suggestion.suggested_text} comparison={suggestion.original_text} />
        </div>
        <p className="break-words text-xs leading-5 text-app-muted"><span className="font-semibold text-app-soft">{t('proofreading.reason')}:</span> {suggestion.reason}</p>
      </div>
    </label>
  );
}

function DiffBlock({ label, value, comparison, removed = false }: { label: string; value: string; comparison: string; removed?: boolean }) {
  const parts = diffParts(value, comparison);
  return (
    <div className="min-w-0 rounded-lg border app-control px-3 py-2">
      <p className="mb-1 text-[11px] font-semibold text-app-muted">{label}</p>
      <p className="break-words text-sm leading-6 text-app">
        {parts.prefix}
        {parts.changed && (
          <span className={removed ? 'rounded bg-[var(--app-danger-soft)] px-0.5 text-[var(--app-danger)] line-through' : 'rounded bg-[var(--app-success-soft)] px-0.5 text-[var(--app-success)]'}>
            {parts.changed}
          </span>
        )}
        {parts.suffix}
      </p>
    </div>
  );
}

function RunFailure({ run, onRetry }: { run: ProofreadingRun; onRetry: () => void }) {
  const { t } = useI18n();
  const feedback = failureFeedback(run.error_code, t);
  return (
    <div className="grid gap-3 rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] p-3 text-[var(--app-danger)]">
      <div className="flex gap-2">
        <AlertTriangle className="mt-0.5 size-4 shrink-0" />
        <div>
          <p className="text-sm font-semibold">{feedback.title}</p>
          <p className="mt-1 text-xs leading-5 opacity-90">{feedback.body}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={onRetry}><RotateCcw className="size-4" />{t('common.retry')}</Button>
        {feedback.settings && <Button asChild size="sm" variant="secondary"><Link to="/settings" search={{ tab: 'llm' }}><Settings2 className="size-4" />{t('proofreading.providerSettings')}</Link></Button>}
      </div>
      {(run.error || run.error_code) && (
        <details className="text-xs">
          <summary className="cursor-pointer font-medium">{t('proofreading.technicalDetails')}</summary>
          <p className="mt-2 break-words font-mono opacity-80">{run.error_code ? `${run.error_code}: ` : ''}{run.error}</p>
        </details>
      )}
    </div>
  );
}

function Notice({ children, icon, tone }: { children: ReactNode; icon: ReactNode; tone: 'danger' | 'success' }) {
  return (
    <div className={tone === 'danger'
      ? 'flex gap-2 rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs leading-5 text-[var(--app-danger)]'
      : 'flex gap-2 rounded-lg border border-[color:var(--app-success)] bg-[var(--app-success-soft)] px-3 py-2 text-xs leading-5 text-[var(--app-success)]'}
    >
      {icon}{children}
    </div>
  );
}

function RunStatus({ run }: { run: ProofreadingRun }) {
  const { t } = useI18n();
  const tone = run.status === 'completed' || run.status === 'applied' ? 'success' : run.status === 'failed' || run.status === 'interrupted' ? 'danger' : 'warning';
  const labels = {
    queued: t('proofreading.statusQueued'),
    running: t('proofreading.statusRunning'),
    completed: t('proofreading.statusCompleted'),
    failed: t('proofreading.statusFailed'),
    interrupted: t('proofreading.statusInterrupted'),
    applied: t('proofreading.statusApplied'),
  };
  return <Badge tone={tone}><Clock3 className="mr-1 size-3" />{labels[run.status]}</Badge>;
}

function buildReviewItems(segments: TranscriptSegment[], suggestions: ProofreadingSuggestion[]): ReviewItem[] {
  const suggestionsBySegment = new Map<number, ProofreadingSuggestion[]>();
  suggestions.forEach((suggestion) => {
    suggestionsBySegment.set(suggestion.segment_id, [...(suggestionsBySegment.get(suggestion.segment_id) ?? []), suggestion]);
  });
  const items: ReviewItem[] = [];
  let unchanged: TranscriptSegment[] = [];
  const flush = () => {
    if (unchanged.length === 0) return;
    items.push({ type: 'unchanged', key: `unchanged-${unchanged[0].id}-${unchanged.at(-1)!.id}`, segments: unchanged });
    unchanged = [];
  };
  segments.forEach((segment) => {
    const matching = suggestionsBySegment.get(segment.id) ?? [];
    if (matching.length === 0) {
      unchanged.push(segment);
      return;
    }
    flush();
    matching.forEach((suggestion) => items.push({ type: 'suggestion', key: `suggestion-${suggestion.id}`, segment, suggestion }));
    suggestionsBySegment.delete(segment.id);
  });
  flush();
  suggestionsBySegment.forEach((remaining) => {
    remaining.forEach((suggestion) => items.push({ type: 'suggestion', key: `suggestion-${suggestion.id}`, suggestion }));
  });
  return items;
}

function diffParts(value: string, comparison: string) {
  const source = Array.from(value);
  const target = Array.from(comparison);
  let prefixLength = 0;
  while (prefixLength < source.length && prefixLength < target.length && source[prefixLength] === target[prefixLength]) prefixLength += 1;
  let suffixLength = 0;
  while (
    suffixLength < source.length - prefixLength
    && suffixLength < target.length - prefixLength
    && source[source.length - 1 - suffixLength] === target[target.length - 1 - suffixLength]
  ) suffixLength += 1;
  return {
    prefix: source.slice(0, prefixLength).join(''),
    changed: source.slice(prefixLength, source.length - suffixLength).join(''),
    suffix: suffixLength > 0 ? source.slice(source.length - suffixLength).join('') : '',
  };
}

function formatTimestamp(seconds: number) {
  const total = Math.max(0, Math.floor(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const remaining = total % 60;
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`
    : `${String(minutes).padStart(2, '0')}:${String(remaining).padStart(2, '0')}`;
}

function isActiveRun(run: ProofreadingRun) {
  return run.status === 'queued' || run.status === 'running';
}

function failureFeedback(code: string | null | undefined, t: ReturnType<typeof useI18n>['t']) {
  const normalized = (code ?? '').toUpperCase();
  if (normalized.includes('AUTH') || normalized.includes('API_KEY')) return { title: t('proofreading.errorAuthTitle'), body: t('proofreading.errorAuthBody'), settings: true };
  if (normalized.includes('RATE_LIMIT')) return { title: t('proofreading.errorRateTitle'), body: t('proofreading.errorRateBody'), settings: false };
  if (normalized.includes('TIMEOUT')) return { title: t('proofreading.errorTimeoutTitle'), body: t('proofreading.errorTimeoutBody'), settings: false };
  if (normalized.includes('CONTEXT') || normalized.includes('TOO_LONG')) return { title: t('proofreading.errorContextTitle'), body: t('proofreading.errorContextBody'), settings: true };
  if (normalized.includes('INVALID_RESPONSE') || normalized.includes('EMPTY_RESPONSE') || normalized.includes('STRUCTURED')) return { title: t('proofreading.errorResponseTitle'), body: t('proofreading.errorResponseBody'), settings: true };
  if (normalized.includes('UNAVAILABLE') || normalized.includes('NETWORK') || normalized.includes('CONNECTION')) return { title: t('proofreading.errorNetworkTitle'), body: t('proofreading.errorNetworkBody'), settings: false };
  if (normalized.includes('PROVIDER') || normalized.includes('MODEL') || normalized.includes('HTTP')) return { title: t('proofreading.errorConfigTitle'), body: t('proofreading.errorConfigBody'), settings: true };
  if (normalized.includes('INTERRUPTED')) return { title: t('proofreading.errorInterruptedTitle'), body: t('proofreading.errorInterruptedBody'), settings: false };
  return { title: t('proofreading.errorUnknownTitle'), body: t('proofreading.errorUnknownBody'), settings: true };
}
