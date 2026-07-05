import { useEffect, useMemo, useState } from 'react';
import { Clipboard, Download, FileText, Pencil, Save, Search, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, EmptyState, Input, Panel, PanelHeader, Progress, Textarea } from './weiui';
import { StatusPill } from './StatusPill';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';
import { toastErrorMessage, useToast } from './Toast';

export function TranscriptViewer({ task }: { task?: TranscriptionTask }) {
  const { t } = useI18n();
  const toast = useToast();
  const [editedTextByTask, setEditedTextByTask] = useState<Record<string, string>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const displayedText = useMemo(() => {
    if (!task) return '';
    return editedTextByTask[task.id] ?? task.text ?? '';
  }, [editedTextByTask, task]);
  const matchCount = useMemo(() => countTextMatches(displayedText, searchQuery), [displayedText, searchQuery]);

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
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('toast.copied'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
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
              <Button variant="secondary" size="sm" onClick={() => copyText(displayedText)} disabled={!displayedText}>
                <Clipboard className="size-4" />
                {t('tasks.copyFullText')}
              </Button>
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
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-0 flex-1 sm:min-w-64">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder={t('transcript.searchPlaceholder')}
                className="pl-9"
              />
            </div>
            {searchQuery.trim() && (
              <Badge tone={matchCount > 0 ? 'accent' : 'neutral'}>
                {matchCount} {t('transcript.matches')}
              </Badge>
            )}
          </div>
          {isEditing ? (
            <Textarea
              value={draftText}
              onChange={(event) => setDraftText(event.target.value)}
              placeholder={t('transcript.placeholder')}
              className="min-h-56 font-mono text-[13px]"
            />
          ) : (
            <div className="min-h-56 whitespace-pre-wrap rounded-lg border app-control px-3 py-2 font-mono text-[13px] leading-6 text-app-soft">
              {displayedText ? renderHighlightedText(displayedText, searchQuery) : <span className="text-app-faint">{t('transcript.placeholder')}</span>}
            </div>
          )}
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
                  <div className="flex items-start gap-2">
                    <p className="min-w-0 flex-1 text-sm leading-6 text-app-soft">{renderHighlightedText(segment.text, searchQuery)}</p>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 shrink-0"
                      onClick={() => copyText(segment.text)}
                      aria-label={t('transcript.copySegment')}
                      title={t('transcript.copySegment')}
                    >
                      <Clipboard className="size-4" />
                    </Button>
                  </div>
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

function countTextMatches(text: string, query: string) {
  const needle = query.trim().toLowerCase();
  if (!needle) return 0;

  let count = 0;
  let index = 0;
  const haystack = text.toLowerCase();
  while (index < haystack.length) {
    const found = haystack.indexOf(needle, index);
    if (found === -1) break;
    count += 1;
    index = found + needle.length;
  }
  return count;
}

function renderHighlightedText(text: string, query: string) {
  const needle = query.trim();
  if (!needle) return text;

  const parts: Array<{ text: string; matched: boolean }> = [];
  const haystack = text.toLowerCase();
  const normalizedNeedle = needle.toLowerCase();
  let index = 0;

  while (index < text.length) {
    const found = haystack.indexOf(normalizedNeedle, index);
    if (found === -1) {
      parts.push({ text: text.slice(index), matched: false });
      break;
    }
    if (found > index) parts.push({ text: text.slice(index, found), matched: false });
    parts.push({ text: text.slice(found, found + needle.length), matched: true });
    index = found + needle.length;
  }

  return parts.map((part, partIndex) => (
    part.matched ? (
      <mark key={partIndex} className="rounded bg-[var(--app-accent-soft)] px-0.5 text-[var(--app-accent-text)]">
        {part.text}
      </mark>
    ) : (
      <span key={partIndex}>{part.text}</span>
    )
  ));
}
