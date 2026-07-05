import { useMemo, useState } from 'react';
import type { TaskDiagnostic, TaskLogEntry, TaskQuality, TaskVersion } from '../lib/api';
import { formatDate } from '../lib/format';
import { Badge, Button, Progress, Tabs, TabsContent, TabsList, TabsTrigger } from './weiui';
import { useI18n } from '../lib/i18n';

export type TaskTimelineTab = 'diagnostics' | 'logs' | 'versions' | 'quality';

export function TaskTimeline({
  diagnostics,
  logs,
  versions,
  quality,
  currentText,
  value,
  onValueChange,
}: {
  diagnostics?: TaskDiagnostic[];
  logs?: TaskLogEntry[];
  versions?: TaskVersion[];
  quality?: TaskQuality;
  currentText?: string | null;
  value?: TaskTimelineTab;
  onValueChange?: (value: TaskTimelineTab) => void;
}) {
  const { t } = useI18n();
  return (
    <Tabs
      value={value}
      defaultValue="diagnostics"
      onValueChange={(nextValue) => onValueChange?.(nextValue as TaskTimelineTab)}
      className="grid gap-3"
    >
      <TabsList>
        <TabsTrigger value="diagnostics">{t('tasks.diagnostics')}</TabsTrigger>
        <TabsTrigger value="logs">{t('tasks.logs')}</TabsTrigger>
        <TabsTrigger value="versions">{t('tasks.versions')}</TabsTrigger>
        <TabsTrigger value="quality">{t('tasks.quality')}</TabsTrigger>
      </TabsList>
      <TabsContent value="diagnostics">
        <TimelineList
          empty={t('tasks.noDiagnostics')}
          items={(diagnostics ?? []).map((item) => ({
            key: String(item.id),
            title: item.stage,
            body: item.message,
            meta: `${item.error_code ?? 'info'} · ${formatDate(item.created_at)}`,
          }))}
        />
      </TabsContent>
      <TabsContent value="logs">
        <TimelineList
          empty={t('tasks.noLogs')}
          items={(logs ?? []).map((item, index) => ({
            key: String(item.id ?? index),
            title: item.level ?? item.stage ?? 'log',
            body: item.message,
            meta: formatDate(item.created_at ?? item.timestamp ?? ''),
          }))}
        />
      </TabsContent>
      <TabsContent value="versions">
        <VersionHistoryList versions={versions ?? []} currentText={currentText ?? ''} />
      </TabsContent>
      <TabsContent value="quality">
        <QualityPanel quality={quality} />
      </TabsContent>
    </Tabs>
  );
}

