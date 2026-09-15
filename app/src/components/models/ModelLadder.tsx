import { useMemo, useState } from 'react';
import { Check, ChevronDown, Minus } from 'lucide-react';
import type { ModelStatus } from '../../lib/api';
import { cn } from '../../lib/cn';
import { useI18n } from '../../lib/i18n';
import { modelLadder, type Tier } from '../../lib/modelCatalog';
import { Badge, Panel, Select } from '../weiui';

const tierRank: Record<Tier, number> = { S: 0, A: 1, B: 2, C: 3 };
const tierTones: Record<Tier, 'accent' | 'success' | 'warning' | 'neutral'> = { S: 'accent', A: 'success', B: 'warning', C: 'neutral' };

type LadderSort = 'balanced' | 'name' | 'speed' | 'accuracy' | 'languages' | 'gpu' | 'cpu' | 'timeline' | 'diarization' | 'downloaded';

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
  const [expanded, setExpanded] = useState(false);
  const [sortBy, setSortBy] = useState<LadderSort>('balanced');
  const rows = useMemo(() => {
    const booleanRank = (value: boolean) => Number(!value);
    const readableName = (model: ModelStatus) => model.display_name || model.model_name;
    const stableNameFallback = (a: ModelStatus, b: ModelStatus) => (
      readableName(a).localeCompare(readableName(b)) || a.model_name.localeCompare(b.model_name)
    );

    return models
      .map((model) => ({ model, ladder: modelLadder(model) }))
      .sort((a, b) => {
        let result = 0;
        switch (sortBy) {
          case 'name':
            return stableNameFallback(a.model, b.model);
          case 'speed':
          case 'accuracy':
          case 'languages':
            result = tierRank[a.ladder[sortBy]] - tierRank[b.ladder[sortBy]];
            break;
          case 'gpu':
            result = booleanRank(a.model.supported_devices.some((device) => device !== 'cpu'))
              - booleanRank(b.model.supported_devices.some((device) => device !== 'cpu'));
            break;
          case 'cpu':
            result = booleanRank(a.model.supported_devices.includes('cpu')) - booleanRank(b.model.supported_devices.includes('cpu'));
            break;
          case 'timeline':
            result = booleanRank(a.model.supports_timestamps) - booleanRank(b.model.supports_timestamps);
            break;
          case 'diarization':
            result = booleanRank(a.model.supports_diarization) - booleanRank(b.model.supports_diarization);
            break;
          case 'downloaded':
            result = booleanRank(a.model.downloaded === true) - booleanRank(b.model.downloaded === true);
            break;
          case 'balanced':
            result = (tierRank[a.ladder.speed] + tierRank[a.ladder.accuracy])
              - (tierRank[b.ladder.speed] + tierRank[b.ladder.accuracy]);
            break;
        }
        return result || stableNameFallback(a.model, b.model);
      });
  }, [models, sortBy]);
  const contentId = 'model-ladder-content';
  const sortOptions: Array<{ value: LadderSort; label: string }> = [
    { value: 'balanced', label: t('models.ladderSortBalanced') },
    { value: 'name', label: t('models.ladderSortName') },
    { value: 'speed', label: t('models.ladderSpeed') },
    { value: 'accuracy', label: t('models.ladderAccuracy') },
    { value: 'languages', label: t('models.ladderLanguages') },
    { value: 'gpu', label: t('models.ladderGpu') },
    { value: 'cpu', label: t('models.ladderCpu') },
    { value: 'timeline', label: t('models.ladderTimeline') },
    { value: 'diarization', label: t('models.ladderDiarization') },
    { value: 'downloaded', label: t('models.ladderDownloaded') },
  ];

  return (
    <Panel className="overflow-hidden">
      <button
        type="button"
        className="flex w-full items-start justify-between gap-4 px-5 py-4 text-left transition hover:bg-[var(--app-control)] focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--app-accent)]/25"
        aria-expanded={expanded}
        aria-controls={contentId}
        onClick={() => setExpanded((current) => !current)}
      >
        <span className="min-w-0">
          <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.16em] text-app-accent">{t('models.ladderEyebrow')}</span>
          <h2 className="text-lg font-semibold text-app">{t('models.ladderTitle')}</h2>
          <span className="mt-1 block text-sm text-app-muted">{t('models.ladderBody')}</span>
        </span>
        <span className="mt-1 inline-flex shrink-0 items-center gap-2 text-xs font-medium text-app-muted">
          {expanded ? t('models.ladderCollapse') : t('models.ladderExpand')}
          <ChevronDown className={cn('size-4 transition-transform', expanded && 'rotate-180')} />
        </span>
      </button>
      {expanded && <div id={contentId} className="border-t app-border">
        <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3">
          <span className="text-xs font-medium text-app-muted">{t('models.ladderSortLabel')}</span>
          <div className="w-full sm:w-56">
            <Select
              value={sortBy}
              onValueChange={(value) => setSortBy(value as LadderSort)}
              options={sortOptions}
              aria-label={t('models.ladderSortLabel')}
            />
          </div>
        </div>
        <div className="overflow-x-auto" data-testid="model-ladder-table-scroll">
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
      </div>}
    </Panel>
  );
}
