import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface ServerStore {
  serverUrl: string;
  setServerUrl: (serverUrl: string) => void;
}

export const useServerStore = create<ServerStore>()(
  persist(
    (set) => ({
      serverUrl: 'http://127.0.0.1:17494',
      setServerUrl: (serverUrl) => set({ serverUrl }),
    }),
    { name: 'asrbox-server' },
  ),
);

