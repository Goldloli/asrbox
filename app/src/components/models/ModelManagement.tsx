import { DownloadCloud, HardDrive, Info, Pause, Play, RefreshCw, Square, Star, Trash2 } from 'lucide-react';
import { type ModelProgress, type ModelStatus } from '../../lib/api';
import { formatBytes, formatPercent } from '../../lib/format';
import { isRecommendedModel, modelCategory } from '../../lib/modelCatalog';
import { useI18n } from '../../lib/i18n';
import { ConfirmAction } from '../ConfirmAction';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, Progress } from '../weiui';

type Translate = ReturnType<typeof useI18n>['t'];

export function createModelGroups(
  models: ModelStatus[],
  progressByModel: Record<string, ModelProgress>,
  pinnedModelNames: string[],
  t: Translate,
) {
  const issues = models.filter((model) => model.compatible === false || Boolean(model.error || model.download_error || model.compatibility_error));
  const downloading = models.filter((model) => model.downloading || progressByModel[model.model_name]);
  const pinned = models.filter((model) => pinnedModelNames.includes(model.model_name));
  const local = models.filter((model) => model.downloaded && !downloading.includes(model) && !pinned.includes(model));
  const recommended = models.filter((model) => isRecommendedModel(model) && model.downloaded === false && !downloading.includes(model) && !pinned.includes(model) && !issues.includes(model));
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

export function ModelListRow({
  model,
  progress,
  pinned,
  description,
  bestFor,
  onTogglePin,
  onDownload,
  onPause,
  onResume,
  onStop,
  onRetry,
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
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onRetry: () => void;
  onUnload: () => void;
  onDelete: () => void;
}) {
  const { t } = useI18n();
  const activeProgress = progress?.progress ?? (model.downloading ? 5 : 0);
  const error = progress?.error ?? model.download_error ?? model.compatibility_error ?? model.error;
  const isActive = model.downloading || Boolean(progress);
  const isPaused = progress?.status === 'paused';
  const hasDownloadError = Boolean(progress?.error || model.download_error);
  const storageUnavailable = model.storage_status === 'unavailable' || model.storage_status === 'migrating' || model.storage_status === 'read_only';

  return (
    <article className="grid gap-2 rounded-lg border app-control px-3 py-3">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="grid size-10 place-items-center rounded-lg border app-control text-app-accent">
          <HardDrive className="size-5" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-app">{model.display_name}</h2>
            <Badge tone={storageUnavailable ? 'danger' : model.downloaded ? 'success' : model.downloading ? 'warning' : 'neutral'}>
              {storageUnavailable ? t('settings.modelStorageUnavailable') : model.downloaded ? t('common.downloaded') : model.downloading ? t('common.downloading') : t('common.notDownloaded')}
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
                    <Button variant="danger" size="sm" disabled={storageUnavailable}>
                      <Trash2 className="size-4" />
                      {t('common.delete')}
                    </Button>
                  </ConfirmAction>
                </div>
              </div>
            </DialogContent>
          </Dialog>
          {isActive ? (
            <>
              <Button variant="secondary" size="sm" onClick={isPaused ? onResume : onPause}>
                {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {isPaused ? t('common.resume') : t('common.pause')}
              </Button>
              <Button variant="danger" size="sm" onClick={onStop}>
                <Square className="size-4" />
                {t('common.stop')}
              </Button>
            </>
          ) : hasDownloadError ? (
            <Button variant="secondary" size="sm" onClick={onRetry} disabled={storageUnavailable}>
              <RefreshCw className="size-4" />
              {t('common.retry')}
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={onDownload} disabled={storageUnavailable}>
              <DownloadCloud className="size-4" />
              {t('common.download')}
            </Button>
          )}
        </div>
      </div>
      {isActive && (
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

export function StorageMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border app-control px-3 py-3">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 truncate text-sm font-medium text-app">{value}</p>
    </div>
  );
}

export function BenchmarkCard({ model }: { model: ModelStatus }) {
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
