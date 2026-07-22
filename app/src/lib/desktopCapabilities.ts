export type DesktopRuntime = 'web' | 'tauri';

export interface DesktopServerConnection {
  url: string;
  apiToken: string;
}

export interface DesktopMediaFile {
  path: string;
  name: string;
  size: number;
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
  startServer(): Promise<DesktopServerConnection | null>;
  stopServer(): Promise<void>;
  restartServer(): Promise<DesktopServerConnection | null>;
  openFileLocation(path?: string): Promise<void>;
  pickExportDirectory(): Promise<string | null>;
  pickExecutableFile(): Promise<string | null>;
  pickMediaFiles(): Promise<DesktopMediaFile[]>;
  pickModelStorageDirectory(): Promise<string | null>;
  revealLogs(): Promise<void>;
  saveTextFile(filename: string, contents: string, directory?: string | null): Promise<string | null>;
}

type TauriWindow = Window & {
  __TAURI_INTERNALS__?: unknown;
  __TAURI__?: {
    core?: {
      invoke?: (command: string, args?: Record<string, unknown>) => Promise<unknown>;
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
};
