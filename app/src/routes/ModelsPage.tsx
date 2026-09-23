import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, DownloadCloud, Pause, Play, RefreshCw, Search, Square } from 'lucide-react';
import { apiClient, getActiveDownloadItems, type ModelProgress } from '../lib/api';
import { queryKeys, useActiveDownloadsQuery, useModelStorageQuery, useModelsQuery, useSettingsQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { Badge, Button, EmptyState, ErrorState, Input, PageTitle, Panel, PanelHeader, Progress } from '../components/weiui';
import { Link } from '@tanstack/react-router';
import { toastErrorMessage, useToast } from '../components/Toast';
import { isRecommendedModel, modelBestFor, modelCategory, modelDescription, modelDetails, type ModelCategory } from '../lib/modelCatalog';
import { modelDeviceSummaryKey } from '../lib/modelDevices';
import { useI18n } from '../lib/i18n';
import { ModelListRow, StorageMetric } from '../components/models/ModelManagement';
import { ModelLadder } from '../components/models/ModelLadder';

type GuidePreference = 'general' | Exclude<ModelCategory, 'recommended'>;
type ModelViewCategory = ModelCategory | 'all' | 'pinned';

const downloadStatusKeys: Record<ModelProgress['status'], Parameters<ReturnType<typeof useI18n>['t']>[0]> = {
  queued: 'models.downloadStatusQueued',
  downloading: 'models.downloadStatusDownloading',
  paused: 'models.downloadStatusPaused',
  extracting: 'models.downloadStatusExtracting',
  complete: 'models.downloadStatusComplete',
  cancelled: 'models.downloadStatusCancelled',
  error: 'models.downloadStatusError',
};

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState<ModelViewCategory>('all');
  const [guidePreference, setGuidePreference] = useState<GuidePreference>('general');
  const [pinnedModelNames, setPinnedModelNames] = useState<string[]>([]);
  const [modelSearchQuery, setModelSearchQuery] = useState('');
  const modelsQuery = useModelsQuery();
  const downloadsQuery = useActiveDownloadsQuery();
  const storageQuery = useModelStorageQuery();
  const storageUnavailable = storageQuery.data?.status === 'unavailable' || storageQuery.data?.status === 'migrating' || storageQuery.data?.status === 'read_only';
  const models = modelsQuery.data?.models ?? [];
  const downloads = getActiveDownloadItems(downloadsQuery.data);
  const progressByModel = useMemo(
    () => Object.fromEntries(downloads.map((download) => [download.model_name, download])),
    [downloads],
  );

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: queryKeys.models });
    queryClient.invalidateQueries({ queryKey: queryKeys.activeDownloads });
    queryClient.invalidateQueries({ queryKey: queryKeys.modelStorage });
  };
  const download = useMutation({
    mutationFn: (modelName: string) => apiClient.downloadModel(modelName),
    onSuccess: (_, modelName) => {
      refresh();
      toast.success(t('toast.modelDownloadStarted'), modelName);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const pause = useMutation({
    mutationFn: (modelName: string) => apiClient.pauseModelDownload(modelName),
    onSuccess: () => {
      refresh();
      toast.info(t('toast.modelDownloadPaused'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const resume = useMutation({
    mutationFn: (modelName: string) => apiClient.resumeModelDownload(modelName),
    onSuccess: () => {
      refresh();
      toast.info(t('toast.modelDownloadResumed'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const stop = useMutation({
    mutationFn: (modelName: string) => apiClient.stopModelDownload(modelName),
    onSuccess: () => {
      refresh();
      toast.info(t('toast.modelDownloadStopped'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const retry = useMutation({
    mutationFn: (modelName: string) => apiClient.retryModelDownload(modelName),
    onSuccess: (_, modelName) => {
      refresh();
      toast.success(t('toast.modelDownloadRetried'), modelName);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const unload = useMutation({
    mutationFn: (modelName: string) => apiClient.unloadModel(modelName),
    onSuccess: () => {
      refresh();
      toast.success(t('toast.modelUnloaded'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const remove = useMutation({
    mutationFn: (modelName: string) => apiClient.deleteModel(modelName),
    onSuccess: () => {
      refresh();
      toast.success(t('toast.modelDeleted'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const settingsQuery = useSettingsQuery();
  const currentDefaultModelName = settingsQuery.data?.default_backend === 'local'
    ? settingsQuery.data?.default_model_name ?? null
    : null;
  const setDefaultModel = useMutation({
    mutationFn: (modelName: string) => apiClient.updateSettings({
      default_backend: 'local',
      default_model_name: modelName,
      default_provider_id: null,
    }),
    onSuccess: (settings) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
      queryClient.invalidateQueries({ queryKey: queryKeys.readiness });
      toast.success(t('toast.modelDefaultSet'), settings.default_model_name ?? '');
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const downloadedCount = models.filter((model) => model.downloaded).length;
  const loadedCount = models.filter((model) => model.loaded).length;
  const visibleModels = models
    .filter((model) => {
      const needle = modelSearchQuery.trim().toLowerCase();
      if (needle && !`${model.display_name} ${model.model_name} ${model.engine} ${model.repo_id ?? ''}`.toLowerCase().includes(needle)) return false;
      if (category === 'all') return true;
      if (category === 'pinned') return pinnedModelNames.includes(model.model_name);
      if (category === 'recommended') return isRecommendedModel(model);
      return modelCategory(model) === category;
    })
    .sort((a, b) => Number(pinnedModelNames.includes(b.model_name)) - Number(pinnedModelNames.includes(a.model_name)));
  const recommendedDownloadModel = models.find((model) => isRecommendedModel(model) && model.downloaded === false) ?? models.find((model) => model.downloaded === false);
  const guideCategory = guidePreference === 'general' ? 'recommended' : guidePreference;
  const guideRecommendedModel =
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference) && model.downloaded === false) ??
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference));
  const categoryItems: Array<{ value: ModelViewCategory; label: string }> = [
    { value: 'all', label: t('models.categoryAll') },
    { value: 'recommended', label: t('models.categoryRecommended') },
    { value: 'pinned', label: t('models.categoryPinned') },
    { value: 'apple', label: t('models.categoryApple') },
    { value: 'faster', label: t('models.categoryFaster') },
    { value: 'chinese', label: t('models.categoryChinese') },
    { value: 'diarization', label: t('models.categoryDiarization') },
    { value: 'whisper', label: t('models.categoryWhisper') },
    { value: 'speechlm', label: t('models.categorySpeechlm') },
  ];
  const guideItems: Array<{ value: GuidePreference; label: string }> = [
    { value: 'general', label: t('models.guideGeneral') },
    { value: 'apple', label: t('models.guideApple') },
    { value: 'faster', label: t('models.guideFaster') },
    { value: 'chinese', label: t('models.guideChinese') },
    { value: 'whisper', label: t('models.guideWhisper') },
  ];

  const togglePinnedModel = (modelName: string) => {
    setPinnedModelNames((current) => (
      current.includes(modelName) ? current.filter((name) => name !== modelName) : [...current, modelName]
    ));
  };

  return (
    <section className="product-page grid gap-5 p-5 sm:p-6">
      <PageTitle
        title={t('models.title')}
        description={t('models.pageDescription')}
        action={
          <Button asChild variant="secondary">
            <Link to="/settings" search={{ tab: 'storage' }}>
              <Database className="size-4" />
              {t('models.openStorageSettings')}
            </Link>
          </Button>
        }
      />
      <ModelLadder models={models} />
      <div className="grid gap-4">
      <Panel className="overflow-hidden shadow-none">
        <div className="grid gap-4 p-5">
          <div className="grid gap-3 xl:grid-cols-[280px_minmax(0,1fr)_auto] xl:items-center">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
              <Input value={modelSearchQuery} onChange={(event) => setModelSearchQuery(event.target.value)} placeholder={t('models.searchPlaceholder')} className="pl-9" />
            </div>
            <div className="flex flex-wrap gap-2">
              {categoryItems.map((item) => (
                <Button key={item.value} size="sm" variant={category === item.value ? 'primary' : 'secondary'} onClick={() => setCategory(item.value)}>
                  {item.label}
                </Button>
              ))}
            </div>
            <div className="flex items-center gap-3 text-sm text-app-muted">
              <span className="whitespace-nowrap">{storageUnavailable ? t('settings.modelStorageUnavailable') : `${downloadedCount}/${models.length} ${t('models.descriptionDownloaded')} · ${loadedCount} ${t('models.descriptionLoaded')}`}</span>
              <Button variant="ghost" size="icon" onClick={refresh} title={t('common.refresh')} aria-label={t('common.refresh')}>
                <RefreshCw className="size-4" />
              </Button>
            </div>
          </div>
          {modelsQuery.error && <ErrorState title={t('common.unableToLoad')} error={modelsQuery.error} />}
          <div className="overflow-hidden rounded-xl border app-border">
            <div className="hidden grid-cols-[minmax(220px,1.7fr)_70px_50px_60px_minmax(120px,1fr)_110px_180px] items-center gap-3 bg-[var(--app-control-strong)] px-4 py-2.5 text-xs font-semibold text-app-muted min-[1100px]:grid">
              <span>{t('models.modelName')}</span>
              <span>{t('models.size')}</span>
              <span>{t('models.ladderSpeed')}</span>
              <span>{t('models.ladderAccuracy')}</span>
              <span>{t('models.detailCapabilities')}</span>
              <span>{t('tasks.status')}</span>
              <span>{t('models.actions')}</span>
            </div>
                  {visibleModels.map((model) => (
                    <ModelListRow
                      key={model.model_name}
                      model={model}
                      progress={progressByModel[model.model_name]}
                      pinned={pinnedModelNames.includes(model.model_name)}
                      description={modelDescription(model, locale)}
                      bestFor={modelBestFor(model, locale)}
                      details={modelDetails(model, locale)}
                      isDefault={currentDefaultModelName === model.model_name}
                      onSetDefault={() => setDefaultModel.mutate(model.model_name)}
                      onTogglePin={() => togglePinnedModel(model.model_name)}
                      onDownload={() => download.mutate(model.model_name)}
                      onPause={() => pause.mutate(model.model_name)}
                      onResume={() => resume.mutate(model.model_name)}
                      onStop={() => stop.mutate(model.model_name)}
                      onRetry={() => retry.mutate(model.model_name)}
                      onUnload={() => unload.mutate(model.model_name)}
                      onDelete={() => remove.mutate(model.model_name)}
                    />
                  ))}
          </div>
          {visibleModels.length === 0 && (
            <EmptyState
              title={t('models.noModels')}
              body={t('models.noModelsBody')}
              action={
                recommendedDownloadModel ? (
                  <Button onClick={() => download.mutate(recommendedDownloadModel.model_name)} disabled={storageUnavailable}>
                    <DownloadCloud className="size-4" />
                    {t('models.downloadRecommended')}
                  </Button>
                ) : (
                  <Button variant="secondary" onClick={refresh}>
                    <RefreshCw className="size-4" />
                    {t('common.refresh')}
                  </Button>
                )
              }
            />
          )}
        </div>
      </Panel>

      <div className="grid min-w-0 content-start gap-4">
        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('models.recommended')} title={t('models.guideTitle')} description={t('models.guideBody')} />
          <div className="grid gap-3 p-5">
            <div className="flex flex-wrap gap-2">
              {guideItems.map((item) => (
                <Button
                  key={item.value}
                  size="sm"
                  variant={guidePreference === item.value ? 'primary' : 'secondary'}
                  onClick={() => {
                    setGuidePreference(item.value);
                    setCategory(item.value === 'general' ? 'recommended' : item.value);
                  }}
                >
                  {item.label}
                </Button>
              ))}
            </div>
            {guideRecommendedModel ? (
              <article className="grid gap-3 rounded-xl border app-control px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="font-medium text-app">{guideRecommendedModel.display_name}</span>
                  <Badge tone={storageUnavailable ? 'danger' : guideRecommendedModel.downloaded ? 'success' : 'accent'}>
                    {storageUnavailable ? t('settings.modelStorageUnavailable') : guideRecommendedModel.downloaded ? t('common.downloaded') : t('models.recommended')}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-app-muted">{modelDescription(guideRecommendedModel, locale)}</p>
                <p className="text-xs text-app-muted">{modelBestFor(guideRecommendedModel, locale)}</p>
                <div className="flex flex-wrap items-center gap-2">
                  <Badge tone="accent">{t(modelDeviceSummaryKey(guideRecommendedModel.supported_devices))}</Badge>
                  <span className="text-xs text-app-muted">{t('models.deviceSupportHint')}</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setCategory(guideCategory)}>
                    {t('models.showMatches')}
                  </Button>
                  {guideRecommendedModel.downloaded === false && (
                    <Button size="sm" onClick={() => download.mutate(guideRecommendedModel.model_name)} disabled={storageUnavailable}>
                      <DownloadCloud className="size-4" />
                      {t('common.download')}
                    </Button>
                  )}
                </div>
              </article>
            ) : (
              <EmptyState title={t('models.noModels')} body={t('models.noModelsBody')} />
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('status.modelDownload')} title={t('models.activeDownloads')} description={t('models.downloadsRunning', { count: downloads.length })} />
          <div className="grid gap-3 p-5">
            {downloads.map((download) => (
              <div key={download.model_name} className="grid gap-2 rounded-xl border app-control p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-app">{download.model_name}</span>
                  <Badge tone={download.status === 'error' ? 'danger' : download.status === 'complete' ? 'success' : 'warning'}>
                    {t(downloadStatusKeys[download.status])}
                  </Badge>
                </div>
                <Progress value={download.progress} />
                <p className="truncate text-xs text-app-muted">{download.filename ?? download.source ?? t('status.modelDownload')}</p>
                <div className="flex flex-wrap justify-end gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => (download.status === 'paused' ? resume : pause).mutate(download.model_name)}
                  >
                    {download.status === 'paused' ? <Play className="size-4" /> : <Pause className="size-4" />}
                    {download.status === 'paused' ? t('common.resume') : t('common.pause')}
                  </Button>
                  <Button size="sm" variant="danger" onClick={() => stop.mutate(download.model_name)}>
                    <Square className="size-4" />
                    {t('common.stop')}
                  </Button>
                </div>
              </div>
            ))}
            {downloads.length === 0 && (
              <EmptyState
                title={t('models.noActiveDownloads')}
                body={t('models.downloadProgress')}
                action={recommendedDownloadModel && (
                  <Button onClick={() => download.mutate(recommendedDownloadModel.model_name)} disabled={storageUnavailable}>
                    <DownloadCloud className="size-4" />
                    {t('models.downloadRecommended')}
                  </Button>
                )}
              />
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('settings.storage')} title={t('models.storage')} description={storageUnavailable ? t('settings.modelStorageUnavailable') : storageQuery.data?.models_dir ?? t('models.storageUnavailable')} />
          <div className="grid gap-4 p-5">
            {storageQuery.error && <ErrorState title={t('common.unableToLoad')} error={storageQuery.error} />}
            <div className="grid grid-cols-2 gap-2">
              <StorageMetric label={t('models.used')} value={formatBytes(storageQuery.data?.used_bytes)} />
              <StorageMetric label={t('models.free')} value={formatBytes(storageQuery.data?.free_bytes)} />
              <StorageMetric label={t('models.total')} value={formatBytes(storageQuery.data?.total_bytes)} />
              <StorageMetric label={t('models.items')} value={String(storageQuery.data?.models?.length ?? 0)} />
            </div>
            <div className="grid max-h-80 auto-rows-max content-start gap-2 overflow-auto pr-1">
              {(storageQuery.data?.models ?? []).map((item) => (
                <div key={item.model_name} className="flex min-w-0 items-center justify-between gap-3 overflow-hidden rounded-lg border app-control px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-app">{item.model_name}</p>
                    <p className="truncate text-xs text-app-muted">{item.path}</p>
                  </div>
                  <Badge>{formatBytes(item.size_bytes)}</Badge>
                </div>
              ))}
              {(storageQuery.data?.models ?? []).length === 0 && (
                <div className="flex items-center gap-2 rounded-lg border app-control px-3 py-3 text-sm text-app-muted">
                  <Database className="size-4" />
                  {t('models.noStoredEntries')}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
      </div>
    </section>
  );
}
