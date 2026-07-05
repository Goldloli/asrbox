import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { defaultShortcuts, normalizeShortcut, type ShortcutAction, type ShortcutMap } from '../lib/shortcuts';

export type Locale = 'zh' | 'en';
export type ThemeMode = 'system' | 'dark' | 'light';
export type DensityMode = 'comfortable' | 'compact';
export type SidebarMode = 'icons' | 'expanded';
export type FontScale = 'standard' | 'large';
export type ReducedMotionMode = 'system' | 'reduce' | 'normal';

function detectLocale(): Locale {
  if (typeof navigator !== 'undefined' && navigator.language.toLowerCase().startsWith('en')) {
    return 'en';
  }
  return 'zh';
}

interface UiStore {
  locale: Locale;
  theme: ThemeMode;
  density: DensityMode;
  sidebarMode: SidebarMode;
  fontScale: FontScale;
  reducedMotion: ReducedMotionMode;
  shortcuts: ShortcutMap;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setSidebarMode: (sidebarMode: SidebarMode) => void;
  setFontScale: (fontScale: FontScale) => void;
  setReducedMotion: (reducedMotion: ReducedMotionMode) => void;
  setShortcut: (action: ShortcutAction, shortcut: string) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      locale: detectLocale(),
      theme: 'system',
      density: 'comfortable',
      sidebarMode: 'icons',
      fontScale: 'standard',
      reducedMotion: 'system',
      shortcuts: defaultShortcuts,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setFontScale: (fontScale) => set({ fontScale }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setShortcut: (action, shortcut) => set((state) => ({
        shortcuts: { ...defaultShortcuts, ...state.shortcuts, [action]: normalizeShortcut(shortcut) },
      })),
    }),
    { name: 'asrbox-ui' },
  ),
);
