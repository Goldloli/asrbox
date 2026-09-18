import { CheckCircle2, XCircle } from 'lucide-react';
import type { RuntimeStatus } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Badge, Panel, PanelHeader } from './weiui';
import { useI18n } from '../lib/i18n';
import { LocalizedTechnicalMessage } from './LocalizedTechnicalMessage';
import { localizeRuntimeWarning } from '../lib/userMessages';

export function RuntimeHealthCard({ runtime }: { runtime?: RuntimeStatus }) {
  const { locale, t } = useI18n();
  const checks = runtime
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
      <PanelHeader title={t('settings.runtime')} eyebrow={t('settings.system')} description={runtime?.platform ?? t('settings.runtimeUnavailable')} />
      <div className="grid gap-4 p-5">
        {runtime ? (
          <>
            <div className="grid grid-cols-2 gap-2 xl:grid-cols-4">
              {checks.map(([label, ok]) => (
                <div key={String(label)} className="flex items-center justify-between gap-2 rounded-lg border app-control px-3 py-2">
                  <span className="text-xs text-app-muted">{label}</span>
                  {ok ? <CheckCircle2 className="size-4 text-[var(--app-success)]" /> : <XCircle className="size-4 text-app-faint" />}
                </div>
              ))}
            </div>
            <div className="flex flex-wrap gap-2">
              <Badge>Python {runtime.python_version}</Badge>
              <Badge>{t('status.freeDisk')} {formatBytes(runtime.free_disk_bytes)}</Badge>
              <Badge>{runtime.models_dir}</Badge>
            </div>
            {runtime.warnings.length > 0 && (
              <div className="grid gap-2">
                {runtime.warnings.map((warning) => (
                  <LocalizedTechnicalMessage
                    key={warning}
                    message={localizeRuntimeWarning(warning, locale)}
                    className="rounded-lg border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] px-3 py-2 text-app-accent"
                  />
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-app-muted">{t('settings.runtimeHint')}</p>
        )}
      </div>
    </Panel>
  );
}
