import { afterEach, describe, expect, it } from 'bun:test';

// audioStore imports uiStore, which reads the Vite-injected build version and
// navigator.language at module scope; provide stable values before importing.
(globalThis as Record<string, unknown>).__ASRBOX_VERSION__ ??= '0.0.0';
const existingNavigator = globalThis.navigator as unknown as Record<string, unknown> | undefined;
if (!existingNavigator || typeof existingNavigator.language !== 'string') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { ...(existingNavigator ?? {}), language: 'en-US' },
  });
}
const { clipReachedEnd, openSegmentAudio, useAudioStore } = await import('./audioStore');
const { useUiStore } = await import('./uiStore');

const initialAudio = useAudioStore.getState();
const initialUi = useUiStore.getState();

afterEach(() => {
  useAudioStore.setState(initialAudio, true);
  useUiStore.setState(initialUi);
});

describe('bounded audio clips', () => {
  it('stores a valid segment boundary and disables looping', () => {
    useAudioStore.getState().openAudio({
      taskId: 'task-one',
      url: 'http://localhost/audio',
      title: 'sample.wav',
      startAt: 2,
      endAt: 4,
    });

    const state = useAudioStore.getState();
    expect(state.audioClipStart).toBe(2);
    expect(state.audioClipEnd).toBe(4);
    expect(state.audioLoop).toBe(false);
    expect(state.audioShouldPlay).toBe(true);
  });

  it('clears an invalid or closed clip boundary', () => {
    useAudioStore.getState().openAudio({
      taskId: 'task-one',
      url: 'http://localhost/audio',
      title: 'sample.wav',
      startAt: 4,
      endAt: 2,
    });
    expect(useAudioStore.getState().audioClipEnd).toBeNull();

    useAudioStore.getState().closeAudio();
    expect(useAudioStore.getState().audioClipStart).toBeNull();
    expect(useAudioStore.getState().audioClipEnd).toBeNull();
  });

  it('stops at the segment end while ordinary audio stays unbounded', () => {
    expect(clipReachedEnd(3.99, 4)).toBe(true);
    expect(clipReachedEnd(3.5, 4)).toBe(false);
    expect(clipReachedEnd(30, null)).toBe(false);
  });
});

describe('openSegmentAudio padding', () => {
  const payload = { taskId: 'task-one', url: 'http://localhost/audio', title: 'sample.wav' };

  it('plays exact segment boundaries with the default zero padding', () => {
    openSegmentAudio({ ...payload, start: 10, end: 12 });

    const state = useAudioStore.getState();
    expect(state.audioClipStart).toBe(10);
    expect(state.audioClipEnd).toBe(12);
  });

  it('expands the clip by the configured padding on both sides', () => {
    useUiStore.getState().setSegmentPlayPadding(1);
    openSegmentAudio({ ...payload, start: 10, end: 12 });

    const state = useAudioStore.getState();
    expect(state.audioClipStart).toBe(9);
    expect(state.audioClipEnd).toBe(13);
  });

  it('clamps the padded start to the beginning of the media', () => {
    useUiStore.getState().setSegmentPlayPadding(2);
    openSegmentAudio({ ...payload, start: 0.5, end: 4 });

    const state = useAudioStore.getState();
    expect(state.audioClipStart).toBe(0);
    expect(state.audioClipEnd).toBe(6);
  });

  it('releases the clip boundary while keeping position and playback intent', () => {
    useAudioStore.getState().openAudio({ ...payload, startAt: 2, endAt: 4 });
    useAudioStore.getState().releaseAudioClip();

    const state = useAudioStore.getState();
    expect(state.audioClipStart).toBeNull();
    expect(state.audioClipEnd).toBeNull();
    expect(state.audioCurrentTime).toBe(2);
    expect(state.audioShouldPlay).toBe(true);
    expect(state.activeAudioUrl).toBe('http://localhost/audio');
  });
});
