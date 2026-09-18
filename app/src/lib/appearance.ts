export const ACCENT_COLORS = ['orange', 'blue', 'purple', 'pink', 'red', 'green', 'cyan', 'gray'] as const;

export type AccentColor = (typeof ACCENT_COLORS)[number];

export const DEFAULT_ACCENT_COLOR: AccentColor = 'orange';

export type ResolvedTheme = 'light' | 'dark';

export type ThemePreference = 'system' | 'dark' | 'light';

export function resolveTheme(theme: ThemePreference, systemPrefersDark: boolean): ResolvedTheme {
  if (theme === 'system') return systemPrefersDark ? 'dark' : 'light';
  return theme;
}

export function normalizeAccentColor(value: unknown): AccentColor {
  return (ACCENT_COLORS as readonly string[]).includes(value as AccentColor)
    ? (value as AccentColor)
    : DEFAULT_ACCENT_COLOR;
}
