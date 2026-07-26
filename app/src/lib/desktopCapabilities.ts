export type DesktopRuntime = 'web' | 'tauri';
export type AboutLink =
  | 'author_github'
  | 'author_bilibili'
  | 'repository'
  | 'documentation'
  | 'issues'
  | 'privacy'
  | 'license'
  | 'troubleshooting'
  | 'releases';

export const ABOUT_LINKS: Record<AboutLink, string> = {
  author_github: 'https://github.com/Goldloli',
  author_bilibili: 'https://space.bilibili.com/1599822',
  repository: 'https://github.com/Goldloli/asrbox',
  documentation: 'https://github.com/Goldloli/asrbox#readme',
  issues: 'https://github.com/Goldloli/asrbox/issues/new/choose',
  privacy: 'https://github.com/Goldloli/asrbox/blob/main/docs/privacy.md',
  license: 'https://github.com/Goldloli/asrbox/blob/main/LICENSE',
  troubleshooting: 'https://github.com/Goldloli/asrbox/blob/main/docs/troubleshooting.md',
  releases: 'https://github.com/Goldloli/asrbox/releases',
};

export interface DesktopAppVersion {
  version: string;
  target: string;
  installerKind: string | null;
}

export interface AppUpdateRelease {
  version: string;
  tagName: string;
  name: string;
  notes: string;
  publishedAt: string | null;
  htmlUrl: string;
  assetName: string | null;
  assetSize: number | null;
}

export interface AppUpdateCheckResult {
  currentVersion: string;
  updateAvailable: boolean;
  checkedAtMs: number;
  release: AppUpdateRelease | null;
  releasesUrl: string;
}

export type AppUpdateDownloadStatus =
  | 'idle'
  | 'preparing'
  | 'downloading'
  | 'verifying'
  | 'cancelling'
  | 'cancelled'
  | 'completed'
  | 'error';

export interface AppUpdateDownloadState {
  status: AppUpdateDownloadStatus;
  version: string | null;
  filename: string | null;
  path: string | null;
  downloadedBytes: number;
  totalBytes: number | null;
  progress: number | null;
  bytesPerSecond: number | null;
  etaSeconds: number | null;
  error: string | null;
}

export interface DesktopServerConnection {
  url: string;
  apiToken: string;
}

export interface DesktopMediaFile {
  path: string;
  name: string;
  size: number;
}

export interface MediaDropHandlers {
  onDrop: (paths: string[]) => void;
  onActiveChange: (active: boolean) => void;
}

export interface DesktopCapabilities {
  runtime: DesktopRuntime;
  canOpenFileLocation: boolean;
  canPickExportDirectory: boolean;
  canPickExecutableFile: boolean;
  canPickMediaFiles: boolean;
  canPickModelStorageDirectory: boolean;
  canRevealLogs: boolean;
  canSaveTextFile: boolean;
  canManageAppUpdates: boolean;
  startServer(): Promise<DesktopServerConnection | null>;
  stopServer(): Promise<void>;
  restartServer(): Promise<DesktopServerConnection | null>;
  openFileLocation(path?: string): Promise<void>;
  pickExportDirectory(): Promise<string | null>;
  pickExecutableFile(): Promise<string | null>;
  pickMediaFiles(): Promise<DesktopMediaFile[]>;
  pickModelStorageDirectory(): Promise<string | null>;
  listenMediaFileDrop(handlers: MediaDropHandlers): (() => void) | undefined;
  revealLogs(): Promise<void>;
  saveTextFile(filename: string, contents: string, directory?: string | null): Promise<string | null>;
  getAppVersion(): Promise<DesktopAppVersion>;
  checkAppUpdate(channel: 'stable' | 'prerelease'): Promise<AppUpdateCheckResult>;
  getAppUpdateDownloadState(): Promise<AppUpdateDownloadState>;
  startAppUpdateDownload(version: string, channel: 'stable' | 'prerelease'): Promise<AppUpdateDownloadState>;
  cancelAppUpdateDownload(): Promise<AppUpdateDownloadState>;
  listenAppUpdateDownload(handler: (state: AppUpdateDownloadState) => void): (() => void) | undefined;
  openDownloadedUpdate(): Promise<void>;
  openUpdateFileLocation(): Promise<void>;
  openAboutLink(link: AboutLink): Promise<void>;
}

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: {
    core?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
    };
    event?: {
      listen?: <T>(event: string, handler: (event: { payload: T }) => void) => Promise<() => void>;
    };
  };
};

