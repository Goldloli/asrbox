import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ServerStore {
  serverUrl: string;
  apiToken: string | null;
  setServerUrl: (serverUrl: string) => void;
  setServerConnection: (serverUrl: string, apiToken: string | null) => void;
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set) => ({
      serverUrl: 'http://127.0.0.1:17494',
      apiToken: null,
      setServerUrl: (serverUrl) => set({ serverUrl, apiToken: null }),
      setServerConnection: (serverUrl, apiToken) => set({ serverUrl, apiToken }),
    }),
    {
      name: 'asrbox-server',
      partialize: (state) => ({ serverUrl: state.serverUrl }),
    },
  ),
);