function QualityPanel({ quality }: { quality?: TaskQuality }) {
  const { t } = useI18n();

  if (!quality) return <p className="rounded-lg border app-border px-4 py-8 text-center text-sm text-app-muted">{t('tasks.noQuality')}</p>;

  const warnings = quality.warnings ?? [];
  const metrics = Object.entries(quality.metrics ?? {});
  const overlapCount = Number(quality.metrics?.overlap_count ?? 0);
  const invalidTimeCount = Number(quality.metrics?.invalid_time_count ?? 0);
  const score = Math.max(0, Math.min(100, 100 - warnings.length * 18 - overlapCount * 8 - invalidTimeCount * 12));

  return (
    <div className="grid gap-3">
      <div className="rounded-lg border app-control p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h4 className="text-sm font-semibold text-app">{t('tasks.qualityScore')}</h4>
          <Badge tone={warnings.length > 0 ? 'warning' : 'success'}>{score}</Badge>
        </div>
        <Progress value={score} />
      </div>

      <div className="rounded-lg border app-control p-3">
        <h4 className="mb-2 text-sm font-semibold text-app">{t('tasks.qualityWarnings')}</h4>
        {warnings.length > 0 ? (
          <div className="flex flex-wrap gap-2">
            {warnings.map((warning) => <Badge key={warning} tone="warning">{warning}</Badge>)}
          </div>
        ) : (
          <p className="text-sm text-app-muted">{t('tasks.noQualityWarnings')}</p>
        )}
      </div>

      <div className="rounded-lg border app-control p-3">
        <h4 className="mb-2 text-sm font-semibold text-app">{t('tasks.qualityMetrics')}</h4>
        {metrics.length > 0 ? (
          <div className="grid grid-cols-2 gap-2 text-xs">
            {metrics.map(([key, value]) => (
              <div key={key} className="rounded-lg border app-border px-3 py-2">
                <p className="truncate text-app-muted">{key}</p>
                <p className="mt-1 truncate text-app">{String(value)}</p>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-app-muted">{t('tasks.noQuality')}</p>
        )}
      </div>
    </div>
  );
}

function VersionHistoryList({ versions, currentText }: { versions: TaskVersion[]; currentText: string }) {
  const { t, locale } = useI18n();
  const [compareVersionId, setCompareVersionId] = useState<string | number | null>(null);
  const selectedVersion = versions.find((version) => version.id === compareVersionId);
  const diffLines = useMemo(() => (
    selectedVersion ? diffTextLines(selectedVersion.text ?? '', currentText) : []
  ), [currentText, selectedVersion]);

  if (versions.length === 0) return <p className="rounded-lg border app-border px-4 py-8 text-center text-sm text-app-muted">{t('tasks.noVersions')}</p>;

  return (
    <div className="grid gap-3">
      <div className="grid gap-2">
        {versions.map((item) => (
          <article key={item.id} className="rounded-lg border app-control px-3 py-3">
            <div className="mb-1 flex items-center justify-between gap-3">
              <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">
                {item.label ?? `${locale === 'zh' ? '版本' : 'Version'} ${item.id}`}
              </h4>
              <span className="text-xs text-app-faint">{formatDate(item.created_at)}</span>
            </div>
            <p className="text-sm leading-6 text-app-soft">
              {item.text ? `${item.text.slice(0, 160)}${item.text.length > 160 ? '...' : ''}` : t('tasks.snapshotSaved')}
            </p>
            <div className="mt-2">
              <Button variant="secondary" size="sm" onClick={() => setCompareVersionId(item.id)} disabled={!item.text && !currentText}>
                {t('tasks.compareCurrent')}
              </Button>
            </div>
          </article>
        ))}
      </div>

      {selectedVersion && (
        <div className="rounded-lg border app-control p-3">
          <div className="mb-2 flex items-center justify-between gap-3">
            <h4 className="text-sm font-semibold text-app">{t('tasks.textDiff')}</h4>
            <span className="text-xs text-app-muted">{selectedVersion.label ?? `${locale === 'zh' ? '版本' : 'Version'} ${selectedVersion.id}`}</span>
          </div>
          <div className="max-h-72 overflow-auto rounded-lg border app-border bg-[var(--app-bg)] p-2 font-mono text-xs leading-5">
            {diffLines.map((line, index) => (
              <p
                key={`${line.kind}-${index}`}
                className={
                  line.kind === 'added'
                    ? 'bg-[var(--app-success-soft)] text-[var(--app-success)]'
                    : line.kind === 'removed'
                      ? 'bg-[var(--app-danger-soft)] text-[var(--app-danger)]'
                      : 'text-app-muted'
                }
              >
                <span className="mr-2 inline-block w-4 text-center">{line.kind === 'added' ? '+' : line.kind === 'removed' ? '-' : ' '}</span>
                {line.text || ' '}
              </p>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function TimelineList({
  items,
  empty,
}: {
  items: Array<{ key: string; title: string; body: string; meta: string }>;
  empty: string;
}) {
  if (items.length === 0) return <p className="rounded-lg border app-border px-4 py-8 text-center text-sm text-app-muted">{empty}</p>;
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <article key={item.key} className="rounded-lg border app-control px-3 py-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-app-muted">{item.title}</h4>
            <span className="text-xs text-app-faint">{item.meta}</span>
          </div>
          <p className="text-sm leading-6 text-app-soft">{item.body}</p>
        </article>
      ))}
    </div>
  );
}

function diffTextLines(previousText: string, currentText: string) {
  const previousLines = previousText.split('\n');
  const currentLines = currentText.split('\n');
  const rows = previousLines.length + 1;
  const columns = currentLines.length + 1;
  const table = Array.from({ length: rows }, () => Array<number>(columns).fill(0));

  for (let row = previousLines.length - 1; row >= 0; row -= 1) {
    for (let column = currentLines.length - 1; column >= 0; column -= 1) {
      table[row][column] = previousLines[row] === currentLines[column]
        ? table[row + 1][column + 1] + 1
        : Math.max(table[row + 1][column], table[row][column + 1]);
    }
  }

  const result: Array<{ kind: 'same' | 'added' | 'removed'; text: string }> = [];
  let row = 0;
  let column = 0;
  while (row < previousLines.length && column < currentLines.length) {
    if (previousLines[row] === currentLines[column]) {
      result.push({ kind: 'same', text: previousLines[row] });
      row += 1;
      column += 1;
    } else if (table[row + 1][column] >= table[row][column + 1]) {
      result.push({ kind: 'removed', text: previousLines[row] });
      row += 1;
    } else {
      result.push({ kind: 'added', text: currentLines[column] });
      column += 1;
    }
  }
  while (row < previousLines.length) {
    result.push({ kind: 'removed', text: previousLines[row] });
    row += 1;
  }
  while (column < currentLines.length) {
    result.push({ kind: 'added', text: currentLines[column] });
    column += 1;
  }

  return result.slice(0, 200);
}
