import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, DownloadCloud, RefreshCw } from 'lucide-react';
import { apiClient, getActiveDownloadItems } from '../lib/api';
import { queryKeys, useActiveDownloadsQuery, useModelStorageQuery, useModelsQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { ModelDownloadCard } from '../components/ModelDownloadCard';
import { Badge, Button, EmptyState, ErrorState, Panel, PanelHeader, Progress } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { isRecommendedModel, modelBestFor, modelCategory, modelDescription, type ModelCategory } from '../lib/modelCatalog';
import { useI18n } from '../lib/i18n';

type GuidePreference = 'general' | Exclude<ModelCategory, 'recommended'>;

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState<ModelCategory | 'all'>('recommended');
  const [guidePreference, setGuidePreference] = useState<GuidePreference>('general');
  const modelsQuery = useModelsQuery();
  const downloadsQuery = useActiveDownloadsQuery();
  const storageQuery = useModelStorageQuery();
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
  const cancel = useMutation({
    mutationFn: (modelName: string) => apiClient.cancelModelDownload(modelName),
    onSuccess: () => {
      refresh();
      toast.info(t('toast.modelDownloadCancelled'));
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

  const downloadedCount = models.filter((model) => model.downloaded).length;
  const loadedCount = models.filter((model) => model.loaded).length;
  const visibleModels = models.filter((model) => {
    if (category === 'all') return true;
    if (category === 'recommended') return isRecommendedModel(model);
    return modelCategory(model) === category;
  });
  const recommendedDownloadModel = models.find((model) => isRecommendedModel(model) && !model.downloaded) ?? models.find((model) => !model.downloaded);
  const guideCategory = guidePreference === 'general' ? 'recommended' : guidePreference;
  const guideRecommendedModel =
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference) && !model.downloaded) ??
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference));
  const categoryItems: Array<{ value: ModelCategory | 'all'; label: string }> = [
    { value: 'recommended', label: t('models.categoryRecommended') },
    { value: 'all', label: t('models.categoryAll') },
    { value: 'apple', label: t('models.categoryApple') },
    { value: 'faster', label: t('models.categoryFaster') },
    { value: 'chinese', label: t('models.categoryChinese') },
    { value: 'whisper', label: t('models.categoryWhisper') },
  ];
  const guideItems: Array<{ value: GuidePreference; label: string }> = [
    { value: 'general', label: t('models.guideGeneral') },
    { value: 'apple', label: t('models.guideApple') },
    { value: 'faster', label: t('models.guideFaster') },
    { value: 'chinese', label: t('models.guideChinese') },
    { value: 'whisper', label: t('models.guideWhisper') },
  ];

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('models.eyebrow')}
          title={t('models.title')}
          description={`${downloadedCount}/${models.length} ${t('models.descriptionDownloaded')} · ${loadedCount} ${t('models.descriptionLoaded')}`}
          action={
            <Button variant="ghost" size="icon" onClick={refresh} title={t('common.refresh')}>
              <RefreshCw className="size-4" />
            </Button>
          }
        />
        <div className="grid gap-4 p-4">
          <div className="flex flex-wrap gap-2">
            {categoryItems.map((item) => (
              <Button key={item.value} size="sm" variant={category === item.value ? 'primary' : 'secondary'} onClick={() => setCategory(item.value)}>
                {item.label}
              </Button>
            ))}
          </div>
          {modelsQuery.error && <ErrorState title={t('common.unableToLoad')} error={modelsQuery.error} />}
          <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
            {visibleModels.map((model) => (
              <ModelDownloadCard
                key={model.model_name}
                model={model}
                progress={progressByModel[model.model_name]}
                description={modelDescription(model, locale)}
                bestFor={modelBestFor(model, locale)}
                onDownload={() => download.mutate(model.model_name)}
                onCancel={() => cancel.mutate(model.model_name)}
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
                  <Button onClick={() => download.mutate(recommendedDownloadModel.model_name)}>
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

      <div className="grid content-start gap-4">
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
                  <Badge tone={guideRecommendedModel.downloaded ? 'success' : 'accent'}>
                    {guideRecommendedModel.downloaded ? t('common.downloaded') : t('models.recommended')}
                  </Badge>
                </div>
                <p className="text-sm leading-6 text-app-muted">{modelDescription(guideRecommendedModel, locale)}</p>
                <p className="text-xs text-app-muted">{modelBestFor(guideRecommendedModel, locale)}</p>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" variant="secondary" onClick={() => setCategory(guideCategory)}>
                    {t('models.showMatches')}
                  </Button>
                  {!guideRecommendedModel.downloaded && (
                    <Button size="sm" onClick={() => download.mutate(guideRecommendedModel.model_name)}>
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
          <PanelHeader eyebrow={t('status.modelDownload')} title={t('models.activeDownloads')} description={`${downloads.length} ${locale === 'zh' ? '进行中' : 'running'}`} />
          <div className="grid gap-3 p-5">
            {downloads.map((download) => (
              <div key={download.model_name} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-zinc-100">{download.model_name}</span>
                  <Badge tone={download.status === 'error' ? 'danger' : download.status === 'complete' ? 'success' : 'warning'}>
                    {download.status}
                  </Badge>
                </div>
                <Progress value={download.progress} />
                <p className="truncate text-xs text-zinc-500">{download.filename ?? download.source ?? t('status.modelDownload')}</p>
              </div>
            ))}
            {downloads.length === 0 && (
              <EmptyState
                title={t('models.noActiveDownloads')}
                body={t('models.downloadProgress')}
                action={recommendedDownloadModel && (
                  <Button onClick={() => download.mutate(recommendedDownloadModel.model_name)}>
                    <DownloadCloud className="size-4" />
                    {t('models.downloadRecommended')}
                  </Button>
                )}
              />
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('settings.storage')} title={t('models.storage')} description={storageQuery.data?.models_dir ?? t('models.storageUnavailable')} />
          <div className="grid gap-4 p-5">
            {storageQuery.error && <ErrorState title={t('common.unableToLoad')} error={storageQuery.error} />}
            <div className="grid grid-cols-2 gap-2">
              <StorageMetric label={t('models.used')} value={formatBytes(storageQuery.data?.used_bytes)} />
              <StorageMetric label={t('models.free')} value={formatBytes(storageQuery.data?.free_bytes)} />
              <StorageMetric label={t('models.total')} value={formatBytes(storageQuery.data?.total_bytes)} />
              <StorageMetric label={t('models.items')} value={String(storageQuery.data?.models?.length ?? 0)} />
            </div>
            <div className="grid max-h-80 gap-2 overflow-auto pr-1">
              {(storageQuery.data?.models ?? []).map((item) => (
                <div key={item.model_name} className="flex items-center justify-between gap-3 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-zinc-200">{item.model_name}</p>
                    <p className="truncate text-xs text-zinc-600">{item.path}</p>
                  </div>
                  <Badge>{formatBytes(item.size_bytes)}</Badge>
                </div>
              ))}
              {(storageQuery.data?.models ?? []).length === 0 && (
                <div className="flex items-center gap-2 rounded-lg border border-white/10 px-3 py-3 text-sm text-zinc-500">
                  <Database className="size-4" />
                  {t('models.noStoredEntries')}
                </div>
              )}
            </div>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-zinc-100">{value}</p>
    </div>
  );
}
