import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, Save } from 'lucide-react';
import { apiClient } from '../lib/api';
import { queryKeys, useModelStorageQuery, useRuntimeQuery, useSettingsQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { useServerStore } from '../stores/serverStore';
import { useUiStore, type Locale } from '../stores/uiStore';
import { Button, ErrorState, Field, Input, Panel, PanelHeader, Select, Switch } from '../components/weiui';
import { RuntimeHealthCard } from '../components/RuntimeHealthCard';
import { useI18n } from '../lib/i18n';
import { backendLanguage, languageOptions, normalizeLanguageValue, type TranscriptionLanguage } from '../lib/transcriptionOptions';

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const locale = useUiStore((state) => state.locale);
  const setLocale = useUiStore((state) => state.setLocale);
  const { serverUrl, setServerUrl } = useServerStore();
  const settingsQuery = useSettingsQuery();
  const runtimeQuery = useRuntimeQuery();
  const storageQuery = useModelStorageQuery();
  const [language, setLanguage] = useState<TranscriptionLanguage>('zh-Hans');
  const [backend, setBackend] = useState('local');
  const [timestamps, setTimestamps] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [diarization, setDiarization] = useState(false);
  const [vad, setVad] = useState(true);
  const [localConcurrency, setLocalConcurrency] = useState(1);
  const [providerConcurrency, setProviderConcurrency] = useState(2);

  useEffect(() => {
    if (!settingsQuery.data) return;
    setLanguage(normalizeLanguageValue(settingsQuery.data.default_language));
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
        default_language: backendLanguage(language),
        default_backend: backend,
        timestamps,
        word_timestamps: wordTimestamps,
        diarization,
        vad,
        max_concurrent_local_tasks: localConcurrency,
        max_concurrent_provider_tasks: providerConcurrency,
      }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.settings }),
  });

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('settings.eyebrow')}
          title={t('settings.title')}
          description={t('settings.description')}
          action={
            <Button onClick={() => save.mutate()} disabled={save.isPending}>
              <Save className="size-4" />
              {t('common.save')}
            </Button>
          }
        />
        <div className="grid gap-5 p-5">
          <div className="grid gap-4 md:grid-cols-2">
            <Field label={t('settings.interfaceLanguage')}>
              <Select
                value={locale}
                onValueChange={(value) => setLocale(value as Locale)}
                options={[
                  { value: 'zh', label: '中文' },
                  { value: 'en', label: 'English' },
                ]}
              />
            </Field>
            <Field label={t('settings.serverUrl')}>
              <Input value={serverUrl} onChange={(event) => setServerUrl(event.target.value)} />
            </Field>
            <Field label={t('settings.defaultBackend')}>
              <Select
                value={backend}
                onValueChange={setBackend}
                options={[
                  { value: 'local', label: t('settings.local') },
                  { value: 'provider', label: t('settings.provider') },
                ]}
              />
            </Field>
            <Field label={t('settings.defaultLanguage')}>
              <Select value={language} onValueChange={(value) => setLanguage(normalizeLanguageValue(value))} options={languageOptions(locale)} />
            </Field>
            <Field label={t('settings.localConcurrency')}>
              <Input type="number" min={1} max={4} value={localConcurrency} onChange={(event) => setLocalConcurrency(Number(event.target.value))} />
            </Field>
            <Field label={t('settings.providerConcurrency')}>
              <Input type="number" min={1} max={8} value={providerConcurrency} onChange={(event) => setProviderConcurrency(Number(event.target.value))} />
            </Field>
          </div>

          <div className="grid gap-2">
            <ToggleRow label={t('settings.timestamps')} checked={timestamps} onCheckedChange={setTimestamps} />
            <ToggleRow label={t('settings.wordTimestamps')} checked={wordTimestamps} onCheckedChange={setWordTimestamps} />
            <ToggleRow label={t('settings.diarization')} checked={diarization} onCheckedChange={setDiarization} />
            <ToggleRow label={t('settings.vad')} checked={vad} onCheckedChange={setVad} />
          </div>

          {save.error && <ErrorState title={t('common.unableToLoad')} error={save.error} />}
          {settingsQuery.error && <ErrorState title={t('settings.unavailable')} error={settingsQuery.error} />}
        </div>
      </Panel>

      <div className="grid content-start gap-4">
        <RuntimeHealthCard runtime={runtimeQuery.data} />
        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('settings.storage')} title={t('settings.dataPaths')} description={runtimeQuery.data?.data_dir ?? t('settings.backendUnavailable')} />
          <div className="grid gap-3 p-5">
            <PathRow label={t('settings.modelsPath')} value={runtimeQuery.data?.models_dir} />
            <PathRow label={t('settings.freeDisk')} value={formatBytes(runtimeQuery.data?.free_disk_bytes)} />
            <PathRow label={t('settings.storageUsed')} value={formatBytes(storageQuery.data?.used_bytes)} />
            <Button asChild variant="secondary">
              <a href={apiClient.runtimeDiagnosticBundleUrl()}>
                <Download className="size-4" />
                {t('settings.diagnosticBundle')}
              </a>
            </Button>
          </div>
        </Panel>
      </div>
    </section>
  );
}

function ToggleRow({ label, checked, onCheckedChange }: { label: string; checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-3">
      <span className="text-sm text-zinc-300">{label}</span>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function PathRow({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">
      <p className="text-xs text-zinc-600">{label}</p>
      <p className="mt-1 break-all text-sm text-zinc-200">{value || '-'}</p>
    </div>
  );
}
