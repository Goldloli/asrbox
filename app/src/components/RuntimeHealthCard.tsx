import { CheckCircle2, XCircle } from 'lucide-react';
import type { RuntimeStatus } from '../lib/api';
import { formatBytes } from '../lib/format';
import { Badge, Panel, PanelHeader } from './weiui';
import { useI18n } from '../lib/i18n';

export function RuntimeHealthCard({ runtime }: { runtime?: RuntimeStatus }) {
  const { t } = useI18n();
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
                <div key={String(label)} className="flex items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
                  <span className="text-xs text-zinc-400">{label}</span>
                  {ok ? <CheckCircle2 className="size-4 text-emerald-300" /> : <XCircle className="size-4 text-zinc-600" />}
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
                  <p key={warning} className="rounded-lg border border-amber-400/20 bg-amber-400/10 px-3 py-2 text-sm text-amber-100">
                    {warning}
                  </p>
                ))}
              </div>
            )}
          </>
        ) : (
          <p className="text-sm text-zinc-500">{t('settings.runtimeHint')}</p>
        )}
      </div>
    </Panel>
  );
}
