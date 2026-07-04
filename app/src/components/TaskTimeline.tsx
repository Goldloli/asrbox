import type { TaskDiagnostic, TaskLogEntry, TaskVersion } from '../lib/api';
import { formatDate } from '../lib/format';
import { Tabs, TabsContent, TabsList, TabsTrigger } from './weiui';
import { useI18n } from '../lib/i18n';

export function TaskTimeline({
  diagnostics,
  logs,
  versions,
}: {
  diagnostics?: TaskDiagnostic[];
  logs?: TaskLogEntry[];
  versions?: TaskVersion[];
}) {
  const { t, locale } = useI18n();
  return (
    <Tabs defaultValue="diagnostics" className="grid gap-3">
      <TabsList>
        <TabsTrigger value="diagnostics">{t('tasks.diagnostics')}</TabsTrigger>
        <TabsTrigger value="logs">{t('tasks.logs')}</TabsTrigger>
        <TabsTrigger value="versions">{t('tasks.versions')}</TabsTrigger>
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
        <TimelineList
          empty={t('tasks.noVersions')}
          items={(versions ?? []).map((item) => ({
            key: String(item.id),
            title: item.label ?? `${locale === 'zh' ? '版本' : 'Version'} ${item.id}`,
            body: item.text ? `${item.text.slice(0, 160)}${item.text.length > 160 ? '...' : ''}` : t('tasks.snapshotSaved'),
            meta: formatDate(item.created_at),
          }))}
        />
      </TabsContent>
    </Tabs>
  );
}

function TimelineList({
  items,
  empty,
}: {
  items: Array<{ key: string; title: string; body: string; meta: string }>;
  empty: string;
}) {
  if (items.length === 0) return <p className="rounded-lg border border-white/10 px-4 py-8 text-center text-sm text-zinc-500">{empty}</p>;
  return (
    <div className="grid gap-2">
      {items.map((item) => (
        <article key={item.key} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-3">
          <div className="mb-1 flex items-center justify-between gap-3">
            <h4 className="text-xs font-semibold uppercase tracking-[0.14em] text-zinc-400">{item.title}</h4>
            <span className="text-xs text-zinc-600">{item.meta}</span>
          </div>
          <p className="text-sm leading-6 text-zinc-200">{item.body}</p>
        </article>
      ))}
    </div>
  );
}
