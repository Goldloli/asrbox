import { Download, FileText } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDuration, formatPercent } from '../lib/format';
import { Button, EmptyState, Panel, PanelHeader, Progress, Textarea } from './weiui';
import { StatusPill } from './StatusPill';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';

export function TranscriptViewer({ task }: { task?: TranscriptionTask }) {
  const { t } = useI18n();
  if (!task) {
    return (
      <Panel className="min-h-[calc(100dvh-160px)]">
        <EmptyState
          title={t('transcript.emptyTitle')}
          body={t('transcript.emptyBody')}
          icon={<FileText className="size-5" />}
          action={
            <Button asChild>
              <Link to="/">{t('transcribe.start')}</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  return (
    <Panel className="min-h-[calc(100dvh-160px)] overflow-hidden">
      <PanelHeader
        eyebrow={t('transcript.title')}
        title={task.filename}
        description={`${formatPercent(task.progress)} · ${formatDuration(task.duration_ms)}`}
        action={<StatusPill status={task.status} />}
      />
      <div className="grid gap-5 p-5">
        <Progress value={task.progress} />
        {task.error && (
          <div className="rounded-lg border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100">
            {task.error_code && <p className="mb-1 font-medium">{task.error_code}</p>}
            <p>{task.error}</p>
          </div>
        )}
        <section className="grid gap-2">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-sm font-semibold text-zinc-100">{t('transcript.text')}</h2>
            {task.status === 'completed' && (
              <div className="flex shrink-0 flex-wrap justify-end gap-2">
                {getTaskOutputFormats(task).map((format) => (
                  <Button key={format} asChild variant="secondary" size="sm">
                    <a href={apiClient.exportTaskUrl(task.id, format)}>
                      <Download className="size-4" />
                      {format.toUpperCase()}
                    </a>
                  </Button>
                ))}
              </div>
            )}
          </div>
          <Textarea value={task.text ?? ''} readOnly placeholder={t('transcript.placeholder')} className="min-h-56 font-mono text-[13px]" />
        </section>
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-zinc-100">{t('transcript.segments')}</h2>
          <div className="max-h-[36vh] overflow-auto rounded-lg border border-white/10">
            {task.segments.length > 0 ? (
              task.segments.map((segment) => (
                <div key={segment.id} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-white/10 px-3 py-3 last:border-b-0">
                  <time className="font-mono text-xs text-zinc-500">
                    {segment.start.toFixed(2)} - {segment.end.toFixed(2)}
                  </time>
                  <p className="text-sm leading-6 text-zinc-200">{segment.text}</p>
                </div>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-zinc-500">{t('transcript.noSegments')}</p>
            )}
          </div>
        </section>
      </div>
    </Panel>
  );
}
