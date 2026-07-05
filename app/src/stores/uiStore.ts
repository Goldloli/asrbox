import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'zh' | 'en';
export type ThemeMode = 'system' | 'dark' | 'light';
export type DensityMode = 'comfortable' | 'compact';

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
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
}

export const useUiStore = create<UiStore>()(
  persist(
    (set) => ({
      locale: detectLocale(),
      theme: 'system',
      density: 'comfortable',
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
    }),
    { name: 'asrbox-ui' },
  ),
);
