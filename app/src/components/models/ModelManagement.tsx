import { useState } from 'react';
import { ChevronDown, ChevronRight, DownloadCloud, Info, Pause, Play, RefreshCw, Square, Star, Trash2 } from 'lucide-react';
import { BrandIcon } from '../BrandIcon';
import { type ModelProgress, type ModelStatus } from '../../lib/api';
import { formatBytes, formatPercent } from '../../lib/format';
import { isRecommendedModel, modelCategory, type ModelDetails } from '../../lib/modelCatalog';
import { modelDeviceLabelKeys, modelDeviceSummaryKey } from '../../lib/modelDevices';
import { useI18n } from '../../lib/i18n';
import { ConfirmAction } from '../ConfirmAction';
import { Badge, Button, Dialog, DialogContent, DialogTrigger, Progress } from '../weiui';

type Translate = ReturnType<typeof useI18n>['t'];

function modelCompatibilityIssue(model: ModelStatus, t: Translate): string | null {
  if (!model.compatibility_error) return null;
  switch (model.compatibility_error_code) {
    case 'model_not_downloaded':
      return t('models.issueNotDownloaded');
    case 'missing_files':
      return t('models.issueMissingFiles');
    case 'unknown_model':
      return t('models.issueUnknownModel');
    case 'runtime_incompatible':
      return t('models.issueRuntimeIncompatible');
    default:
      return model.compatibility_error;
  }
}

const categoryLabelKeys = {
  diarization: 'models.categoryDiarization',
  apple: 'models.categoryApple',
  chinese: 'models.categoryChinese',
  faster: 'models.categoryFaster',
  whisper: 'models.categoryWhisper',
} as const;

export function createModelGroups(
  models: ModelStatus[],
  progressByModel: Record<string, ModelProgress>,
  pinnedModelNames: string[],
  t: Translate,
) {
  const issues = models.filter((model) => Boolean(model.error || model.download_error) || Boolean(model.compatibility_error && model.compatibility_error_code !== 'model_not_downloaded'));
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
  details,
  isDefault,
  onSetDefault,
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
  details: ModelDetails;
  isDefault?: boolean;
  onSetDefault?: () => void;
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
  const [detailsExpanded, setDetailsExpanded] = useState(false);
  const activeProgress = progress?.progress ?? (model.downloading ? 5 : 0);
  const error = progress?.error ?? model.download_error ?? modelCompatibilityIssue(model, t) ?? model.error;
  const isActive = model.downloading || Boolean(progress);
  const isPaused = progress?.status === 'paused';
  const hasDownloadError = Boolean(progress?.error || model.download_error);
  const storageUnavailable = model.storage_status === 'unavailable' || model.storage_status === 'migrating' || model.storage_status === 'read_only';
  const deviceLabels = modelDeviceLabelKeys(model.supported_devices);

  return (
    <article data-testid="model-row" className="grid gap-2 rounded-lg border app-control px-3 py-3">
      <div className="grid gap-3 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
        <div className="grid size-10 place-items-center rounded-lg border app-control text-app-accent">
          <BrandIcon name={`${model.model_name} ${model.engine}`} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-app">{model.display_name}</h2>
            {isDefault && <Badge tone="accent">{t('models.currentDefault')}</Badge>}
            <Badge tone={storageUnavailable ? 'danger' : model.downloaded ? 'success' : model.downloading ? 'warning' : 'neutral'}>
              {storageUnavailable ? t('settings.modelStorageUnavailable') : model.downloaded ? t('common.downloaded') : model.downloading ? t('common.downloading') : t('common.notDownloaded')}
            </Badge>
            {pinned && <Badge tone="accent">{t('models.pinned')}</Badge>}
            {model.compatible === false && <Badge tone="danger">{t('common.incompatible')}</Badge>}
            <Badge tone="accent">{t(modelDeviceSummaryKey(model.supported_devices))}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-app-muted">
            {model.model_name} · {model.engine} · {model.runtime} · {model.model_size} · {model.size_mb} MB
          </p>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {onSetDefault && model.downloaded && model.compatible !== false && !isDefault && (
            <Button type="button" size="sm" variant="secondary" onClick={onSetDefault}>
              {t('models.setDefault')}
            </Button>
          )}
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
                  <StorageMetric label={t('models.deviceSupport')} value={deviceLabels.map((key) => t(key)).join(' / ')} />
                  <StorageMetric label={t('models.size')} value={`${model.size_mb} MB`} />
                  <StorageMetric label={t('models.categoryLabel')} value={t(categoryLabelKeys[modelCategory(model)])} />
                </div>
                <div className="flex flex-wrap gap-2">
                  {model.languages.map((language) => <Badge key={language}>{language}</Badge>)}
                  {model.loaded && <Badge tone="accent">{t('common.loaded')}</Badge>}
                  {model.cache_detected && <Badge tone="neutral">{formatBytes((model.cache_size_mb ?? 0) * 1024 * 1024)}</Badge>}
                </div>
                <p className="text-xs leading-5 text-app-muted">{t('models.deviceSupportHint')}</p>
                {error && (
                  <p className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]">
                    {error}
                  </p>
                )}
                {model.compatibility_error_code && model.compatibility_error && model.compatibility_error !== error && (
                  <p className="text-xs leading-5 text-app-muted">{model.compatibility_error}</p>
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
      <div className="grid gap-2">
        <div>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setDetailsExpanded((current) => !current)}
            aria-expanded={detailsExpanded}
          >
            {detailsExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
            {t('models.modelIntro')}
          </Button>
        </div>
        {detailsExpanded && (
          <div className="grid gap-3 rounded-lg border app-control px-3 py-3">
            {details.capabilities.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-app-muted">{t('models.detailCapabilities')}</p>
                <div className="flex flex-wrap gap-1.5">
                  {details.capabilities.map((item) => <Badge key={item}>{item}</Badge>)}
                </div>
              </div>
            )}
            <div className="grid gap-1.5">
              <p className="text-xs text-app-muted">{t('models.detailLanguages')}</p>
              <p className="text-sm text-app-soft">{details.languages}</p>
            </div>
            <div className="grid gap-1.5">
              <p className="text-xs text-app-muted">{t('models.deviceSupport')}</p>
              <div className="flex flex-wrap gap-1.5">
                {deviceLabels.map((key) => <Badge key={key} tone={key === 'models.deviceCpu' ? 'neutral' : 'accent'}>{t(key)}</Badge>)}
              </div>
              <p className="text-xs leading-5 text-app-muted">{t('models.deviceSupportHint')}</p>
            </div>
            {details.bestFor.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-app-muted">{t('models.bestFor')}</p>
                <ul className="grid gap-1 text-sm text-app-soft">
                  {details.bestFor.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
            {details.limitations.length > 0 && (
              <div className="grid gap-1.5">
                <p className="text-xs text-app-muted">{t('models.detailLimitations')}</p>
                <ul className="grid gap-1 text-sm text-app-soft">
                  {details.limitations.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}
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
