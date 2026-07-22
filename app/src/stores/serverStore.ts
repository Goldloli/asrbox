import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ServerStore {
  serverUrl: string;
  apiToken: string | null;
  setServerUrl: (serverUrl: string) => void;
  setApiToken: (apiToken: string | null) => void;
  setServerConnection: (serverUrl: string, apiToken: string | null) => void;
}

const SESSION_TOKEN_KEY = 'asrbox-api-token';

function defaultServerUrl() {
  const configured = import.meta.env.VITE_ASRBOX_SERVER_URL?.trim();
  if (configured === 'same-origin' && typeof window !== 'undefined') return window.location.origin;
  return configured || 'http://127.0.0.1:17494';
}

function sessionApiToken() {
  if (typeof window === 'undefined') return null;
  return window.sessionStorage.getItem(SESSION_TOKEN_KEY);
}

function storeSessionApiToken(apiToken: string | null) {
  if (typeof window === 'undefined') return;
  if (apiToken) window.sessionStorage.setItem(SESSION_TOKEN_KEY, apiToken);
  else window.sessionStorage.removeItem(SESSION_TOKEN_KEY);
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set) => ({
      serverUrl: defaultServerUrl(),
      apiToken: sessionApiToken(),
      setServerUrl: (serverUrl) => {
        storeSessionApiToken(null);
        set({ serverUrl, apiToken: null });
      },
      setApiToken: (apiToken) => {
        const normalized = apiToken?.trim() || null;
        storeSessionApiToken(normalized);
        set({ apiToken: normalized });
      },
      setServerConnection: (serverUrl, apiToken) => {
        storeSessionApiToken(apiToken);
        set({ serverUrl, apiToken });
      },
    }),
    {
      name: 'asrbox-server',
      partialize: (state) => ({ serverUrl: state.serverUrl }),
    },
  ),
);
