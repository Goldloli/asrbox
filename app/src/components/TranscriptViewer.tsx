import { useEffect, useMemo, useRef, useState } from 'react';
import { Activity, ChevronDown, Clipboard, Download, FileText, Pencil, Play, Replace, Save, Search, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, EmptyState, Input, Panel, PanelHeader, Progress, Textarea } from './weiui';
import { StatusPill } from './StatusPill';
import { useI18n } from '../lib/i18n';
import { getTaskOutputFormats } from '../lib/transcriptionOptions';
import { toastErrorMessage, useToast } from './Toast';
import { useAudioStore } from '../stores/audioStore';
import { countTextMatches, drawAudioWaveform, formatOutputTemplate, formatSubtitlePreview, renderHighlightedText, replaceTextMatches } from './transcript/transcriptUtils';

export function TranscriptViewer({ task }: { task?: TranscriptionTask }) {
  const { t } = useI18n();
  const toast = useToast();
  const openAudio = useAudioStore((state) => state.openAudio);
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [editedTextByTask, setEditedTextByTask] = useState<Record<string, string>>({});
  const [speakerLabelsByTask, setSpeakerLabelsByTask] = useState<Record<string, Record<number, string>>>({});
  const [segmentTimesByTask, setSegmentTimesByTask] = useState<Record<string, Record<number, { start: number; end: number }>>>({});
  const [isEditing, setIsEditing] = useState(false);
  const [draftText, setDraftText] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'vtt'>('srt');
  const [outputTemplate, setOutputTemplate] = useState<'minutes' | 'transcript' | 'subtitles' | 'markdown'>('transcript');
  const [waveformStatus, setWaveformStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');

  const displayedText = useMemo(() => {
    if (!task) return '';
    return editedTextByTask[task.id] ?? task.text ?? '';
  }, [editedTextByTask, task]);
  const speakerLabels = task ? speakerLabelsByTask[task.id] ?? {} : {};
  const segmentTimes = task ? segmentTimesByTask[task.id] ?? {} : {};
  const displaySegments = useMemo(() => {
    if (!task) return [];
    return task.segments.map((segment) => ({
      ...segment,
      ...(segmentTimes[segment.id] ?? {}),
    }));
  }, [segmentTimes, task]);
  const matchCount = useMemo(() => countTextMatches(displayedText, searchQuery), [displayedText, searchQuery]);
  const subtitlePreview = useMemo(() => formatSubtitlePreview(displaySegments, subtitleFormat), [displaySegments, subtitleFormat]);
  const outputTemplatePreview = useMemo(() => (
    task ? formatOutputTemplate(outputTemplate, task.filename, displayedText, displaySegments, subtitleFormat) : ''
  ), [displaySegments, displayedText, outputTemplate, subtitleFormat, task]);

  useEffect(() => {
    setDraftText(displayedText);
    setIsEditing(false);
    setWaveformStatus('idle');
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
  const replaceAllMatches = () => {
    if (!searchQuery.trim()) return;
    if (matchCount === 0) {
      toast.info(t('transcript.noMatches'));
      return;
    }

    const nextText = replaceTextMatches(displayedText, searchQuery, replaceQuery);
    setEditedTextByTask((current) => ({ ...current, [task.id]: nextText }));
    setDraftText(nextText);
    setIsEditing(false);
    setSearchQuery('');
    setReplaceQuery('');
    toast.success(t('transcript.replaceSaved'), `${matchCount} ${t('transcript.matches')}`);
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
  const seekToSegment = (seconds: number) => {
    openAudio({ taskId: task.id, url: apiClient.taskAudioUrl(task.id), title: task.filename, startAt: seconds });
    const audio = audioRef.current;
    if (!audio) return;
    try {
      audio.currentTime = Math.max(0, seconds);
      void audio.play().catch(() => undefined);
    } catch {
      // The media element may reject seeking before metadata is available.
    }
  };
  const generateWaveform = async () => {
    const canvas = waveformCanvasRef.current;
    if (!canvas) return;

    setWaveformStatus('loading');
    try {
      const response = await fetch(apiClient.taskAudioUrl(task.id));
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const audioContext = new AudioContext();
      const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
      drawAudioWaveform(canvas, buffer);
      await audioContext.close();
      setWaveformStatus('ready');
    } catch {
      setWaveformStatus('error');
    }
  };
  const setSegmentSpeaker = (segmentId: number, value: string) => {
    setSpeakerLabelsByTask((current) => ({
      ...current,
      [task.id]: {
        ...(current[task.id] ?? {}),
        [segmentId]: value,
      },
    }));
  };
  const setSegmentTime = (segmentId: number, field: 'start' | 'end', value: string) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;

    const segment = displaySegments.find((item) => item.id === segmentId);
    if (!segment) return;

    setSegmentTimesByTask((current) => ({
      ...current,
      [task.id]: {
        ...(current[task.id] ?? {}),
        [segmentId]: {
          start: field === 'start' ? Math.max(0, numericValue) : segment.start,
          end: field === 'end' ? Math.max(0, numericValue) : segment.end,
        },
      },
    }));
  };
  const exportFormats = task.status === 'completed' ? getTaskOutputFormats(task) : [];

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
          <div className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
            {task.error_code && <p className="mb-1 font-medium">{task.error_code}</p>}
            <p>{task.error}</p>
          </div>
        )}
        <div className="sticky top-0 z-10 -mx-5 flex flex-wrap items-center justify-between gap-3 border-y app-border bg-[var(--app-panel-solid)] px-5 py-3">
          <div className="flex min-w-0 items-center gap-2">
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
            {exportFormats.length > 0 && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="secondary" size="sm">
                    <Download className="size-4" />
                    {t('tasks.outputFiles')}
                    <ChevronDown className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  {exportFormats.map((format) => (
                    <DropdownMenuItem key={format} asChild>
                      <a href={apiClient.exportTaskUrl(task.id, format)}>
                        {format.toUpperCase()}
                      </a>
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        </div>
        <section className="grid gap-2">
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
            <Input
              value={replaceQuery}
              onChange={(event) => setReplaceQuery(event.target.value)}
              placeholder={t('transcript.replacePlaceholder')}
              className="min-w-0 flex-1 sm:min-w-48"
            />
            <Button variant="secondary" size="sm" onClick={replaceAllMatches} disabled={!searchQuery.trim() || matchCount === 0}>
              <Replace className="size-4" />
              {t('transcript.replaceAll')}
            </Button>
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
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">{t('transcript.audioPlayer')}</h2>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => openAudio({ taskId: task.id, url: apiClient.taskAudioUrl(task.id), title: task.filename })}
            >
              <Play className="size-4" />
              {t('audio.openPersistent')}
            </Button>
          </div>
          <audio ref={audioRef} controls preload="none" src={apiClient.taskAudioUrl(task.id)} className="w-full">
            {t('transcript.audioUnsupported')}
          </audio>
        </section>
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">{t('transcript.waveform')}</h2>
            <Button variant="secondary" size="sm" onClick={generateWaveform} disabled={waveformStatus === 'loading'}>
              <Activity className="size-4" />
              {waveformStatus === 'loading' ? t('transcript.waveformLoading') : t('transcript.generateWaveform')}
            </Button>
          </div>
          <div className="rounded-lg border app-control p-3">
            <canvas ref={waveformCanvasRef} className="h-24 w-full" aria-label={t('transcript.waveform')} />
            {waveformStatus !== 'ready' && (
              <p className="text-center text-xs text-app-muted">
                {waveformStatus === 'error' ? t('transcript.waveformUnavailable') : t('transcript.waveformHint')}
              </p>
            )}
          </div>
        </section>
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">{t('transcript.subtitlePreview')}</h2>
            <div className="flex rounded-lg border app-control p-1">
              {(['srt', 'vtt'] as const).map((format) => (
                <Button
                  key={format}
                  variant={subtitleFormat === format ? 'primary' : 'ghost'}
                  size="sm"
                  onClick={() => setSubtitleFormat(format)}
                  className="h-7"
                >
                  {format.toUpperCase()}
                </Button>
              ))}
            </div>
          </div>
          <pre className="max-h-56 overflow-auto rounded-lg border app-control p-3 font-mono text-xs leading-5 text-app-soft">
            {subtitlePreview || t('transcript.noSegments')}
          </pre>
        </section>
        <section className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold text-app">{t('transcript.outputTemplate')}</h2>
            <Button variant="secondary" size="sm" onClick={() => copyText(outputTemplatePreview)} disabled={!outputTemplatePreview}>
              <Clipboard className="size-4" />
              {t('common.copy')}
            </Button>
          </div>
          <div className="flex flex-wrap gap-2">
            {(['minutes', 'transcript', 'subtitles', 'markdown'] as const).map((template) => (
              <Button
                key={template}
                variant={outputTemplate === template ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setOutputTemplate(template)}
              >
                {t(`transcript.template.${template}`)}
              </Button>
            ))}
          </div>
          <pre className="max-h-72 overflow-auto rounded-lg border app-control p-3 whitespace-pre-wrap font-mono text-xs leading-5 text-app-soft">
            {outputTemplatePreview}
          </pre>
        </section>
        <section className="grid gap-3">
          <h2 className="text-sm font-semibold text-app">{t('transcript.segments')}</h2>
          <div className="max-h-[36vh] overflow-auto rounded-lg border app-border">
            {displaySegments.length > 0 ? (
              displaySegments.map((segment) => (
                <div key={segment.id} className="grid grid-cols-[132px_minmax(0,1fr)] gap-3 border-b app-border px-3 py-3 last:border-b-0">
                  <div className="grid gap-2">
                    <button
                      type="button"
                      className="rounded-md px-1 text-left font-mono text-xs text-app-muted transition hover:bg-[var(--app-control)] hover:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30"
                      onClick={() => seekToSegment(segment.start)}
                      aria-label={`${t('transcript.jumpToSegment')} ${segment.start.toFixed(2)}`}
                      title={t('transcript.jumpToSegment')}
                    >
                      {segment.start.toFixed(2)} - {segment.end.toFixed(2)}
                    </button>
                    <div className="grid grid-cols-2 gap-1">
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={segment.start}
                        onChange={(event) => setSegmentTime(segment.id, 'start', event.target.value)}
                        aria-label={t('transcript.timestampStart')}
                        className="h-8 px-2 text-[11px]"
                      />
                      <Input
                        type="number"
                        min={0}
                        step={0.01}
                        value={segment.end}
                        onChange={(event) => setSegmentTime(segment.id, 'end', event.target.value)}
                        aria-label={t('transcript.timestampEnd')}
                        className="h-8 px-2 text-[11px]"
                      />
                    </div>
                  </div>
                  <div className="flex items-start gap-2">
                    <div className="grid min-w-0 flex-1 gap-2">
                      <Input
                        value={speakerLabels[segment.id] ?? segment.speaker ?? ''}
                        onChange={(event) => setSegmentSpeaker(segment.id, event.target.value)}
                        placeholder={t('transcript.speakerPlaceholder')}
                        className="h-8 max-w-40 text-xs"
                        aria-label={t('transcript.speakerLabel')}
                      />
                      <p className="text-sm leading-6 text-app-soft">{renderHighlightedText(segment.text, searchQuery)}</p>
                    </div>
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
