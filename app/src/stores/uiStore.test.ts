import { afterEach, describe, expect, it } from 'bun:test';

// uiStore reads the Vite-injected build version and navigator.language at module
// scope; the bun test runtime lacks both, so provide stable values first.
(globalThis as Record<string, unknown>).__ASRBOX_VERSION__ ??= '0.0.0';
const existingNavigator = globalThis.navigator as unknown as Record<string, unknown> | undefined;
if (!existingNavigator || typeof existingNavigator.language !== 'string') {
  Object.defineProperty(globalThis, 'navigator', {
    configurable: true,
    value: { ...(existingNavigator ?? {}), language: 'en-US' },
  });
}
const { mergePersistedUiState, useUiStore } = await import('./uiStore');

const initial = useUiStore.getState();

afterEach(() => {
  useUiStore.setState(initial);
});

describe('uiStore new-user defaults', () => {
  it('starts desktop users with the expanded sidebar', () => {
    expect(useUiStore.getState().sidebarMode).toBe('expanded');
  });

  it('starts with the orange accent color', () => {
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state.accentColor).toBe('orange');
  });

  it('keeps the existing neutral defaults for theme, density and font scale', () => {
    const state = useUiStore.getState();
    expect(state.theme).toBe('system');
    expect(state.density).toBe('comfortable');
    expect(state.fontScale).toBe('standard');
    expect(state.reducedMotion).toBe('system');
  });

  it('defaults segment playback padding to strict timestamps', () => {
    expect(useUiStore.getState().segmentPlayPadding).toBe(0);
  });
});

describe('uiStore persisted preference contract', () => {
  it('restores a saved icon-only sidebar preference instead of the new-user default', () => {
    useUiStore.setState({ sidebarMode: 'icons' });
    expect(useUiStore.getState().sidebarMode).toBe('icons');
  });

  it('restores a saved accent color instead of the default', () => {
    useUiStore.setState({ accentColor: 'purple' });
    expect(useUiStore.getState().accentColor).toBe('purple');
  });

  it('normalizes unsupported accent colors while rehydrating persisted state', () => {
    const merged = mergePersistedUiState(
      { accentColor: 'neon', sidebarMode: 'icons' },
      initial,
    );

    expect(merged.accentColor).toBe('orange');
    expect(merged.sidebarMode).toBe('icons');
    expect(merged.setAccentColor).toBe(initial.setAccentColor);
  });

  it('keeps supported persisted accents and ignores non-object payloads', () => {
    expect(mergePersistedUiState({ accentColor: 'cyan' }, initial).accentColor).toBe('cyan');
    expect(mergePersistedUiState(null, initial)).toBe(initial);
  });

  it('normalizes unsupported segment padding values while rehydrating persisted state', () => {
    expect(mergePersistedUiState({ segmentPlayPadding: 7 }, initial).segmentPlayPadding).toBe(0);
    expect(mergePersistedUiState({ segmentPlayPadding: 'wide' }, initial).segmentPlayPadding).toBe(0);
    expect(mergePersistedUiState({ segmentPlayPadding: 0.5 }, initial).segmentPlayPadding).toBe(0.5);
    expect(mergePersistedUiState({ segmentPlayPadding: 3 }, initial).segmentPlayPadding).toBe(3);
  });
});

describe('uiStore accent color setter', () => {
  it('updates the accent color without touching other preferences', () => {
    const setAccentColor = (useUiStore.getState() as unknown as { setAccentColor?: (value: string) => void }).setAccentColor;
    expect(typeof setAccentColor).toBe('function');

    setAccentColor!('blue');
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state.accentColor).toBe('blue');
    expect(useUiStore.getState().theme).toBe(initial.theme);
    expect(useUiStore.getState().sidebarMode).toBe(initial.sidebarMode);
  });

  it('falls back to the default orange for unsupported accent values', () => {
    const setAccentColor = (useUiStore.getState() as unknown as { setAccentColor?: (value: unknown) => void }).setAccentColor;
    expect(typeof setAccentColor).toBe('function');

    setAccentColor!('green');
    setAccentColor!('neon');
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state.accentColor).toBe('orange');
  });
});

describe('uiStore segment playback padding setter', () => {
  it('stores a supported padding and rejects unsupported values', () => {
    useUiStore.getState().setSegmentPlayPadding(2);
    expect(useUiStore.getState().segmentPlayPadding).toBe(2);

    useUiStore.getState().setSegmentPlayPadding(99);
    expect(useUiStore.getState().segmentPlayPadding).toBe(0);
  });
});
