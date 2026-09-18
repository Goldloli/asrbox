import { create } from 'zustand';
import { useUiStore } from './uiStore';

export function clipReachedEnd(currentTime: number, clipEnd: number | null) {
  return clipEnd != null && Number.isFinite(clipEnd) && currentTime >= clipEnd - 0.02;
}

export function openSegmentAudio(payload: { taskId: string; url: string; title: string; start: number; end: number }) {
  const padding = useUiStore.getState().segmentPlayPadding;
  useAudioStore.getState().openAudio({
    taskId: payload.taskId,
    url: payload.url,
    title: payload.title,
    startAt: Math.max(0, payload.start - padding),
    endAt: payload.end + padding,
  });
}

interface AudioState {
  activeAudioTaskId: string | null;
  activeAudioUrl: string | null;
  activeAudioTitle: string;
  audioCurrentTime: number;
  audioDuration: number;
  audioLoop: boolean;
  audioClipStart: number | null;
  audioClipEnd: number | null;
  audioVolume: number;
  audioIsOpen: boolean;
  audioShouldPlay: boolean;
  audioUnavailable: boolean;
  setAudioUnavailable: (unavailable: boolean) => void;
  openAudio: (payload: { taskId: string; url: string; title: string; startAt?: number; endAt?: number; play?: boolean }) => void;
  releaseAudioClip: () => void;
  closeAudio: () => void;
  setAudioCurrentTime: (time: number) => void;
  setAudioDuration: (duration: number) => void;
  setAudioLoop: (loop: boolean) => void;
  setAudioVolume: (volume: number) => void;
  setAudioShouldPlay: (shouldPlay: boolean) => void;
}

export const useAudioStore = create<AudioState>()((set) => ({
  activeAudioTaskId: null,
  activeAudioUrl: null,
  activeAudioTitle: '',
  audioCurrentTime: 0,
  audioDuration: 0,
  audioLoop: false,
  audioClipStart: null,
  audioClipEnd: null,
  audioVolume: 0.85,
  audioIsOpen: false,
  audioShouldPlay: false,
  audioUnavailable: false,
  setAudioUnavailable: (audioUnavailable) => set({ audioUnavailable }),
  openAudio: ({ taskId, url, title, startAt = 0, endAt, play = true }) => {
    const boundedStart = Math.max(0, startAt);
    const boundedEnd = Number.isFinite(endAt) && Number(endAt) > boundedStart ? Number(endAt) : null;
    set({
      activeAudioTaskId: taskId,
      activeAudioUrl: url,
      activeAudioTitle: title,
      audioCurrentTime: boundedStart,
      audioClipStart: boundedEnd == null ? null : boundedStart,
      audioClipEnd: boundedEnd,
      audioLoop: boundedEnd == null ? useAudioStore.getState().audioLoop : false,
      audioIsOpen: true,
      audioShouldPlay: play,
      audioUnavailable: false,
    });
  },
  releaseAudioClip: () => set({ audioClipStart: null, audioClipEnd: null }),
  closeAudio: () =>
    set({
      audioIsOpen: false,
      audioShouldPlay: false,
      audioCurrentTime: 0,
      audioClipStart: null,
      audioClipEnd: null,
    }),
  setAudioCurrentTime: (time) => set({ audioCurrentTime: Math.max(0, time) }),
  setAudioDuration: (duration) => set({ audioDuration: Math.max(0, duration) }),
  setAudioLoop: (loop) => set({ audioLoop: loop }),
  setAudioVolume: (volume) => set({ audioVolume: Math.min(Math.max(volume, 0), 1) }),
  setAudioShouldPlay: (shouldPlay) => set({ audioShouldPlay: shouldPlay }),
}));
