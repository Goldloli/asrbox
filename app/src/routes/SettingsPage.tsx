import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Save } from 'lucide-react';
import { apiClient } from '../lib/api';
import { useServerStore } from '../stores/serverStore';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { serverUrl, setServerUrl } = useServerStore();
  const settingsQuery = useQuery({ queryKey: ['settings'], queryFn: () => apiClient.getSettings() });
  const [language, setLanguage] = useState('zh');
  const [backend, setBackend] = useState('local');
  const [timestamps, setTimestamps] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [diarization, setDiarization] = useState(false);
  const [vad, setVad] = useState(true);
  const [localConcurrency, setLocalConcurrency] = useState(1);
  const [providerConcurrency, setProviderConcurrency] = useState(2);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setLanguage(settingsQuery.data.default_language);
    setBackend(settingsQuery.data.default_backend);
    setTimestamps(settingsQuery.data.timestamps);
    setWordTimestamps(settingsQuery.data.word_timestamps);
    setDiarization(settingsQuery.data.diarization);
    setVad(settingsQuery.data.vad);
    setLocalConcurrency(settingsQuery.data.max_concurrent_local_tasks);
    setProviderConcurrency(settingsQuery.data.max_concurrent_provider_tasks);
  }, [settingsQuery.data]);

  const save = useMutation({
    mutationFn: () =>
      apiClient.updateSettings({
        default_language: language,
        default_backend: backend,
        timestamps,
        word_timestamps: wordTimestamps,
        diarization,
        vad,
        max_concurrent_local_tasks: localConcurrency,
        max_concurrent_provider_tasks: providerConcurrency,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['settings'] }),
  });

  return (
    <section className="page settings-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Preferences</p>
          <h1>Settings</h1>
        </div>
        <button className="primary-button" onClick={() => save.mutate()} disabled={save.isPending}>
          <Save size={17} /> Save
        </button>
      </header>

      <div className="settings-list">
        <SettingRow label="Server URL">
          <input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
        </SettingRow>
        <SettingRow label="Default backend">
          <select value={backend} onChange={(event) => setBackend(event.target.value)}>
            <option value="local">Local</option>
            <option value="provider">Provider</option>
          </select>
        </SettingRow>
        <SettingRow label="Default language">
          <input value={language} onChange={(event) => setLanguage(event.target.value)} />
        </SettingRow>
        <SettingRow label="Timestamps"><input type="checkbox" checked={timestamps} onChange={(event) => setTimestamps(event.target.checked)} /></SettingRow>
        <SettingRow label="Word timestamps"><input type="checkbox" checked={wordTimestamps} onChange={(event) => setWordTimestamps(event.target.checked)} /></SettingRow>
        <SettingRow label="Diarization"><input type="checkbox" checked={diarization} onChange={(event) => setDiarization(event.target.checked)} /></SettingRow>
        <SettingRow label="VAD"><input type="checkbox" checked={vad} onChange={(event) => setVad(event.target.checked)} /></SettingRow>
        <SettingRow label="Local concurrency">
          <input type="number" min={1} max={4} value={localConcurrency} onChange={(event) => setLocalConcurrency(Number(event.target.value))} />
        </SettingRow>
        <SettingRow label="Provider concurrency">
          <input type="number" min={1} max={8} value={providerConcurrency} onChange={(event) => setProviderConcurrency(Number(event.target.value))} />
        </SettingRow>
      </div>
      {save.error && <p className="error">{save.error.message}</p>}
    </section>
  );
}

function SettingRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="setting-row">
      <span>{label}</span>
      <div>{children}</div>
    </label>
  );
}
