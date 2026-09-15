import { afterEach, describe, expect, it } from 'bun:test';
import { useUiStore } from './uiStore';

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
});

describe('uiStore persisted preference contract', () => {
  it('keeps rehydration on the stable storage key so saved preferences survive upgrades', () => {
    expect(useUiStore.persist.options.name).toBe('asrbox-ui');
  });

  it('restores a saved icon-only sidebar preference instead of the new-user default', () => {
    useUiStore.setState({ sidebarMode: 'icons' });
    expect(useUiStore.getState().sidebarMode).toBe('icons');
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

  it('ignores unsupported accent values instead of storing them', () => {
    const setAccentColor = (useUiStore.getState() as unknown as { setAccentColor?: (value: unknown) => void }).setAccentColor;
    expect(typeof setAccentColor).toBe('function');

    setAccentColor!('green');
    setAccentColor!('neon');
    const state = useUiStore.getState() as unknown as Record<string, unknown>;
    expect(state.accentColor).toBe('green');
  });
});
