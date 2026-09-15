import { type MouseEvent, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Activity, ChevronDown, Clipboard, Download, FileText, FolderOpen, Pause, Play, Replace, Save, Search, Volume2, X } from 'lucide-react';
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
import { countTextMatches, drawAudioWaveform, formatSubtitlePreview, renderHighlightedText, replaceTextMatches } from './transcript/transcriptUtils';

type SegmentDraft = {
  text?: string;
  speaker?: string;
  start?: number;
  end?: number;
};

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
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [draftEdits, setDraftEdits] = useState<Record<number, SegmentDraft>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [subtitleFormat, setSubtitleFormat] = useState<'srt' | 'vtt'>('srt');
  const [seekTarget, setSeekTarget] = useState<number | null>(null);
  const [playbackTime, setPlaybackTime] = useState(0);
  const segmentListRef = useRef<HTMLDivElement>(null);

  const taskId = task?.id;
  const fullText = task?.text ?? '';
  const displaySegments = useMemo(() => {
    if (!task) return [];
    return task.segments.map((segment) => {
      const draft = draftEdits[segment.id];
      if (!draft) return segment;
      return {
        ...segment,
        text: draft.text ?? segment.text,
        speaker: draft.speaker ?? segment.speaker,
        start: draft.start ?? segment.start,
        end: draft.end ?? segment.end,
      };
    });
  }, [draftEdits, task]);
  const matchCount = useMemo(
    () => displaySegments.reduce((total, segment) => total + countTextMatches(segment.text, searchQuery), 0),
    [displaySegments, searchQuery],
  );
  const subtitlePreview = useMemo(
    () => mode === 'detail' ? formatSubtitlePreview(displaySegments, subtitleFormat) : '',
    [displaySegments, mode, subtitleFormat],
  );
  const activeSegmentId = useMemo(() => {
    if (mode !== 'detail') return null;
    const active = displaySegments.find((segment) => playbackTime >= segment.start && playbackTime < segment.end);
    return active?.id ?? null;
  }, [displaySegments, mode, playbackTime]);

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
  }, [taskId]);

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
  const setSegmentDraft = (segmentId: number, patch: SegmentDraft) => {
    const segment = task.segments.find((item) => item.id === segmentId);
    if (!segment) return;

    setDraftEdits((current) => {
      const merged = { ...(current[segmentId] ?? {}), ...patch };
      const isDirty =
        (merged.text !== undefined && merged.text !== segment.text) ||
        (merged.speaker !== undefined && merged.speaker !== (segment.speaker ?? '')) ||
        (merged.start !== undefined && merged.start !== segment.start) ||
        (merged.end !== undefined && merged.end !== segment.end);
      const next = { ...current };
      if (isDirty) {
        next[segmentId] = merged;
      } else {
        delete next[segmentId];
      }
      return next;
    });
  };
  const setSegmentTime = (segmentId: number, field: 'start' | 'end', value: string) => {
    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) return;
    setSegmentDraft(segmentId, { [field]: Math.max(0, numericValue) });
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
  const replaceAllMatches = () => {
    if (!searchQuery.trim()) return;
    if (matchCount === 0) {
      toast.info(t('transcript.noMatches'));
      return;
    }

    setDraftEdits((current) => {
      const next = { ...current };
      for (const segment of displaySegments) {
        const replacedText = replaceTextMatches(segment.text, searchQuery, replaceQuery);
        if (replacedText !== segment.text) {
          next[segment.id] = { ...(next[segment.id] ?? {}), text: replacedText };
        }
      }
      return next;
    });
    setSearchQuery('');
    setReplaceQuery('');
    toast.success(t('transcript.replaceApplied'), `${matchCount} ${t('transcript.matches')}`);
  };
  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t('toast.copied'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
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
      <Panel className="min-h-[32rem] overflow-hidden">
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
          <section className="grid gap-3">
            <h2 className="text-sm font-semibold text-app">{t('transcript.text')}</h2>
            <div className="min-h-56 max-h-[min(42vh,24rem)] overflow-auto whitespace-pre-wrap rounded-lg border app-control px-3 py-2 font-mono text-[13px] leading-6 text-app-soft">
              {fullText || <span className="text-app-faint">{t('transcript.placeholder')}</span>}
            </div>
          </section>
          {renderedAudioPlayer}
          {task.status === 'completed' && onDownloadFormat && (
            <section className="grid gap-3" aria-labelledby="quick-downloads-title">
              <h2 id="quick-downloads-title" className="text-sm font-semibold text-app">{t('transcript.quickDownloads')}</h2>
              <div className="grid grid-cols-2 gap-2 sm:flex">
                {(['srt', 'txt'] as const).map((format) => (
                  <Button key={format} variant="secondary" onClick={() => onDownloadFormat(format)}>
                    <Download className="size-4" />
                    {format.toUpperCase()}
                  </Button>
                ))}
              </div>
            </section>
          )}
        </div>
      </Panel>
    );
  }

  return (
    <div className="grid gap-5" data-testid="transcript-detail-workspace">
      {audioPlayer}
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
        <pre className="max-h-48 overflow-auto rounded-lg border app-control p-3 font-mono text-xs leading-5 text-app-soft">
          {subtitlePreview || t('transcript.noSegments')}
        </pre>
      </section>
      <section className="grid gap-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="text-sm font-semibold text-app">{t('transcript.segments')}</h2>
            {hasDraftEdits && <Badge tone="warning">{t('transcript.unsavedChanges')}</Badge>}
          </div>
          {hasDraftEdits && (
            <div className="flex shrink-0 flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={discardDraftEdits} disabled={saveEdits.isPending}>
                <X className="size-4" />
                {t('transcript.discardChanges')}
              </Button>
              <Button size="sm" onClick={saveDraftEdits} disabled={saveEdits.isPending}>
                <Save className="size-4" />
                {saveEdits.isPending ? t('transcript.savingChanges') : t('transcript.saveChanges')}
              </Button>
            </div>
          )}
        </div>
        <div ref={segmentListRef} data-testid="transcript-segments" className="max-h-[min(42vh,24rem)] overflow-auto rounded-lg border app-border">
          {displaySegments.length > 0 ? (
            displaySegments.map((segment) => (
              <div
                key={segment.id}
                data-testid="segment-row"
                data-segment-id={segment.id}
                data-active={activeSegmentId === segment.id ? 'true' : undefined}
                className={cn(
                  'grid grid-cols-[clamp(112px,18vw,148px)_minmax(0,1fr)] gap-3 border-b app-border px-3 py-3 last:border-b-0 transition-colors',
                  activeSegmentId === segment.id && 'bg-[var(--app-accent-soft)]',
                )}
              >
                <div className="grid content-start gap-2">
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
                      className="h-8 min-w-0 px-1.5 text-[11px]"
                    />
                    <Input
                      type="number"
                      min={0}
                      step={0.01}
                      value={segment.end}
                      onChange={(event) => setSegmentTime(segment.id, 'end', event.target.value)}
                      aria-label={t('transcript.timestampEnd')}
                      className="h-8 min-w-0 px-1.5 text-[11px]"
                    />
                  </div>
                </div>
                <div className="flex min-w-0 items-start gap-2">
                  <div className="grid min-w-0 flex-1 gap-2">
                    <Input
                      value={segment.speaker ?? ''}
                      onChange={(event) => setSegmentDraft(segment.id, { speaker: event.target.value })}
                      placeholder={t('transcript.speakerPlaceholder')}
                      className="h-8 max-w-48 text-xs"
                      aria-label={t('transcript.speakerLabel')}
                    />
                    <Textarea
                      value={segment.text}
                      onChange={(event) => setSegmentDraft(segment.id, { text: event.target.value })}
                      aria-label={t('transcript.segmentText')}
                      rows={2}
                      className="min-h-16 resize-y text-xs"
                    />
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
      <details className="group rounded-xl border app-control">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-semibold text-app focus:outline-none focus:ring-2 focus:ring-inset focus:ring-[color:var(--app-accent)]/25">
          <span>{t('transcript.fullTextTools')}</span>
          <ChevronDown className="size-4 shrink-0 text-app-muted transition-transform group-open:rotate-180" />
        </summary>
        <section className="grid gap-3 border-t app-border p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-2">
              <div className="relative min-w-0 flex-1 sm:min-w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-app-muted" />
                <Input value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder={t('transcript.searchPlaceholder')} className="pl-9" />
              </div>
              <Input value={replaceQuery} onChange={(event) => setReplaceQuery(event.target.value)} placeholder={t('transcript.replacePlaceholder')} className="min-w-0 flex-1 sm:min-w-48" />
              <Button variant="secondary" size="sm" onClick={replaceAllMatches} disabled={!searchQuery.trim() || matchCount === 0}>
                <Replace className="size-4" />
                {t('transcript.replaceAll')}
              </Button>
              {searchQuery.trim() && <Badge tone={matchCount > 0 ? 'accent' : 'neutral'}>{matchCount} {t('transcript.matches')}</Badge>}
            </div>
            <Button variant="secondary" size="sm" onClick={() => copyText(fullText)} disabled={!fullText}>
              <Clipboard className="size-4" />
              {t('tasks.copyFullText')}
            </Button>
          </div>
          <div className="max-h-56 overflow-auto whitespace-pre-wrap rounded-lg border app-control px-3 py-2 font-mono text-[13px] leading-6 text-app-soft">
            {fullText ? renderHighlightedText(fullText, searchQuery) : <span className="text-app-faint">{t('transcript.placeholder')}</span>}
          </div>
          <p className="text-xs text-app-muted">{t('transcript.fullTextReadOnly')}</p>
        </section>
      </details>
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
  };

  const handleWaveformClick = (event: MouseEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    seekToRatio((event.clientX - rect.left) / rect.width);
  };

  return (
    <section className="grid gap-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold text-app">{t('transcript.audioPlayer')}</h2>
          <p className="mt-1 text-xs text-app-muted">{title}</p>
        </div>
        <Badge tone={waveformStatus === 'error' ? 'danger' : waveformStatus === 'ready' ? 'success' : 'neutral'}>
          {waveformStatus === 'loading' ? t('transcript.waveformLoading') : waveformStatus === 'error' ? t('transcript.waveformUnavailable') : t('transcript.waveform')}
        </Badge>
      </div>
      <div className="grid gap-3 rounded-xl border app-control p-3">
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
          <Button type="button" size="icon" variant="secondary" onClick={togglePlayback} aria-label={isPlaying ? t('audio.pause') : t('audio.play')}>
            {isPlaying ? <Pause className="size-4" /> : <Play className="size-4" />}
          </Button>
          <div className="w-24 shrink-0 font-mono text-xs text-app-muted">
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
          className="relative min-h-24 overflow-hidden rounded-lg border app-border bg-[var(--app-panel)] text-left focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30"
          onClick={handleWaveformClick}
          aria-label={t('transcript.waveformSeek')}
        >
          <canvas ref={waveformCanvasRef} className="h-24 w-full opacity-90" aria-hidden="true" />
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
