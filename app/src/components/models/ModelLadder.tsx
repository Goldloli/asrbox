import { Check, Minus } from 'lucide-react';
import type { ModelStatus } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useI18n } from '../../lib/i18n';
import { modelLadder, type Tier } from '../../lib/modelCatalog';
import { Badge, Panel, PanelHeader } from '../weiui';

const tierRank: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3 };
const tierTones: Record<Tier, 'accent' | 'success' | 'warning' | 'neutral'> = { S: 'accent', A: 'success', B: 'warning', C: 'neutral' };

function TierBadge({ tier, estimated }: { tier: Tier; estimated: boolean }) {
  return <Badge tone={tierTones[tier]}>{estimated ? `${tier}*` : tier}</Badge>;
}

function CapabilityMark({ supported, label }: { supported: boolean; label: string }) {
  return (
    <span className="flex justify-center" title={label}>
      {supported
        ? <Check className="size-4 text-[var(--app-success)]" aria-label={label} />
        : <Minus className="size-4 text-app-faint" aria-label={label} />}
    </span>
  );
}

export function ModelLadder({ models }: { models: ModelStatus[] }) {
  const { t } = useI18n();
  const rows = models
    .map((model) => ({ model, ladder: modelLadder(model) }))
    .sort((a, b) => (
      (tierRank[a.ladder.speed] + tierRank[a.ladder.accuracy]) - (tierRank[b.ladder.speed] + tierRank[b.ladder.accuracy]) ||
      tierRank[a.ladder.speed] - tierRank[b.ladder.speed] ||
      Number(b.model.downloaded === true) - Number(a.model.downloaded === true) ||
      a.model.model_name.localeCompare(b.model.model_name)
    ));

  return (
    <Panel className="overflow-hidden">
      <PanelHeader eyebrow={t('models.ladderEyebrow')} title={t('models.ladderTitle')} description={t('models.ladderBody')} />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <thead>
            <tr className="border-b app-border text-xs text-app-muted">
              <th className="px-5 py-2.5 text-left font-medium">{t('models.ladderModel')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderSpeed')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderAccuracy')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderLanguages')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderGpu')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderCpu')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderTimeline')}</th>
              <th className="px-3 py-2.5 text-center font-medium">{t('models.ladderDiarization')}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(({ model, ladder }) => (
              <tr key={model.model_name} className="border-b app-border last:border-b-0">
                <td className="px-5 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn('size-2 shrink-0 rounded-full', model.downloaded ? 'bg-[var(--app-success)]' : 'bg-[var(--app-control-strong)]')}
                      title={model.downloaded ? t('models.ladderDownloaded') : t('models.ladderNotDownloaded')}
                    />
                    <span className="truncate font-medium text-app">{model.display_name}</span>
                  </div>
                </td>
                <td className="px-3 py-2.5 text-center"><TierBadge tier={ladder.speed} estimated={ladder.estimated} /></td>
                <td className="px-3 py-2.5 text-center"><TierBadge tier={ladder.accuracy} estimated={ladder.estimated} /></td>
                <td className="px-3 py-2.5 text-center"><TierBadge tier={ladder.languages} estimated={ladder.estimated} /></td>
                <td className="px-3 py-2.5">
                  <CapabilityMark
                    supported={model.supported_devices.some((device) => device !== 'cpu')}
                    label={model.supported_devices.some((device) => device !== 'cpu') ? t('models.ladderSupported') : t('models.ladderUnsupported')}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <CapabilityMark
                    supported={model.supported_devices.includes('cpu')}
                    label={model.supported_devices.includes('cpu') ? t('models.ladderSupported') : t('models.ladderUnsupported')}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <CapabilityMark
                    supported={model.supports_timestamps}
                    label={model.supports_timestamps ? t('models.ladderSupported') : t('models.ladderUnsupported')}
                  />
                </td>
                <td className="px-3 py-2.5">
                  <CapabilityMark
                    supported={model.supports_diarization}
                    label={model.supports_diarization ? t('models.ladderSupported') : t('models.ladderUnsupported')}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="grid gap-1.5 border-t app-border px-5 py-3 text-xs text-app-muted">
        <p className="flex flex-wrap items-center gap-1.5">
          <Badge tone="accent">S</Badge>
          <Badge tone="success">A</Badge>
          <Badge tone="warning">B</Badge>
          <Badge tone="neutral">C</Badge>
          <span>{t('models.ladderLegend')}</span>
        </p>
        <p>{t('models.ladderNote')}</p>
      </div>
    </Panel>
  );
}
