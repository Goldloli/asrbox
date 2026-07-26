import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  desktopCapabilities,
  type AppUpdateCheckResult,
  type AppUpdateDownloadState,
  type DesktopAppVersion,
} from '../lib/desktopCapabilities';
import type { UpdateChannel } from './uiStore';

export type AppUpdateCheckStatus = 'idle' | 'checking' | 'success' | 'error';

const idleDownload: AppUpdateDownloadState = {
  status: 'idle',
  version: null,
  filename: null,
  path: null,
  downloadedBytes: 0,
  totalBytes: null,
  progress: null,
  bytesPerSecond: null,
  etaSeconds: null,
  error: null,
};

interface AppUpdateStore {
  versionInfo: DesktopAppVersion;
  checkStatus: AppUpdateCheckStatus;
  checkResult: AppUpdateCheckResult | null;
  checkError: string | null;
  download: AppUpdateDownloadState;
  lastAutomaticCheckAt: number | null;
  setVersionInfo: (value: DesktopAppVersion) => void;
  setCheckStarted: () => void;
  setCheckResult: (value: AppUpdateCheckResult) => void;
  setCheckError: (message: string) => void;
  setDownload: (value: AppUpdateDownloadState) => void;
  setLastAutomaticCheckAt: (value: number) => void;
}

export const useAppUpdateStore = create<AppUpdateStore>()(
  persist(
    (set) => ({
      versionInfo: { version: __ASRBOX_VERSION__, target: 'Web', installerKind: null },
      checkStatus: 'idle',
      checkResult: null,
      checkError: null,
      download: idleDownload,
      lastAutomaticCheckAt: null,
      setVersionInfo: (versionInfo) => set({ versionInfo }),
      setCheckStarted: () => set({ checkStatus: 'checking', checkError: null }),
      setCheckResult: (checkResult) => set({ checkStatus: 'success', checkResult, checkError: null }),
      setCheckError: (checkError) => set({ checkStatus: 'error', checkError }),
      setDownload: (download) => set({ download }),
      setLastAutomaticCheckAt: (lastAutomaticCheckAt) => set({ lastAutomaticCheckAt }),
    }),
    {
      name: 'asrbox-app-update',
      partialize: (state) => ({ lastAutomaticCheckAt: state.lastAutomaticCheckAt }),
    },
  ),
);

function message(error: unknown) {
  return error instanceof Error ? error.message : String(error);
}

export async function loadAppVersion() {
  const value = await desktopCapabilities.getAppVersion();
  useAppUpdateStore.getState().setVersionInfo(value);
  return value;
}

export async function checkForAppUpdate(channel: UpdateChannel) {
  const state = useAppUpdateStore.getState();
  state.setCheckStarted();
  try {
    const result = await desktopCapabilities.checkAppUpdate(channel);
    useAppUpdateStore.getState().setCheckResult(result);
    return result;
  } catch (error) {
    useAppUpdateStore.getState().setCheckError(message(error));
    throw error;
  }
}

export async function startAppUpdateDownload(version: string, channel: UpdateChannel) {
  const value = await desktopCapabilities.startAppUpdateDownload(version, channel);
  useAppUpdateStore.getState().setDownload(value);
  return value;
}

export async function cancelAppUpdateDownload() {
  const value = await desktopCapabilities.cancelAppUpdateDownload();
  useAppUpdateStore.getState().setDownload(value);
  return value;
}
