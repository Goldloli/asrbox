export type DesktopRuntime = 'web' | 'tauri';

export interface DesktopCapabilities {
  runtime: DesktopRuntime;
  canOpenFileLocation: boolean;
  canPickExportDirectory: boolean;
  canRevealLogs: boolean;
  openFileLocation(path?: string): Promise<void>;
  pickExportDirectory(): Promise<string | null>;
  revealLogs(): Promise<void>;
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
  get canRevealLogs() {
    return isTauriRuntime();
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
  async revealLogs() {
    const result = tauriInvoke('reveal_logs');
    if (!result) return unavailable();
    await result;
  },
};