function tauriInvoke(command: string, args?: Record<string, unknown>) {
  const invoke = (window as TauriWindow).__TAURI__?.core?.invoke;
  if (!invoke) return undefined;
  return invoke(command, args);
}

function isTauriRuntime() {
  if (typeof window === 'undefined') return false;
  const tauriWindow = window as TauriWindow;
  return Boolean(tauriWindow.__TAURI_INTERNALS__ || tauriWindow.__TAURI__?.core?.invoke);
}

async function unavailable(): Promise<never> {
  throw new Error('Desktop capability is unavailable in the web runtime.');
}

function serverConnection(value: unknown): DesktopServerConnection | null {
  if (!value || typeof value !== 'object') return null;
  const candidate = value as { url?: unknown; api_token?: unknown };
  if (typeof candidate.url !== 'string' || typeof candidate.api_token !== 'string') return null;
  return { url: candidate.url, apiToken: candidate.api_token };
}

function mediaFiles(value: unknown): DesktopMediaFile[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const candidate = item as { path?: unknown; name?: unknown; size?: unknown };
    if (typeof candidate.path !== 'string' || typeof candidate.name !== 'string' || typeof candidate.size !== 'number') return [];
    return [{ path: candidate.path, name: candidate.name, size: candidate.size }];
  });
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}

function nullableString(value: unknown) {
  return typeof value === 'string' ? value : null;
}

function nullableNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function appVersionInfo(value: unknown): DesktopAppVersion {
  const candidate = record(value);
  return {
    version: typeof candidate.version === 'string' ? candidate.version : __ASRBOX_VERSION__,
    target: typeof candidate.target === 'string' ? candidate.target : 'Web',
    installerKind: nullableString(candidate.installer_kind),
  };
}

function updateRelease(value: unknown): AppUpdateRelease | null {
  const candidate = record(value);
  if (typeof candidate.version !== 'string' || typeof candidate.tag_name !== 'string' || typeof candidate.html_url !== 'string') return null;
  return {
    version: candidate.version,
    tagName: candidate.tag_name,
    name: typeof candidate.name === 'string' ? candidate.name : candidate.tag_name,
    notes: typeof candidate.notes === 'string' ? candidate.notes : '',
    publishedAt: nullableString(candidate.published_at),
    htmlUrl: candidate.html_url,
    assetName: nullableString(candidate.asset_name),
    assetSize: nullableNumber(candidate.asset_size),
  };
}

function updateCheckResult(value: unknown): AppUpdateCheckResult {
  const candidate = record(value);
  return {
    currentVersion: typeof candidate.current_version === 'string' ? candidate.current_version : __ASRBOX_VERSION__,
    updateAvailable: candidate.update_available === true,
    checkedAtMs: typeof candidate.checked_at_ms === 'number' ? candidate.checked_at_ms : Date.now(),
    release: updateRelease(candidate.release),
    releasesUrl: typeof candidate.releases_url === 'string' ? candidate.releases_url : ABOUT_LINKS.releases,
  };
}

function updateDownloadState(value: unknown): AppUpdateDownloadState {
  const candidate = record(value);
  const status = typeof candidate.status === 'string' ? candidate.status : 'idle';
  const validStatus: AppUpdateDownloadStatus = (
    ['idle', 'preparing', 'downloading', 'verifying', 'cancelling', 'cancelled', 'completed', 'error'] as string[]
  ).includes(status) ? status as AppUpdateDownloadStatus : 'idle';
  return {
    status: validStatus,
    version: nullableString(candidate.version),
    filename: nullableString(candidate.filename),
    path: nullableString(candidate.path),
    downloadedBytes: nullableNumber(candidate.downloaded_bytes) ?? 0,
    totalBytes: nullableNumber(candidate.total_bytes),
    progress: nullableNumber(candidate.progress),
    bytesPerSecond: nullableNumber(candidate.bytes_per_second),
    etaSeconds: nullableNumber(candidate.eta_seconds),
    error: nullableString(candidate.error),
  };
}

