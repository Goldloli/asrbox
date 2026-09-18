import { DownloadCloud, HardDrive, Star, Trash2, XCircle } from 'lucide-react';
import type { ModelProgress, ModelStatus } from '../lib/api';
import { formatPercent } from '../lib/format';
import { Badge, Button, Panel, Progress } from './weiui';
import { useI18n } from '../lib/i18n';
import { ConfirmAction } from './ConfirmAction';
import { localizedErrorPresentation } from '../lib/errorMessages';
import { LocalizedTechnicalMessage } from './LocalizedTechnicalMessage';

export function ModelDownloadCard({
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
  const { locale, t } = useI18n();
  const activeProgress = progress?.progress ?? (model.downloading ? 5 : 0);
  const storageUnavailable = model.storage_status !== 'available';

  return (
    <Panel className="overflow-hidden">
      <div className="grid gap-4 p-5">
        <div className="flex items-start justify-between gap-4">
          <div className="flex min-w-0 gap-3">
            <div className="grid size-10 shrink-0 place-items-center rounded-lg border app-control text-app-accent">
              <HardDrive className="size-5" />
            </div>
            <div className="min-w-0">
              <h2 className="truncate text-sm font-semibold text-app">{model.display_name}</h2>
              <p className="mt-1 text-xs text-app-muted">
                {model.engine} · {model.runtime} · {model.model_size} · {model.size_mb} MB
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
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
            <Badge tone={storageUnavailable ? 'danger' : model.downloaded ? 'success' : model.downloading ? 'warning' : 'neutral'}>
              {storageUnavailable ? t('settings.modelStorageUnavailable') : model.downloaded ? t('common.downloaded') : model.downloading ? t('common.downloading') : t('common.notDownloaded')}
            </Badge>
          </div>
        </div>
        <p className="text-sm leading-6 text-app-soft">{description}</p>
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="rounded-lg border app-control px-3 py-2">
            <p className="text-app-muted">{t('models.bestFor')}</p>
            <p className="mt-1 text-app">{bestFor}</p>
          </div>
          <div className="rounded-lg border app-control px-3 py-2">
            <p className="text-app-muted">{t('models.runtime')}</p>
            <p className="mt-1 text-app">{model.runtime}</p>
          </div>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {model.languages.map((language) => <Badge key={language}>{language}</Badge>)}
          {pinned && <Badge tone="accent">{t('models.pinned')}</Badge>}
          {model.loaded && <Badge tone="accent">{t('common.loaded')}</Badge>}
          {model.compatible === false && <Badge tone="danger">{t('common.incompatible')}</Badge>}
        </div>
        {(model.downloading || progress) && (
          <div className="grid gap-2">
            <div className="flex justify-between gap-3 text-xs text-app-muted">
              <span className="truncate">{progress?.filename ?? progress?.status ?? t('common.downloading')}</span>
              <span>{formatPercent(activeProgress)}</span>
            </div>
            <Progress value={activeProgress} />
          </div>
        )}
        {(model.compatibility_error || model.download_error || model.error || progress?.error) && (
          <LocalizedTechnicalMessage
            message={localizedErrorPresentation(new Error(progress?.error ?? model.download_error ?? model.compatibility_error ?? model.error ?? ''), locale)}
            className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2 text-xs text-[var(--app-danger)]"
          />
        )}
        <div className="flex flex-wrap justify-end gap-2">
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
            <Button variant="secondary" size="sm" onClick={onDownload} disabled={storageUnavailable}>
              <DownloadCloud className="size-4" />
              {t('common.download')}
            </Button>
          )}
          <ConfirmAction
            title={t('confirm.unloadTitle')}
            description={t('confirm.unloadModelDescription')}
            confirmLabel={t('common.unload')}
            tone="secondary"
            onConfirm={onUnload}
          >
            <Button variant="ghost" size="sm">{t('common.unload')}</Button>
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
    </Panel>
  );
}
