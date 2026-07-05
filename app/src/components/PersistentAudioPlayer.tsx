import { Pause, Play, Repeat, Volume2, X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { formatDuration } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useAudioStore } from '../stores/audioStore';
import { Button } from './weiui';

export function PersistentAudioPlayer() {
  const { t } = useI18n();
  const audioRef = useRef<HTMLAudioElement>(null);
  const activeAudioUrl = useAudioStore((state) => state.activeAudioUrl);
  const activeAudioTitle = useAudioStore((state) => state.activeAudioTitle);
  const audioCurrentTime = useAudioStore((state) => state.audioCurrentTime);
  const audioDuration = useAudioStore((state) => state.audioDuration);
  const audioLoop = useAudioStore((state) => state.audioLoop);
  const audioVolume = useAudioStore((state) => state.audioVolume);
  const audioIsOpen = useAudioStore((state) => state.audioIsOpen);
  const audioShouldPlay = useAudioStore((state) => state.audioShouldPlay);
  const closeAudio = useAudioStore((state) => state.closeAudio);
  const setAudioCurrentTime = useAudioStore((state) => state.setAudioCurrentTime);
  const setAudioDuration = useAudioStore((state) => state.setAudioDuration);
  const setAudioLoop = useAudioStore((state) => state.setAudioLoop);
  const setAudioVolume = useAudioStore((state) => state.setAudioVolume);
  const setAudioShouldPlay = useAudioStore((state) => state.setAudioShouldPlay);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = audioVolume;
  }, [audioVolume]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !activeAudioUrl) return;
    if (Math.abs(audio.currentTime - audioCurrentTime) > 0.8) {
      audio.currentTime = audioCurrentTime;
    }
  }, [activeAudioUrl, audioCurrentTime]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audioShouldPlay) {
      void audio.play().catch(() => setAudioShouldPlay(false));
    } else {
      audio.pause();
    }
  }, [audioShouldPlay, setAudioShouldPlay]);

  if (!audioIsOpen || !activeAudioUrl) return null;

  const progress = audioDuration > 0 ? (audioCurrentTime / audioDuration) * 100 : 0;

  return (
    <div className="app-shell-surface border-t app-border px-3 py-2">
      <div className="mx-auto grid max-w-[1680px] grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
        <Button
          type="button"
          size="icon"
          variant="secondary"
          aria-label={audioShouldPlay ? t('audio.pause') : t('audio.play')}
          onClick={() => setAudioShouldPlay(!audioShouldPlay)}
        >
          {audioShouldPlay ? <Pause className="size-4" /> : <Play className="size-4" />}
        </Button>
        <div className="grid min-w-0 gap-1">
          <div className="flex min-w-0 items-center justify-between gap-3 text-xs">
            <span className="truncate font-medium text-app">{activeAudioTitle}</span>
            <span className="shrink-0 text-app-muted">
              {formatDuration(audioCurrentTime * 1000)} / {formatDuration(audioDuration * 1000)}
            </span>
          </div>
          <input
            type="range"
            min={0}
            max={audioDuration || 0}
            step={0.1}
            value={Math.min(audioCurrentTime, audioDuration || audioCurrentTime)}
            aria-label={t('audio.seek')}
            className="h-2 w-full accent-[var(--app-accent)]"
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              setAudioCurrentTime(nextTime);
              if (audioRef.current) audioRef.current.currentTime = nextTime;
            }}
          />
          <div className="h-1 overflow-hidden rounded-full bg-[var(--app-control-strong)]">
            <div className="h-full bg-[var(--app-accent)]" style={{ width: `${Math.min(Math.max(progress, 0), 100)}%` }} />
          </div>
        </div>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            size="icon"
            variant={audioLoop ? 'primary' : 'ghost'}
            aria-label={t('audio.loop')}
            title={t('audio.loop')}
            onClick={() => setAudioLoop(!audioLoop)}
          >
            <Repeat className="size-4" />
          </Button>
          <label className="hidden items-center gap-2 text-app-muted md:flex">
            <Volume2 className="size-4" />
            <span className="sr-only">{t('audio.volume')}</span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={audioVolume}
              aria-label={t('audio.volume')}
              className="w-20 accent-[var(--app-accent)]"
              onChange={(event) => setAudioVolume(Number(event.target.value))}
            />
          </label>
          <Button type="button" size="icon" variant="ghost" aria-label={t('audio.close')} title={t('audio.close')} onClick={closeAudio}>
            <X className="size-4" />
          </Button>
        </div>
        <audio
          ref={audioRef}
          src={activeAudioUrl}
          loop={audioLoop}
          preload="metadata"
          className="hidden"
          onLoadedMetadata={(event) => setAudioDuration(event.currentTarget.duration || 0)}
          onTimeUpdate={(event) => setAudioCurrentTime(event.currentTarget.currentTime)}
          onPlay={() => setAudioShouldPlay(true)}
          onPause={() => setAudioShouldPlay(false)}
          onEnded={() => setAudioShouldPlay(false)}
        />
      </div>
    </div>
  );
}