export const desktopCapabilities: DesktopCapabilities = {
  get runtime() {
    return isTauriRuntime() ? 'tauri' : 'web';
  },
  get canOpenFileLocation() {
    return isTauriRuntime();
  },
  get canPickExportDirectory() {
    return isTauriRuntime();
  },
  get canPickExecutableFile() {
    return isTauriRuntime();
  },
  get canPickMediaFiles() {
    return isTauriRuntime();
  },
  get canPickModelStorageDirectory() {
    return isTauriRuntime();
  },
  get canRevealLogs() {
    return isTauriRuntime();
  },
  get canSaveTextFile() {
    return isTauriRuntime();
  },
  get canManageAppUpdates() {
    return isTauriRuntime();
  },
  async startServer() {
    const result = tauriInvoke('start_server');
    if (!result) return null;
    return serverConnection(await result);
  },
  async stopServer() {
    const result = tauriInvoke('stop_server');
    if (!result) return unavailable();
    await result;
  },
  async restartServer() {
    const result = tauriInvoke('restart_server');
    if (!result) return null;
    return serverConnection(await result);
  },
  async openFileLocation(path?: string) {
    const result = tauriInvoke('open_file_location', { path });
    if (!result) return unavailable();
    await result;
  },
  async pickExportDirectory() {
    const result = tauriInvoke('pick_export_directory');
    if (!result) return unavailable();
    const value = await result;
    return typeof value === 'string' ? value : null;
  },
  async pickExecutableFile() {
    const result = tauriInvoke('pick_executable_file');
    if (!result) return unavailable();
    const value = await result;
    return typeof value === 'string' ? value : null;
  },
  async pickMediaFiles() {
    const result = tauriInvoke('pick_media_files');
    if (!result) return unavailable();
    return mediaFiles(await result);
  },
  listenMediaFileDrop(handlers: MediaDropHandlers) {
    const listen = (window as TauriWindow).__TAURI__?.event?.listen;
    if (!listen) return undefined;
    let cancelled = false;
    const unlisteners: Array<() => void> = [];
    const register = async () => {
      const drop = await listen<{ paths?: unknown }>('tauri://drag-drop', (event) => {
        const paths = Array.isArray(event.payload?.paths) ? event.payload.paths.filter((item): item is string => typeof item === 'string') : [];
        handlers.onActiveChange(false);
        if (paths.length > 0) handlers.onDrop(paths);
      });
      const enter = await listen<unknown>('tauri://drag-enter', () => handlers.onActiveChange(true));
      const leave = await listen<unknown>('tauri://drag-leave', () => handlers.onActiveChange(false));
      if (cancelled) {
        drop();
        enter();
        leave();
        return;
      }
      unlisteners.push(drop, enter, leave);
    };
    void register();
    return () => {
      cancelled = true;
      unlisteners.splice(0).forEach((unlisten) => unlisten());
    };
  },
  async pickModelStorageDirectory() {
    const result = tauriInvoke('pick_model_storage_directory');
    if (!result) return unavailable();
    const value = await result;
    return typeof value === 'string' ? value : null;
  },
  async revealLogs() {
    const result = tauriInvoke('reveal_logs');
    if (!result) return unavailable();
    await result;
  },
  async saveTextFile(filename: string, contents: string, directory?: string | null) {
    const result = tauriInvoke('save_text_file', { filename, contents, directory });
    if (!result) return unavailable();
    const value = await result;
    return typeof value === 'string' ? value : null;
  },
  async getAppVersion() {
    const result = tauriInvoke('get_app_version');
    if (!result) return { version: __ASRBOX_VERSION__, target: 'Web', installerKind: null };
    return appVersionInfo(await result);
  },
  async checkAppUpdate(channel) {
    const result = tauriInvoke('check_app_update', { channel });
    if (!result) return unavailable();
    return updateCheckResult(await result);
  },
  async getAppUpdateDownloadState() {
    const result = tauriInvoke('get_app_update_download_state');
    if (!result) return unavailable();
    return updateDownloadState(await result);
  },
  async startAppUpdateDownload(version, channel) {
    const result = tauriInvoke('start_app_update_download', { version, channel });
    if (!result) return unavailable();
    return updateDownloadState(await result);
  },
  async cancelAppUpdateDownload() {
    const result = tauriInvoke('cancel_app_update_download');
    if (!result) return unavailable();
    return updateDownloadState(await result);
  },
  listenAppUpdateDownload(handler) {
    const listen = (window as TauriWindow).__TAURI__?.event?.listen;
    if (!listen) return undefined;
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen<unknown>('app-update-download-progress', (event) => handler(updateDownloadState(event.payload))).then((cleanup) => {
      if (cancelled) cleanup();
      else unlisten = cleanup;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  },
  async openDownloadedUpdate() {
    const result = tauriInvoke('open_downloaded_update');
    if (!result) return unavailable();
    await result;
  },
  async openUpdateFileLocation() {
    const result = tauriInvoke('open_update_file_location');
    if (!result) return unavailable();
    await result;
  },
  async openAboutLink(link) {
    const result = tauriInvoke('open_about_link', { link });
    if (result) {
      await result;
      return;
    }
    window.open(ABOUT_LINKS[link], '_blank', 'noopener,noreferrer');
  },
};
