import { describe, expect, it } from 'bun:test';
import { ACCENT_COLORS, DEFAULT_ACCENT_COLOR, normalizeAccentColor, resolveTheme } from './appearance';

describe('resolveTheme', () => {
  it('maps the system preference onto the OS color scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
  });

  it('keeps explicit light and dark preferences regardless of the OS', () => {
    expect(resolveTheme('light', true)).toBe('light');
    expect(resolveTheme('light', false)).toBe('light');
    expect(resolveTheme('dark', true)).toBe('dark');
    expect(resolveTheme('dark', false)).toBe('dark');
  });
});

describe('normalizeAccentColor', () => {
  it('accepts every supported accent color', () => {
    expect([...ACCENT_COLORS]).toEqual(['orange', 'blue', 'purple', 'pink', 'red', 'green', 'cyan', 'gray']);
    for (const accent of ACCENT_COLORS) {
      expect(normalizeAccentColor(accent)).toBe(accent);
    }
  });

  it('falls back to the default orange accent for unknown values', () => {
    expect(DEFAULT_ACCENT_COLOR).toBe('orange');
    expect(normalizeAccentColor('neon')).toBe('orange');
    expect(normalizeAccentColor('')).toBe('orange');
    expect(normalizeAccentColor(null)).toBe('orange');
    expect(normalizeAccentColor(undefined)).toBe('orange');
    expect(normalizeAccentColor(42)).toBe('orange');
  });
});
