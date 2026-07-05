import { create } from 'zustand';

interface AudioState {
  activeAudioTaskId: string | null;
  activeAudioUrl: string | null;
  activeAudioTitle: string;
  audioCurrentTime: number;
  audioDuration: number;
  audioLoop: boolean;
  audioVolume: number;
  audioIsOpen: boolean;
  audioShouldPlay: boolean;
  openAudio: (payload: { taskId: string; url: string; title: string; startAt?: number; play?: boolean }) => void;
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
  audioVolume: 0.85,
  audioIsOpen: false,
  audioShouldPlay: false,
  openAudio: ({ taskId, url, title, startAt = 0, play = true }) =>
    set({
      activeAudioTaskId: taskId,
      activeAudioUrl: url,
      activeAudioTitle: title,
      audioCurrentTime: Math.max(0, startAt),
      audioIsOpen: true,
      audioShouldPlay: play,
    }),
  closeAudio: () =>
    set({
      audioIsOpen: false,
      audioShouldPlay: false,
      audioCurrentTime: 0,
    }),
  setAudioCurrentTime: (time) => set({ audioCurrentTime: Math.max(0, time) }),
  setAudioDuration: (duration) => set({ audioDuration: Math.max(0, duration) }),
  setAudioLoop: (loop) => set({ audioLoop: loop }),
  setAudioVolume: (volume) => set({ audioVolume: Math.min(Math.max(volume, 0), 1) }),
  setAudioShouldPlay: (shouldPlay) => set({ audioShouldPlay: shouldPlay }),
}));
