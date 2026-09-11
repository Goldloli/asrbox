import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type Locale = 'zh' | 'en';
export type ThemeMode = 'system' | 'dark' | 'light';
export type DensityMode = 'comfortable' | 'compact';
export type SidebarMode = 'icons' | 'expanded';
export type FontScale = 'standard' | 'large';
export type ReducedMotionMode = 'system' | 'reduce' | 'normal';
export type UpdateChannel = 'stable' | 'prerelease';

const defaultUpdateChannel: UpdateChannel = __ASRBOX_VERSION__.includes('-') ? 'prerelease' : 'stable';

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
  exportDirectory: string | null;
  lastLLMProviderId: string | null;
  updateChannel: UpdateChannel;
  autoCheckUpdates: boolean;
  updateNotifications: boolean;
  setLocale: (locale: Locale) => void;
  setTheme: (theme: ThemeMode) => void;
  setDensity: (density: DensityMode) => void;
  setSidebarMode: (sidebarMode: SidebarMode) => void;
  setFontScale: (fontScale: FontScale) => void;
  setReducedMotion: (reducedMotion: ReducedMotionMode) => void;
  setExportDirectory: (exportDirectory: string | null) => void;
  setLastLLMProviderId: (providerId: string | null) => void;
  setUpdateChannel: (channel: UpdateChannel) => void;
  setAutoCheckUpdates: (enabled: boolean) => void;
  setUpdateNotifications: (enabled: boolean) => void;
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
      exportDirectory: null,
      lastLLMProviderId: null,
      updateChannel: defaultUpdateChannel,
      autoCheckUpdates: true,
      updateNotifications: true,
      setLocale: (locale) => set({ locale }),
      setTheme: (theme) => set({ theme }),
      setDensity: (density) => set({ density }),
      setSidebarMode: (sidebarMode) => set({ sidebarMode }),
      setFontScale: (fontScale) => set({ fontScale }),
      setReducedMotion: (reducedMotion) => set({ reducedMotion }),
      setExportDirectory: (exportDirectory) => set({ exportDirectory }),
      setLastLLMProviderId: (lastLLMProviderId) => set({ lastLLMProviderId }),
      setUpdateChannel: (updateChannel) => set({ updateChannel }),
      setAutoCheckUpdates: (autoCheckUpdates) => set({ autoCheckUpdates }),
      setUpdateNotifications: (updateNotifications) => set({ updateNotifications }),
    }),
    { name: 'asrbox-ui' },
  ),
);
