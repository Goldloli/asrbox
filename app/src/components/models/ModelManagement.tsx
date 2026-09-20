import { useState } from 'react';
import { DownloadCloud, Info, Pause, Play, RefreshCw, Square, Star, Trash2 } from 'lucide-react';
import { BrandIcon } from '../BrandIcon';
import { type ModelProgress, type ModelStatus } from '../../lib/api';
import { formatBytes, formatPercent } from '../../lib/format';
import { isRecommendedModel, modelCategory, type ModelDetails } from '../../lib/modelCatalog';
import { modelDeviceLabelKeys, modelDeviceSummaryKey } from '../../lib/modelDevices';
import { useI18n } from '../../lib/i18n';
import { ConfirmAction } from '../ConfirmAction';
import { Badge, Button, Progress } from '../weiui';
import { localizedErrorPresentation } from '../../lib/errorMessages';
import { LocalizedTechnicalMessage } from '../LocalizedTechnicalMessage';

type Translate = ReturnType<typeof useI18n>['t'];

function modelCompatibilityIssue(model: ModelStatus, t: Translate, downloadPending: boolean): string | null {
  if (!model.compatibility_error) return null;
  switch (model.compatibility_error_code) {
    case 'model_not_downloaded':
      return downloadPending ? null : t('models.issueNotDownloaded');
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
  const { locale, t } = useI18n();
  const activeProgress = progress?.progress ?? (model.downloading ? 5 : 0);
  const isActive = model.downloading || Boolean(progress);
  const downloadError = progress?.error ?? model.download_error;
  const compatibilityIssue = modelCompatibilityIssue(model, t, isActive);
  // A compatibility hint is already user-facing copy; running it through the
  // error mapper would replace it with the generic "operation failed" fallback.
  const errorMessage = downloadError
    ? localizedErrorPresentation(new Error(downloadError), locale)
    : compatibilityIssue
      ? { summary: compatibilityIssue, detail: model.compatibility_error ?? '' }
      : model.error
        ? localizedErrorPresentation(new Error(model.error), locale)
        : null;
  const isPaused = progress?.status === 'paused';
  const hasDownloadError = Boolean(downloadError);
  const storageUnavailable = model.storage_status === 'unavailable' || model.storage_status === 'migrating' || model.storage_status === 'read_only';
  const deviceLabels = modelDeviceLabelKeys(model.supported_devices);
  const [introOpen, setIntroOpen] = useState(false);
  const speedGrade = model.engine.includes('mlx') || model.model_size.includes('tiny') || model.model_size.includes('small') ? 'S' : model.model_size.includes('large') ? 'A' : 'A';
  const accuracyGrade = model.model_size.includes('large') || model.model_name.includes('qwen') ? '高' : '中高';
  const capabilities = [
    model.languages.length > 1 ? t('models.ladderLanguages') : model.languages[0],
    model.supports_timestamps ? t('models.ladderTimeline') : null,
    model.supports_diarization ? t('models.ladderDiarization') : null,
  ].filter(Boolean).slice(0, 3) as string[];

  return (
    <article data-testid="model-row" className="grid gap-2 border-b app-border px-4 py-3 last:border-b-0 min-[1100px]:grid-cols-[minmax(220px,1.7fr)_70px_50px_60px_minmax(120px,1fr)_110px_180px] min-[1100px]:items-center min-[1100px]:gap-3">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid size-9 shrink-0 place-items-center rounded-lg border app-control text-app-accent">
          <BrandIcon name={`${model.model_name} ${model.engine} ${model.repo_id ?? ''}`} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <h2 className="truncate text-[15px] font-semibold text-app">{model.display_name}</h2>
            {isRecommendedModel(model) && <Badge tone="warning">{t('models.recommended')}</Badge>}
            <Badge className="h-5 w-fit px-2 text-[10px]" tone="neutral">{t(modelDeviceSummaryKey(model.supported_devices))}</Badge>
          </div>
          <p className="mt-1 truncate text-xs text-app-muted">{description}</p>
        </div>
      </div>
      <div className="text-sm text-app-soft">{formatBytes(model.size_mb * 1024 * 1024)}</div>
      <div className="text-base font-semibold text-[var(--app-success)]">{speedGrade}</div>
      <div className="text-sm font-semibold text-[var(--app-success)]">{accuracyGrade}</div>
      <div className="flex min-w-0 flex-wrap gap-1.5">
        {capabilities.map((item) => <Badge key={item}>{item}</Badge>)}
      </div>
      <div className="grid gap-1">
        <Badge className="w-fit" tone={storageUnavailable ? 'danger' : model.downloaded ? 'success' : model.downloading ? 'warning' : 'neutral'}>
          {storageUnavailable ? t('settings.modelStorageUnavailable') : model.downloaded ? t('common.downloaded') : model.downloading ? t('common.downloading') : t('common.notDownloaded')}
        </Badge>
        {isDefault && <Badge className="w-fit" tone="warning">{t('models.currentDefault')}</Badge>}
        {model.compatible === false && <Badge className="w-fit" tone="danger">{t('common.incompatible')}</Badge>}
      </div>
      <div className="flex flex-wrap justify-end gap-1.5 min-[1100px]:flex-nowrap">
          {onSetDefault && model.downloaded && model.compatible !== false && !isDefault && (
            <Button type="button" size="sm" variant="secondary" className="whitespace-nowrap" onClick={onSetDefault}>
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
          <Button
            type="button"
            size="icon"
            variant={introOpen ? 'primary' : 'ghost'}
            aria-label={t('models.modelIntro')}
            title={t('models.modelIntro')}
            aria-expanded={introOpen}
            onClick={() => setIntroOpen((value) => !value)}
          >
            <Info className="size-4" />
          </Button>
          {isActive ? null : hasDownloadError ? (
            <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={onRetry} disabled={storageUnavailable}>
              <RefreshCw className="size-4" />
              {t('common.retry')}
            </Button>
          ) : model.downloaded ? null : (
            <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={onDownload} disabled={storageUnavailable}>
              <DownloadCloud className="size-4" />
              {t('common.download')}
            </Button>
          )}
      </div>
      {isActive && (
        <div className="col-span-full grid gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <span className="min-w-0 flex-1 truncate text-xs text-app-muted">{progress?.filename ?? progress?.status ?? t('common.downloading')}</span>
            <span className="text-xs text-app-muted">{formatPercent(activeProgress)}</span>
            <div className="flex gap-1.5">
              <Button variant="secondary" size="sm" className="whitespace-nowrap" onClick={isPaused ? onResume : onPause}>
                {isPaused ? <Play className="size-4" /> : <Pause className="size-4" />}
                {isPaused ? t('common.resume') : t('common.pause')}
              </Button>
              <Button variant="danger" size="sm" className="whitespace-nowrap" onClick={onStop}>
                <Square className="size-4" />
                {t('common.stop')}
              </Button>
            </div>
          </div>
          <Progress value={activeProgress} />
        </div>
      )}
      {errorMessage && (
        <LocalizedTechnicalMessage
          message={errorMessage}
          className={`rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]${isActive ? ' col-span-full' : ''}`}
        />
      )}
      {introOpen && (
        <div className="col-span-full grid gap-4 rounded-xl border app-border bg-[var(--app-control)] p-4">
          <p className="text-sm leading-6 text-app-soft">{description}</p>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <ModelIntroSection title={t('models.detailCapabilities')} items={details.capabilities} />
            <ModelIntroSection title={t('models.detailLanguages')} items={[details.languages]} />
            <ModelIntroSection title={t('models.deviceSupport')} items={deviceLabels.map((key) => t(key))} />
            <ModelIntroSection title={t('models.detailLimitations')} items={details.limitations} />
          </div>
          <p className="text-xs leading-5 text-app-muted">{t('models.deviceSupportHint')}</p>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t app-border pt-3">
            <div className="flex flex-wrap gap-2">
              {model.languages.map((language) => <Badge key={language}>{language}</Badge>)}
              {model.loaded && <Badge tone="accent">{t('common.loaded')}</Badge>}
              {model.cache_detected && <Badge tone="neutral">{formatBytes((model.cache_size_mb ?? 0) * 1024 * 1024)}</Badge>}
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              <ConfirmAction title={t('confirm.unloadTitle')} description={t('confirm.unloadModelDescription')} confirmLabel={t('common.unload')} tone="secondary" onConfirm={onUnload}>
                <Button variant="secondary" size="sm">{t('common.unload')}</Button>
              </ConfirmAction>
              <ConfirmAction title={t('confirm.deleteTitle')} description={t('confirm.deleteModelDescription')} confirmLabel={t('common.delete')} onConfirm={onDelete}>
                <Button variant="danger" size="sm" disabled={storageUnavailable}><Trash2 className="size-4" />{t('common.delete')}</Button>
              </ConfirmAction>
            </div>
          </div>
        </div>
      )}
    </article>
  );
}

function ModelIntroSection({ title, items }: { title: string; items: string[] }) {
  return (
    <section className="min-w-0">
      <h3 className="text-xs font-semibold uppercase tracking-[0.08em] text-app-muted">{title}</h3>
      <div className="mt-2 grid gap-1.5">
        {items.map((item) => <p key={item} className="text-sm leading-6 text-app-soft">{item}</p>)}
      </div>
    </section>
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
