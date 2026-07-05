import { create } from 'zustand';
import { persist } from 'zustand/middleware';

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
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setSidebarMode: (sidebarMode: SidebarMode) => void;
  setFontScale: (fontScale: FontScale) => void;
  setReducedMotion: (reducedMotion: ReducedMotionMode) => void;
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
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setFontScale: (fontScale) => set({ fontScale }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
    }),
    { name: 'asrbox-ui' },
  ),
);
