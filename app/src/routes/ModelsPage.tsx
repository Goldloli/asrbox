import { useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BarChart3, Database, DownloadCloud, HardDrive, Info, RefreshCw, Star, Trash2, XCircle } from 'lucide-react';
import { apiClient, getActiveDownloadItems, type ModelProgress, type ModelStatus } from '../lib/api';
import { queryKeys, useActiveDownloadsQuery, useModelStorageQuery, useModelsQuery } from '../lib/queries';
import { formatBytes, formatPercent } from '../lib/format';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, EmptyState, ErrorState, Panel, PanelHeader, Progress } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { isRecommendedModel, modelBestFor, modelCategory, modelDescription, type ModelCategory } from '../lib/modelCatalog';
import { useI18n } from '../lib/i18n';
import { ConfirmAction } from '../components/ConfirmAction';

type GuidePreference = 'general' | Exclude<ModelCategory, 'recommended'>;
type ModelViewCategory = ModelCategory | 'all' | 'pinned';
type Translate = ReturnType<typeof useI18n>['t'];

export function ModelsPage() {
  const queryClient = useQueryClient();
  const { locale, t } = useI18n();
  const toast = useToast();
  const [category, setCategory] = useState<ModelViewCategory>('recommended');
  const [guidePreference, setGuidePreference] = useState<GuidePreference>('general');
  const [pinnedModelNames, setPinnedModelNames] = useState<string[]>([]);
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
  const visibleModels = models
    .filter((model) => {
      if (category === 'all') return true;
      if (category === 'pinned') return pinnedModelNames.includes(model.model_name);
      if (category === 'recommended') return isRecommendedModel(model);
      return modelCategory(model) === category;
    })
    .sort((a, b) => Number(pinnedModelNames.includes(b.model_name)) - Number(pinnedModelNames.includes(a.model_name)));
  const recommendedDownloadModel = models.find((model) => isRecommendedModel(model) && !model.downloaded) ?? models.find((model) => !model.downloaded);
  const guideCategory = guidePreference === 'general' ? 'recommended' : guidePreference;
  const guideRecommendedModel =
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference) && !model.downloaded) ??
    models.find((model) => (guidePreference === 'general' ? isRecommendedModel(model) : modelCategory(model) === guidePreference));
  const benchmarkModels = visibleModels.slice(0, 4);
  const modelGroups = createModelGroups(visibleModels, progressByModel, pinnedModelNames, t);
  const categoryItems: Array<{ value: ModelViewCategory; label: string }> = [
    { value: 'recommended', label: t('models.categoryRecommended') },
    { value: 'pinned', label: t('models.categoryPinned') },
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

  const togglePinnedModel = (modelName: string) => {
    setPinnedModelNames((current) => (
      current.includes(modelName) ? current.filter((name) => name !== modelName) : [...current, modelName]
    ));
  };

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
          <div className="grid gap-4">
            {modelGroups.map((group) => (
              <section key={group.key} className="grid gap-2">
                <div className="flex items-center justify-between gap-3 px-1">
                  <h2 className="text-sm font-semibold text-app">{group.title}</h2>
                  <span className="text-xs text-app-muted">{group.models.length}</span>
                </div>
                <div className="grid gap-2">
                  {group.models.map((model) => (
                    <ModelListRow
                      key={model.model_name}
                      model={model}
                      progress={progressByModel[model.model_name]}
                      pinned={pinnedModelNames.includes(model.model_name)}
                      description={modelDescription(model, locale)}
                      bestFor={modelBestFor(model, locale)}
                      onTogglePin={() => togglePinnedModel(model.model_name)}
                      onDownload={() => download.mutate(model.model_name)}
                      onCancel={() => cancel.mutate(model.model_name)}
                      onUnload={() => unload.mutate(model.model_name)}
                      onDelete={() => remove.mutate(model.model_name)}
                    />
                  ))}
                </div>
              </section>
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
          <PanelHeader eyebrow={t('models.benchmarkEyebrow')} title={t('models.benchmarkTitle')} description={t('models.benchmarkBody')} />
          <div className="grid gap-3 p-5">
            {benchmarkModels.map((model) => (
              <BenchmarkCard key={model.model_name} model={model} />
            ))}
            {benchmarkModels.length === 0 && (
              <div className="flex items-center gap-2 rounded-lg border app-control px-3 py-3 text-sm text-app-muted">
                <BarChart3 className="size-4" />
                {t('models.noBenchmarkModels')}
              </div>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('status.modelDownload')} title={t('models.activeDownloads')} description={`${downloads.length} ${locale === 'zh' ? '进行中' : 'running'}`} />
          <div className="grid gap-3 p-5">
            {downloads.map((download) => (
              <div key={download.model_name} className="grid gap-2 rounded-xl border app-control p-3">
                <div className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate font-medium text-app">{download.model_name}</span>
                  <Badge tone={download.status === 'error' ? 'danger' : download.status === 'complete' ? 'success' : 'warning'}>
                    {download.status}
                  </Badge>
                </div>
                <Progress value={download.progress} />
                <p className="truncate text-xs text-app-muted">{download.filename ?? download.source ?? t('status.modelDownload')}</p>
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
                <div key={item.model_name} className="flex items-center justify-between gap-3 rounded-lg border app-control px-3 py-2">
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
    </section>
  );
}

function createModelGroups(
  models: ModelStatus[],
  progressByModel: Record<string, ModelProgress>,
  pinnedModelNames: string[],
  t: Translate,
) {
  const issues = models.filter((model) => model.compatible === false || Boolean(model.error || model.download_error || model.compatibility_error));
  const downloading = models.filter((model) => model.downloading || progressByModel[model.model_name]);
  const pinned = models.filter((model) => pinnedModelNames.includes(model.model_name));
  const local = models.filter((model) => model.downloaded && !downloading.includes(model) && !pinned.includes(model));
  const recommended = models.filter((model) => isRecommendedModel(model) && !model.downloaded && !downloading.includes(model) && !pinned.includes(model) && !issues.includes(model));
  const available = models.filter(
    (model) => !issues.includes(model) && !downloading.includes(model) && !pinned.includes(model) && !local.includes(model) && !recommended.includes(model),
  );

  return [
    { key: 'issues', title: t('models.groupIssues'), models: issues },
    { key: 'downloading', title: t('models.groupDownloading'), models: downloading.filter((model) => !issues.includes(model)) },
    { key: 'pinned', title: t('models.groupPinned'), models: pinned.filter((model) => !issues.includes(model) && !downloading.includes(model)) },
    { key: 'local', title: t('models.groupLocal'), models: local.filter((model) => !issues.includes(model)) },
    { key: 'recommended', title: t('models.groupRecommended'), models: recommended },
    { key: 'available', title: t('models.groupAvailable'), models: available },
  ].filter((group) => group.models.length > 0);
}

function ModelListRow({
  model,
  progress,
  pinned,
  description,
  bestFor,
  onTogglePin,
  onDownload,
  onCancel,
  onUnload,
  onDelete,
}: {
  model: ModelStatus;
  progress?: ModelProgress;
  pinned: boolean;
  description: string;
  bestFor: string;
  onTogglePin: () => void;
  onDownload: () => void;
  onCancel: () => void;
  onUnload: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const activeProgress = progress?.progress ?? (model.downloading ? 5 : 0);
  const error = progress?.error ?? model.download_error ?? model.compatibility_error ?? model.error;

  return (
    <article className="grid gap-2 rounded-lg border app-control px-3 py-3">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="grid size-10 place-items-center rounded-lg border app-control text-app-accent">
          <HardDrive className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-app">{model.display_name}</h2>
            <Badge tone={model.downloaded ? 'success' : model.downloading ? 'warning' : 'neutral'}>
              {model.downloaded ? t('common.downloaded') : model.downloading ? t('common.downloading') : t('common.notDownloaded')}
            </Badge>
            {pinned && <Badge tone="accent">{t('models.pinned')}</Badge>}
            {model.compatible === false && <Badge tone="danger">{t('common.incompatible')}</Badge>}
          </div>
          <p className="mt-1 truncate text-xs text-app-muted">
            {model.model_name} · {model.engine} · {model.runtime} · {model.model_size} · {model.size_mb} MB
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          <Button
            type="button"
            size="icon"
            variant={pinned ? 'primary' : 'ghost'}
            onClick={onTogglePin}
            title={pinned ? t('models.unpin') : t('models.pin')}
            aria-label={pinned ? t('models.unpin') : t('models.pin')}
          >
            <Star className={pinned ? 'size-4 fill-current' : 'size-4'} />
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="secondary">
                <Info className="size-4" />
                {t('common.details')}
              </Button>
            </DialogTrigger>
            <DialogContent title={model.display_name}>
              <div className="grid gap-4">
                <p className="text-sm leading-6 text-app-soft">{description}</p>
                <div className="grid gap-2 text-sm md:grid-cols-2">
                  <StorageMetric label={t('models.bestFor')} value={bestFor} />
                  <StorageMetric label={t('models.runtime')} value={model.runtime} />
                  <StorageMetric label={t('models.size')} value={`${model.size_mb} MB`} />
                  <StorageMetric label={t('models.categoryAll')} value={modelCategory(model)} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {model.languages.map((language) => <Badge key={language}>{language}</Badge>)}
                  {model.loaded && <Badge tone="accent">{t('common.loaded')}</Badge>}
                  {model.cache_detected && <Badge tone="neutral">{formatBytes((model.cache_size_mb ?? 0) * 1024 * 1024)}</Badge>}
                </div>
                {error && (
                  <p className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
                    {error}
                  </p>
                )}
                <div className="flex flex-wrap justify-end gap-2">
                  <ConfirmAction
                    title={t('confirm.unloadTitle')}
                    description={t('confirm.unloadModelDescription')}
                    confirmLabel={t('common.unload')}
                    tone="secondary"
                    onConfirm={onUnload}
                  >
                    <Button variant="secondary" size="sm">{t('common.unload')}</Button>
                  </ConfirmAction>
                  <ConfirmAction
                    title={t('confirm.deleteTitle')}
                    description={t('confirm.deleteModelDescription')}
                    confirmLabel={t('common.delete')}
                    onConfirm={onDelete}
                  >
                    <Button variant="danger" size="sm">
                      <Trash2 className="size-4" />
                      {t('common.delete')}
                    </Button>
                  </ConfirmAction>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {model.downloading ? (
            <ConfirmAction
              title={t('confirm.cancelTitle')}
              description={t('confirm.cancelModelDescription')}
              confirmLabel={t('common.cancel')}
              tone="secondary"
              onConfirm={onCancel}
            >
              <Button variant="secondary" size="sm">
                <XCircle className="size-4" />
                {t('common.cancel')}
              </Button>
            </ConfirmAction>
          ) : (
            <Button variant="secondary" size="sm" onClick={onDownload}>
              <DownloadCloud className="size-4" />
              {t('common.download')}
            </Button>
          )}
        </div>
      </div>
      {(model.downloading || progress) && (
        <div className="grid gap-1">
          <div className="flex justify-between gap-3 text-xs text-app-muted">
            <span className="truncate">{progress?.filename ?? progress?.status ?? t('common.downloading')}</span>
            <span>{formatPercent(activeProgress)}</span>
          </div>
          <Progress value={activeProgress} />
        </div>
      )}
      {error && (
        <p className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
          {error}
        </p>
      )}
    </article>
  );
}

function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border app-control px-3 py-3">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-app">{value}</p>
    </div>
  );
}

function BenchmarkCard({ model }: { model: ModelStatus }) {
  const { t } = useI18n();
  const scores = modelBenchmarkScores(model);

  return (
    <article className="grid gap-3 rounded-xl border app-control px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="truncate text-sm font-semibold text-app">{model.display_name}</h3>
          <p className="mt-1 text-xs text-app-muted">{model.engine} · {model.model_size}</p>
        </div>
        <Badge tone="neutral">{t('models.benchmarkEstimated')}</Badge>
      </div>
      <BenchmarkBar label={t('models.benchmarkSpeed')} value={scores.speed} />
      <BenchmarkBar label={t('models.benchmarkAccuracy')} value={scores.accuracy} />
      <BenchmarkBar label={t('models.benchmarkStorage')} value={scores.storage} />
    </article>
  );
}

function BenchmarkBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="grid gap-1.5">
      <div className="flex justify-between gap-3 text-xs text-app-muted">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <Progress value={value} />
    </div>
  );
}

function modelBenchmarkScores(model: ModelStatus) {
  const size = model.model_size.toLowerCase();
  const sizeSpeed = size.includes('tiny') ? 95 : size.includes('base') ? 86 : size.includes('small') ? 74 : size.includes('medium') ? 58 : 42;
  const runtimeBoost = model.runtime.toLowerCase().includes('mlx') || model.engine.toLowerCase().includes('faster') ? 10 : 0;
  const accuracy = size.includes('large') ? 92 : size.includes('medium') ? 78 : size.includes('small') ? 64 : 52;
  const storage = Math.max(20, Math.min(95, Math.round(100 - model.size_mb / 45)));

  return {
    speed: Math.min(98, sizeSpeed + runtimeBoost),
    accuracy: Math.min(98, accuracy + (model.supports_word_timestamps ? 3 : 0) + (model.supports_diarization ? 3 : 0)),
    storage,
  };
}
