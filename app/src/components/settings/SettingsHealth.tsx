import { AlertTriangle, CheckCircle2, CloudOff, Database, Download, HardDrive, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { apiClient, type ModelStorage, type RuntimeStatus } from '../../lib/api';
import { formatBytes } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Badge, Button, Panel, PanelHeader, Switch } from '../weiui';

export function DiagnosticsHealthCenter({
  connected,
  runtime,
  storage,
  modelCount,
  downloadedModelCount,
  recentError,
  onRefresh,
}: {
  connected: boolean;
  runtime?: RuntimeStatus;
  storage?: ModelStorage;
  modelCount: number;
  downloadedModelCount: number;
  recentError?: string | null;
  onRefresh: () => void;
}) {
  const { t } = useI18n();
  const runtimeChecks = runtime
    ? [
        ['ffmpeg', runtime.ffmpeg_available],
        ['ffprobe', runtime.ffprobe_available],
        ['torch', runtime.torch_available],
        ['faster-whisper', runtime.faster_whisper_available],
        ['FunASR', runtime.funasr_available],
        ['MLX', runtime.mlx_available],
        ['Qwen3 ASR', runtime.qwen3_asr_available],
        ['diarization', runtime.diarization_ready],
      ]
    : [];

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        eyebrow={t('settings.healthEyebrow')}
        title={t('settings.healthTitle')}
        description={runtime?.platform ?? t('settings.runtimeUnavailable')}
        action={
          <Button size="sm" variant="secondary" onClick={onRefresh}>
            <RefreshCw className="size-4" />
            {t('common.refresh')}
          </Button>
        }
      />
      <div className="grid gap-4 p-5">
        <div className="grid gap-2 md:grid-cols-2">
          <HealthMetric
            icon={connected ? <CheckCircle2 className="size-4" /> : <CloudOff className="size-4" />}
            title={t('settings.backendConnection')}
            value={connected ? t('status.backendOnline') : t('status.backendOffline')}
            tone={connected ? 'success' : 'danger'}
          />
          <HealthMetric
            icon={<HardDrive className="size-4" />}
            title={t('settings.modelAvailability')}
            value={storage?.available === false ? t('settings.modelStorageUnavailable') : `${downloadedModelCount}/${modelCount} ${t('models.descriptionDownloaded')}`}
            tone={storage?.available === false ? 'danger' : downloadedModelCount > 0 ? 'success' : 'warning'}
          />
          <HealthMetric
            icon={<Database className="size-4" />}
            title={t('settings.freeDisk')}
            value={formatBytes(runtime?.free_disk_bytes ?? storage?.free_bytes)}
            tone={(runtime?.free_disk_bytes ?? storage?.free_bytes ?? 0) > 1_000_000_000 ? 'success' : 'warning'}
          />
          <HealthMetric
            icon={<AlertTriangle className="size-4" />}
            title={t('settings.recentErrors')}
            value={recentError || t('settings.noRecentErrors')}
            tone={recentError ? 'danger' : 'neutral'}
          />
        </div>

        <div className="grid gap-2">
          <h3 className="text-sm font-semibold text-app">{t('settings.runtimeCapabilities')}</h3>
          <div className="grid grid-cols-2 gap-2 md:grid-cols-4">
            {runtimeChecks.map(([label, ok]) => (
              <div key={String(label)} className="flex items-center justify-between gap-2 rounded-lg border app-control px-3 py-2">
                <span className="text-xs text-app-muted">{label}</span>
                {ok ? <CheckCircle2 className="size-4 text-[var(--app-success)]" /> : <CloudOff className="size-4 text-app-faint" />}
              </div>
            ))}
            {runtimeChecks.length === 0 && (
              <p className="rounded-lg border app-control px-3 py-3 text-sm text-app-muted md:col-span-4">{t('settings.runtimeHint')}</p>
            )}
          </div>
        </div>

        <div className="grid gap-2">
          <PathRow label={t('settings.dataPaths')} value={runtime?.data_dir} />
          <PathRow label={t('settings.modelsPath')} value={runtime?.models_dir ?? storage?.models_dir} />
        </div>

        {runtime?.warnings?.length ? (
          <div className="grid gap-2">
            {runtime.warnings.map((warning) => (
              <p key={warning} className="rounded-lg border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] px-3 py-2 text-sm text-app-accent">
                {warning}
              </p>
            ))}
          </div>
        ) : null}

        <Button asChild variant="secondary">
          <a href={apiClient.runtimeDiagnosticBundleUrl()}>
            <Download className="size-4" />
            {t('settings.diagnosticBundle')}
          </a>
        </Button>
      </div>
    </Panel>
  );
}

function HealthMetric({
  icon,
  title,
  value,
  tone,
}: {
  icon: ReactNode;
  title: string;
  value: string;
  tone: 'neutral' | 'success' | 'warning' | 'danger';
}) {
  return (
    <div className="grid gap-2 rounded-lg border app-control px-3 py-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-medium text-app-muted">{title}</span>
        <Badge tone={tone}>{icon}</Badge>
      </div>
      <p className="break-words text-sm font-medium text-app">{value}</p>
    </div>
  );
}

export function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border app-control px-4 py-3">
      <span className="text-sm text-app-soft">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

export function PathRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border app-control px-3 py-2">
      <p className="text-xs text-app-muted">{label}</p>
      <p className="mt-1 break-all text-sm text-app">{value || '-'}</p>
    </div>
  );
}
