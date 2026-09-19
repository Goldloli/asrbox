import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, Download, FileText, FolderOpen, Pause, Play, Replace, Save, Volume2, X } from 'lucide-react';
import { Link } from '@tanstack/react-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient, type SegmentBulkUpdateItem, type TranscriptionTask } from '../lib/api';
import { desktopCapabilities } from '../lib/desktopCapabilities';
import { queryKeys } from '../lib/queries';
import { formatDuration, formatPercent } from '../lib/format';
import { Badge, Button, EmptyState, Input, Panel, PanelHeader, Progress, Textarea } from './weiui';
import { StatusPill } from './StatusPill';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import { toastErrorMessage, useToast } from './Toast';
import { drawAudioWaveform } from './transcript/transcriptUtils';
import { localizedErrorPresentation } from '../lib/errorMessages';
import { LocalizedTechnicalMessage } from './LocalizedTechnicalMessage';

type TranscriptViewerMode = 'summary' | 'detail';
type QuickDownloadFormat = 'srt' | 'txt';

export function TranscriptViewer({
  task,
  audioPlayerHost,
  mode = 'summary',
  onDownloadFormat,
}: {
  task?: TranscriptionTask;
  audioPlayerHost?: HTMLElement | null;
  mode?: TranscriptViewerMode;
  onDownloadFormat?: (format: QuickDownloadFormat) => void;
}) {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draftEdits, setDraftEdits] = useState<Record<number, string>>({});
  const [detailView, setDetailView] = useState<'transcript' | 'edit' | 'replace'>('transcript');
  const [replaceSearch, setReplaceSearch] = useState('');
  const [replaceTarget, setReplaceTarget] = useState('');
  const [replaceCursor, setReplaceCursor] = useState(0);
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const segmentListRef = useRef<HTMLDivElement>(null);
  const replaceTextRef = useRef<HTMLDivElement>(null);

  const taskId = task?.id;
  const fullText = task?.text ?? '';
  const displaySegments = useMemo(() => {
    if (!task) return [];
    return task.segments.map((segment) => {
      const draftText = draftEdits[segment.id];
      return draftText === undefined ? segment : { ...segment, text: draftText };
    });
  }, [draftEdits, task]);
  const activeSegmentId = useMemo(() => {
    if (mode !== 'detail') return null;
    const active = displaySegments.find((segment) => playbackTime >= segment.start && playbackTime < segment.end);
    return active?.id ?? null;
  }, [displaySegments, mode, playbackTime]);
  const replaceOccurrences = useMemo(() => {
    if (!replaceSearch) return [] as Array<{ segmentId: number; offset: number }>;
    const occurrences: Array<{ segmentId: number; offset: number }> = [];
    for (const segment of displaySegments) {
      let from = 0;
      let index = segment.text.indexOf(replaceSearch, from);
      while (index !== -1) {
        occurrences.push({ segmentId: segment.id, offset: index });
        from = index + replaceSearch.length;
        index = segment.text.indexOf(replaceSearch, from);
      }
    }
    return occurrences;
  }, [displaySegments, replaceSearch]);
  const replaceMatchCount = replaceOccurrences.length;
  const replaceCursorEffective = replaceMatchCount ? replaceCursor % replaceMatchCount : -1;
  const replacePreviewParts = useMemo(() => {
    const parts: Array<{ text: string; matchIndex?: number }> = [];
    let matchIndex = 0;
    displaySegments.forEach((segment, segmentIndex) => {
      if (segmentIndex > 0) parts.push({ text: '\n' });
      if (!replaceSearch) {
        parts.push({ text: segment.text });
        return;
      }
      const pieces = segment.text.split(replaceSearch);
      pieces.forEach((piece, pieceIndex) => {
        if (piece) parts.push({ text: piece });
        if (pieceIndex < pieces.length - 1) parts.push({ text: replaceTarget || replaceSearch, matchIndex: matchIndex++ });
      });
    });
    return parts;
  }, [displaySegments, replaceSearch, replaceTarget]);

  // Keep the active segment visible while playback advances, but never steal
  // focus from in-progress transcript editing.
  useEffect(() => {
    if (activeSegmentId == null || !segmentListRef.current) return;
    const container = segmentListRef.current;
    if (container.contains(document.activeElement)) return;
    container
      .querySelector(`[data-segment-id="${activeSegmentId}"]`)
      ?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }, [activeSegmentId]);

  useEffect(() => {
    setDraftEdits({});
    setSeekTarget(null);
    setDetailView('transcript');
    setReplaceSearch('');
    setReplaceTarget('');
    setReplaceCursor(0);
  }, [taskId]);

  useEffect(() => {
    if (detailView !== 'replace' || replaceCursorEffective < 0 || !replaceTextRef.current) return;
    replaceTextRef.current
      .querySelector(`[data-replace-match="${replaceCursorEffective}"]`)
      ?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [detailView, replaceCursorEffective]);

  const saveEdits = useMutation({
    mutationFn: (input: { taskId: string; segments: SegmentBulkUpdateItem[] }) => apiClient.updateSegments(input.taskId, input.segments),
    onSuccess: (updatedTask) => {
      setDraftEdits({});
      queryClient.invalidateQueries({ queryKey: queryKeys.task(updatedTask.id) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      queryClient.invalidateQueries({ queryKey: queryKeys.taskVersions(updatedTask.id) });
      toast.success(t('transcript.editsSaved'));
    },
    onError: (error) => toast.error(t('transcript.editsSaveFailed'), toastErrorMessage(error)),
  });

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

  const hasDraftEdits = Object.keys(draftEdits).length > 0;
  const setSegmentTextDraft = (segmentId: number, text: string) => {
    const segment = task.segments.find((item) => item.id === segmentId);
    if (!segment) return;

    setDraftEdits((current) => {
      const next = { ...current };
      if (text !== segment.text) {
        next[segmentId] = text;
      } else {
        delete next[segmentId];
      }
      return next;
    });
  };
  const saveDraftEdits = () => {
    if (!hasDraftEdits || saveEdits.isPending) return;
    saveEdits.mutate({
      taskId: task.id,
      segments: displaySegments.map((segment) => ({
        id: segment.id,
        start: segment.start,
        end: segment.end,
        text: segment.text,
        speaker: segment.speaker || null,
      })),
    });
  };
  const discardDraftEdits = () => setDraftEdits({});
  const canApplyReplace = replaceMatchCount > 0 && replaceTarget !== replaceSearch;
  const buildBulkPayload = (textForSegment: (segment: (typeof displaySegments)[number]) => string) =>
    displaySegments.map((segment) => ({
      id: segment.id,
      start: segment.start,
      end: segment.end,
      text: textForSegment(segment),
      speaker: segment.speaker || null,
    }));
  const applyBatchReplace = () => {
    if (!canApplyReplace || saveEdits.isPending) return;
    saveEdits.mutate({
      taskId: task.id,
      segments: buildBulkPayload((segment) => segment.text.split(replaceSearch).join(replaceTarget)),
    });
  };
  const applyCurrentReplace = () => {
    const occurrence = replaceOccurrences[replaceCursorEffective];
    if (!occurrence || !canApplyReplace || saveEdits.isPending) return;
    saveEdits.mutate({
      taskId: task.id,
      segments: buildBulkPayload((segment) =>
        segment.id === occurrence.segmentId
          ? `${segment.text.slice(0, occurrence.offset)}${replaceTarget}${segment.text.slice(occurrence.offset + replaceSearch.length)}`
          : segment.text,
      ),
    });
  };
  const goToNextMatch = () => {
    if (replaceMatchCount === 0) return;
    setReplaceCursor((cursor) => (cursor + 1) % replaceMatchCount);
  };
  const seekToSegment = (seconds: number) => {
    setSeekTarget(Math.max(0, seconds));
  };
  const audioPlayer = (
    <WaveformAudioPlayer
      taskId={task.id}
      title={task.filename}
      sourceKind={task.source_kind}
      seekTarget={seekTarget}
      onSeekHandled={() => setSeekTarget(null)}
      onCurrentTimeChange={mode === 'detail' ? setPlaybackTime : undefined}
    />
  );
  const renderedAudioPlayer = audioPlayerHost === undefined || audioPlayerHost === null
    ? (audioPlayerHost === undefined ? audioPlayer : null)
    : createPortal(audioPlayer, audioPlayerHost);

  if (mode === 'summary') {
    return (
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('transcript.title')}
          title={task.filename}
          description={`${formatPercent(task.progress)} · ${formatDuration(task.duration_ms)}`}
          action={<StatusPill status={task.status} />}
        />
        <div className="grid gap-4 p-5">
          {renderedAudioPlayer}
          {task.error && (
            <div className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
              <LocalizedTechnicalMessage
                message={localizedErrorPresentation(
                  new Error(JSON.stringify({ error_code: task.error_code, message: task.error })),
                  locale,
                )}
              />
            </div>
          )}
          {task.status === 'completed' && fullText ? (
            <p className="max-h-56 overflow-auto whitespace-pre-wrap rounded-xl border app-border bg-[var(--app-control)] px-4 py-3 text-sm leading-7 text-app-soft">
              {fullText}
            </p>
          ) : null}
          {task.status === 'completed' && onDownloadFormat && (
            <section className="grid gap-3">
              <h2 className="text-sm font-semibold text-app">{t('transcript.quickDownloads')}</h2>
              <div className="grid grid-cols-2 gap-3">
                {(['srt', 'txt'] as const).map((format) => (
                  <Button
                    key={format}
                    aria-label={format.toUpperCase()}
                    variant={format === 'srt' ? 'primary' : 'secondary'}
                    className="h-12"
                    onClick={() => onDownloadFormat(format)}
                  >
                    <Download className="size-4" />
                    {t('transcript.downloadFormat', { format: format.toUpperCase() })}
                  </Button>
                ))}
              </div>
            </section>
          )}
          {task.status !== 'completed' && !task.error ? <Progress value={task.progress} /> : null}
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-5" data-testid="transcript-detail-workspace">
      {audioPlayer}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b app-border pt-1">
        <div className="flex items-center gap-7">
          {(['transcript', 'edit', 'replace'] as const).map((view) => (
            <button
              key={view}
              type="button"
              aria-pressed={detailView === view}
              className={cn(
                'border-b-2 px-1 pb-3.5 text-base font-semibold transition',
                detailView === view ? 'border-[var(--app-accent)] text-app' : 'border-transparent text-app-muted hover:text-app',
              )}
              onClick={() => setDetailView(view)}
            >
              {view === 'transcript' ? t('transcript.text') : view === 'edit' ? t('transcript.editSubtitles') : t('transcript.batchReplace')}
            </button>
          ))}
        </div>
        {detailView === 'edit' && hasDraftEdits ? (
          <div className="flex shrink-0 flex-wrap gap-2 pb-2">
            <Button variant="secondary" size="sm" onClick={discardDraftEdits} disabled={saveEdits.isPending}>
              <X className="size-4" />
              {t('transcript.discardChanges')}
            </Button>
            <Button size="sm" onClick={saveDraftEdits} disabled={saveEdits.isPending}>
              <Save className="size-4" />
              {saveEdits.isPending ? t('transcript.savingChanges') : t('transcript.saveChanges')}
            </Button>
          </div>
        ) : null}
      </div>
      {detailView === 'replace' ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border app-border bg-[var(--app-panel)] px-4 py-3" data-testid="batch-replace-bar">
          <Input
            value={replaceSearch}
            onChange={(event) => {
              setReplaceSearch(event.target.value);
              setReplaceCursor(0);
            }}
            aria-label={t('transcript.replaceSearch')}
            placeholder={t('transcript.replaceSearch')}
            className="w-52"
          />
          <Input
            value={replaceTarget}
            onChange={(event) => setReplaceTarget(event.target.value)}
            aria-label={t('transcript.replaceWith')}
            placeholder={t('transcript.replaceWith')}
            className="w-52"
          />
          <span className="text-sm text-app-muted" data-testid="batch-replace-count">
            {replaceSearch
              ? replaceMatchCount > 0
                ? t('transcript.replaceMatches', { count: replaceMatchCount })
                : t('transcript.replaceNoMatches')
              : t('transcript.replaceHint')}
          </span>
          <div className="ml-auto flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={goToNextMatch} disabled={replaceMatchCount === 0}>
              {t('transcript.replaceNext')}
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={applyCurrentReplace}
              disabled={!canApplyReplace || saveEdits.isPending}
            >
              {t('transcript.replaceCurrent')}
            </Button>
            <Button
              size="sm"
              onClick={applyBatchReplace}
              disabled={!canApplyReplace || saveEdits.isPending}
            >
              <Replace className="size-4" />
              {saveEdits.isPending ? t('transcript.replaceSaving') : t('transcript.replaceAction')}
            </Button>
          </div>
        </div>
      ) : null}
      {detailView === 'replace' ? (
        displaySegments.length > 0 ? (
          <section
            ref={replaceTextRef}
            data-testid="transcript-replace-text"
            className="max-h-[min(42vh,30rem)] overflow-auto whitespace-pre-wrap rounded-xl border app-border bg-[var(--app-panel)] px-4 py-3 text-[15px] leading-7 text-app-soft"
          >
            {replacePreviewParts.map((part, index) =>
              part.matchIndex === undefined ? (
                <span key={index}>{part.text}</span>
              ) : (
                <mark
                  key={index}
                  data-replace-match={part.matchIndex}
                  data-current={part.matchIndex === replaceCursorEffective ? 'true' : undefined}
                  className={cn(
                    'rounded-sm px-0.5 text-inherit',
                    part.matchIndex === replaceCursorEffective
                      ? 'bg-[var(--app-accent)] text-[var(--app-panel)]'
                      : 'bg-[var(--app-accent-soft)]',
                  )}
                >
                  {part.text}
                </mark>
              ),
            )}
          </section>
        ) : (
          <p className="px-3 py-10 text-center text-sm text-app-muted">{t('transcript.noSegments')}</p>
        )
      ) : (
      <section ref={segmentListRef} data-testid="transcript-segments" className="max-h-[min(42vh,30rem)] overflow-auto rounded-xl border app-border bg-[var(--app-panel)]">
        {displaySegments.length > 0 ? displaySegments.map((segment) => (
          <div
            key={segment.id}
            data-testid="segment-row"
            data-segment-id={segment.id}
            data-active={activeSegmentId === segment.id ? 'true' : undefined}
            className={cn(
              'grid min-h-[72px] w-full grid-cols-[28px_112px_84px_minmax(0,1fr)] items-center gap-3 border-b app-border px-3 py-3 text-left last:border-b-0 transition hover:bg-[var(--app-control)] min-[1500px]:grid-cols-[32px_150px_96px_minmax(0,1fr)] min-[1500px]:gap-4 min-[1500px]:px-4',
              activeSegmentId === segment.id && 'bg-[var(--app-accent-soft)]',
            )}
          >
            <button
              type="button"
              className="col-span-2 grid grid-cols-[28px_112px] items-center gap-3 rounded-lg text-left transition hover:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30 min-[1500px]:grid-cols-[32px_150px] min-[1500px]:gap-4"
              onClick={() => seekToSegment(segment.start)}
              aria-label={`${t('transcript.jumpToSegment')} ${segment.start.toFixed(2)}`}
            >
              <Play className="size-4 fill-current text-app-muted" />
              <span className="font-mono text-[13px] text-app-muted">{formatAudioTime(segment.start)} – {formatAudioTime(segment.end)}</span>
            </button>
            <Badge tone={Number(segment.speaker) % 2 === 0 ? 'warning' : 'accent'}>{segment.speaker ? `${t('transcript.speakerLabel')} ${segment.speaker}` : t('transcript.speakerPlaceholder')}</Badge>
            {detailView === 'edit' ? (
              <Textarea
                value={segment.text}
                onChange={(event) => setSegmentTextDraft(segment.id, event.target.value)}
                aria-label={t('transcript.segmentText')}
                rows={2}
                className="min-h-11 resize-y text-[15px] leading-7"
              />
            ) : (
              <span className="text-[15px] leading-7 text-app-soft">{segment.text}</span>
            )}
          </div>
        )) : <p className="px-3 py-10 text-center text-sm text-app-muted">{t('transcript.noSegments')}</p>}
      </section>
      )}
    </div>
  );
}

function WaveformAudioPlayer({
  taskId,
  title,
  sourceKind,
  seekTarget,
  onSeekHandled,
  onCurrentTimeChange,
}: {
  taskId: string;
  title: string;
  sourceKind?: TranscriptionTask['source_kind'];
  seekTarget: number | null;
  onSeekHandled: () => void;
  onCurrentTimeChange?: (seconds: number) => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const audioRef = useRef<HTMLAudioElement>(null);
  const waveformCanvasRef = useRef<HTMLCanvasElement>(null);
  const [audioReloadKey, setAudioReloadKey] = useState(0);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [waveformStatus, setWaveformStatus] = useState<'idle' | 'loading' | 'ready' | 'error'>('idle');
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);

  useEffect(() => {
    let cancelled = false;
    setAudioUrl(null);
    setWaveformStatus('loading');
    void apiClient.taskAudioUrl(taskId)
      .then((url) => {
        if (!cancelled) setAudioUrl(url);
      })
      .catch(() => {
        if (!cancelled) setWaveformStatus('error');
      });
    return () => {
      cancelled = true;
    };
  }, [audioReloadKey, taskId]);

  const relink = useMutation({
    mutationFn: (path: string) => apiClient.relinkTask(taskId, path),
    onSuccess: () => {
      toast.success(t('toast.taskRelinked'));
      queryClient.invalidateQueries({ queryKey: queryKeys.task(taskId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.tasks });
      setAudioReloadKey((key) => key + 1);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const relinkFromPicker = async () => {
    try {
      const files = await desktopCapabilities.pickMediaFiles();
      const file = files[0];
      if (!file) return;
      relink.mutate(file.path);
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  useEffect(() => {
    const audio = audioRef.current;
    setWaveformStatus('idle');
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
      audio.load();
    }
  }, [audioUrl]);

  useEffect(() => {
    const canvas = waveformCanvasRef.current;
    if (!canvas || !audioUrl) return;

    let cancelled = false;
    const loadWaveform = async () => {
      setWaveformStatus('loading');
      try {
        const response = await fetch(audioUrl);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const audioContext = new AudioContext();
        const buffer = await audioContext.decodeAudioData(await response.arrayBuffer());
        if (!cancelled) {
          drawAudioWaveform(canvas, buffer);
          setWaveformStatus('ready');
        }
        await audioContext.close();
      } catch {
        if (!cancelled) setWaveformStatus('error');
      }
    };

    void loadWaveform();
    return () => {
      cancelled = true;
    };
  }, [audioUrl]);

  useEffect(() => {
    if (seekTarget == null) return;
    const audio = audioRef.current;
    if (!audio) return;

    const nextTime = Math.max(0, seekTarget);
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    void audio.play().then(() => setIsPlaying(true)).catch(() => undefined);
    onSeekHandled();
  }, [onSeekHandled, seekTarget]);

  const togglePlayback = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) {
      void audio.play().then(() => setIsPlaying(true)).catch(() => undefined);
    } else {
      audio.pause();
      setIsPlaying(false);
    }
  };

  const seekToRatio = (ratio: number) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const nextTime = Math.max(0, Math.min(duration, duration * ratio));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    onCurrentTimeChange?.(nextTime);
  };

  const handleWaveformClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seekToRatio((event.clientX - rect.left) / rect.width);
  };

  return (
    <section className="grid gap-3.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-base font-semibold text-app">{t('transcript.audioPlayer')}</h2>
          <p className="mt-1 text-sm text-app-muted">{title}</p>
        </div>
        <Badge tone={waveformStatus === 'error' ? 'danger' : waveformStatus === 'ready' ? 'success' : 'neutral'}>
          {waveformStatus === 'loading' ? t('transcript.waveformLoading') : waveformStatus === 'error' ? t('transcript.waveformUnavailable') : t('transcript.waveform')}
        </Badge>
      </div>
      <div className="grid gap-3 rounded-2xl border app-control p-3.5">
        <audio
          ref={audioRef}
          preload="metadata"
          src={audioUrl ?? undefined}
          onLoadedMetadata={(event) => setDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => {
            setCurrentTime(event.currentTarget.currentTime);
            onCurrentTimeChange?.(event.currentTarget.currentTime);
          }}
          onSeeked={(event) => onCurrentTimeChange?.(event.currentTarget.currentTime)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onEnded={() => setIsPlaying(false)}
        >
          {t('transcript.audioUnsupported')}
        </audio>
        <div className="flex items-center gap-3">
          <Button type="button" size="icon" variant="primary" className="size-11 rounded-full" onClick={togglePlayback} aria-label={isPlaying ? t('audio.pause') : t('audio.play')}>
            {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 fill-current" />}
          </Button>
          <div className="w-28 shrink-0 font-mono text-sm font-medium text-app-muted">
            {formatAudioTime(currentTime)} / {formatAudioTime(duration)}
          </div>
          <div className="hidden min-w-0 flex-1 items-center gap-2 sm:flex">
            <Volume2 className="size-4 text-app-muted" />
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              aria-label={t('audio.volume')}
              onChange={(event) => {
                const nextVolume = Number(event.target.value);
                setVolume(nextVolume);
                if (audioRef.current) audioRef.current.volume = nextVolume;
              }}
              className="w-full accent-[var(--app-accent)]"
            />
          </div>
        </div>
        <button
          type="button"
          className="relative order-first min-h-28 overflow-hidden rounded-xl border app-border bg-[var(--app-panel)] text-left focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30"
          onClick={handleWaveformClick}
          aria-label={t('transcript.waveformSeek')}
        >
          <canvas ref={waveformCanvasRef} className="h-28 w-full opacity-90" aria-hidden="true" />
          {duration > 0 && (
            <div
              className="pointer-events-none absolute inset-y-0 left-0 border-r border-[color:var(--app-accent)] bg-[var(--app-accent-soft)]/50"
              style={{ width: `${Math.min(100, Math.max(0, (currentTime / duration) * 100))}%` }}
            />
          )}
          {waveformStatus !== 'ready' && (
            <div className="pointer-events-none absolute inset-0 grid place-items-center px-4 text-center text-xs text-app-muted">
              <span className="inline-flex items-center gap-2">
                {waveformStatus === 'loading' && <Activity className="size-4 animate-pulse" />}
                {waveformStatus === 'error' ? t('transcript.waveformUnavailable') : t('transcript.waveformHint')}
              </span>
            </div>
          )}
        </button>
        {waveformStatus === 'error' && sourceKind === 'external' && desktopCapabilities.canPickMediaFiles ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-3 py-2">
            <p className="text-sm text-[var(--app-danger)]">{t('transcript.sourceMissing')}</p>
            <Button size="sm" variant="secondary" onClick={relinkFromPicker} disabled={relink.isPending}>
              <FolderOpen className="size-4" />
              {relink.isPending ? t('transcript.relinking') : t('transcript.relinkSource')}
            </Button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function formatAudioTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00';
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, '0');
  return `${minutes}:${remainingSeconds}`;
}
