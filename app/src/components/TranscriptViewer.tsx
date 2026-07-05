import { useEffect, useMemo, useState } from 'react';
import { Download, FileText, Pencil, Save, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, EmptyState, Panel, PanelHeader, Progress, Textarea } from './weiui';
import { StatusPill } from './StatusPill';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';
import { useToast } from './Toast';

export function TranscriptViewer({ task }: { task?: TranscriptionTask }) {
  const { t } = useI18n();
  const toast = useToast();
  const [editedTextByTask, setEditedTextByTask] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');

  const displayedText = useMemo(() => {
    if (!task) return '';
    return editedTextByTask[task.id] ?? task.text ?? '';
  }, [editedTextByTask, task]);

  useEffect(() => {
    setDraftText(displayedText);
    setIsEditing(false);
  }, [displayedText, task?.id]);

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

  const hasLocalEdit = editedTextByTask[task.id] !== undefined;
  const saveLocalEdit = () => {
    setEditedTextByTask((current) => ({ ...current, [task.id]: draftText }));
    setIsEditing(false);
    toast.success(t('transcript.localEditSaved'));
  };
  const cancelLocalEdit = () => {
    setDraftText(displayedText);
    setIsEditing(false);
  };

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
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold text-app">{t('transcript.text')}</h2>
              {hasLocalEdit && <Badge tone="accent">{t('transcript.localEdit')}</Badge>}
            </div>
            <div className="flex shrink-0 flex-wrap justify-end gap-2">
              {isEditing ? (
                <>
                  <Button variant="secondary" size="sm" onClick={cancelLocalEdit}>
                    <X className="size-4" />
                    {t('common.cancel')}
                  </Button>
                  <Button size="sm" onClick={saveLocalEdit}>
                    <Save className="size-4" />
                    {t('transcript.saveLocalEdit')}
                  </Button>
                </>
              ) : (
                <Button variant="secondary" size="sm" onClick={() => setIsEditing(true)}>
                  <Pencil className="size-4" />
                  {t('transcript.edit')}
                </Button>
              )}
              {task.status === 'completed' &&
                getTaskOutputFormats(task).map((format) => (
                  <Button key={format} asChild variant="secondary" size="sm">
                    <a href={apiClient.exportTaskUrl(task.id, format)}>
                      <Download className="size-4" />
                      {format.toUpperCase()}
                    </a>
                  </Button>
                ))}
            </div>
          </div>
          <Textarea
            value={isEditing ? draftText : displayedText}
            readOnly={!isEditing}
            onChange={(event) => setDraftText(event.target.value)}
            placeholder={t('transcript.placeholder')}
            className="min-h-56 font-mono text-[13px]"
          />
          {hasLocalEdit && <p className="text-xs text-app-muted">{t('transcript.localEditHint')}</p>}
        </section>
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-app">{t('transcript.segments')}</h2>
          <div className="max-h-[36vh] overflow-auto rounded-lg border border-white/10">
            {task.segments.length > 0 ? (
              task.segments.map((segment) => (
                <div key={segment.id} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3 border-b border-white/10 px-3 py-3 last:border-b-0">
                  <time className="font-mono text-xs text-app-muted">
                    {segment.start.toFixed(2)} - {segment.end.toFixed(2)}
                  </time>
                  <p className="text-sm leading-6 text-app-soft">{segment.text}</p>
                </div>
              ))
            ) : (
              <p className="px-3 py-8 text-center text-sm text-app-muted">{t('transcript.noSegments')}</p>
            )}
          </div>
        </section>
      </div>
    </Panel>
  );
}
