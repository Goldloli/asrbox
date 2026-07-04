import { Download, FileDown, Search } from 'lucide-react';
import { useMemo, useState } from 'react';
import { apiClient } from '../lib/api';
import { useTasksQuery } from '../lib/queries';
import { formatDate, formatDuration } from '../lib/format';
import { Button, EmptyState, ErrorState, Input, Panel, PanelHeader } from '../components/weiui';
import { StatusPill } from '../components/StatusPill';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';

export function ExportsPage() {
  const { t } = useI18n();
  const tasksQuery = useTasksQuery();
  const [query, setQuery] = useState('');
  const tasks = tasksQuery.data?.items ?? [];
  const completed = useMemo(
    () =>
      tasks.filter((task) => {
        const matches = `${task.filename} ${task.text ?? ''}`.toLowerCase().includes(query.toLowerCase());
        return task.status === 'completed' && matches;
      }),
    [query, tasks],
  );
  const blocked = tasks.filter((task) => task.status !== 'completed' && task.status !== 'cancelled');

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('exports.eyebrow')}
          title={t('exports.title')}
          description={t('exports.description')}
          action={
            <div className="relative hidden w-64 md:block">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-600" />
              <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t('exports.search')} className="pl-9" />
            </div>
          }
        />
        <div className="grid gap-3 p-4">
          {tasksQuery.error && <ErrorState title={t('common.unableToLoad')} error={tasksQuery.error} />}
          {completed.map((task) => (
            <article key={task.id} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4">
                <div className="min-w-0">
                  <h2 className="truncate text-sm font-semibold text-zinc-100">{task.filename}</h2>
                  <p className="mt-1 text-xs text-zinc-500">
                    {task.completed_at ? formatDate(task.completed_at) : formatDate(task.updated_at)} · {formatDuration(task.duration_ms)}
                  </p>
                </div>
                <StatusPill status={task.status} />
              </div>
              <div className="flex flex-wrap gap-2">
                {getTaskOutputFormats(task).map((format) => (
                  <Button key={format} asChild variant="secondary" size="sm">
                    <a href={apiClient.exportTaskUrl(task.id, format)}>
                      <Download className="size-4" />
                      {format.toUpperCase()}
                    </a>
                  </Button>
                ))}
              </div>
            </article>
          ))}
          {completed.length === 0 && (
            <EmptyState
              title={t('exports.empty')}
              body={t('exports.emptyBody')}
              icon={<FileDown className="size-5" />}
            />
          )}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('tasks.eyebrow')} title={t('exports.waiting')} description={`${blocked.length} ${t('exports.waitingDescription')}`} />
        <div className="grid gap-2 p-4">
          {blocked.slice(0, 8).map((task) => (
            <div key={task.id} className="grid gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-3">
              <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
                <span className="truncate text-sm text-zinc-200">{task.filename}</span>
                <StatusPill status={task.status} />
              </div>
              {task.error && (
                <p className="max-h-24 overflow-auto break-all rounded-lg border border-red-400/20 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-100">
                  {task.error}
                </p>
              )}
            </div>
          ))}
          {blocked.length === 0 && <p className="px-3 py-8 text-center text-sm text-zinc-500">{t('exports.noPending')}</p>}
        </div>
      </Panel>
    </section>
  );
}
