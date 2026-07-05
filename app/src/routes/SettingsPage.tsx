import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Save, Upload } from 'lucide-react';
import { useSearch } from '@tanstack/react-router';
import { apiClient } from '../lib/api';
import { queryKeys, useModelStorageQuery, useRuntimeQuery, useSettingsQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { useServerStore } from '../stores/serverStore';
import { useUiStore, type DensityMode, type FontScale, type Locale, type ReducedMotionMode, type SidebarMode, type ThemeMode } from '../stores/uiStore';
import { Button, ErrorState, Field, Input, Panel, PanelHeader, Select, Switch, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { ConfirmAction } from '../components/ConfirmAction';
import { RuntimeHealthCard } from '../components/RuntimeHealthCard';
import { useI18n } from '../lib/i18n';
import { backendLanguage, languageOptions, normalizeLanguageValue, type TranscriptionLanguage } from '../lib/transcriptionOptions';
import { ProvidersPage } from './ProvidersPage';

type SettingsTab = 'general' | 'transcription' | 'providers' | 'storage';

function normalizeSettingsTab(value: unknown): SettingsTab {
  return value === 'transcription' || value === 'providers' || value === 'storage' ? value : 'general';
}

export function SettingsPage() {
  const queryClient = useQueryClient();
  const { t } = useI18n();
  const toast = useToast();
  const locale = useUiStore((state) => state.locale);
  const theme = useUiStore((state) => state.theme);
  const density = useUiStore((state) => state.density);
  const sidebarMode = useUiStore((state) => state.sidebarMode);
  const fontScale = useUiStore((state) => state.fontScale);
  const reducedMotion = useUiStore((state) => state.reducedMotion);
  const setLocale = useUiStore((state) => state.setLocale);
  const setTheme = useUiStore((state) => state.setTheme);
  const setDensity = useUiStore((state) => state.setDensity);
  const setSidebarMode = useUiStore((state) => state.setSidebarMode);
  const setFontScale = useUiStore((state) => state.setFontScale);
  const setReducedMotion = useUiStore((state) => state.setReducedMotion);
  const { serverUrl, setServerUrl } = useServerStore();
  const settingsQuery = useSettingsQuery();
  const runtimeQuery = useRuntimeQuery();
  const storageQuery = useModelStorageQuery();
  const search = useSearch({ strict: false }) as { tab?: string };
  const [activeTab, setActiveTab] = useState<SettingsTab>(() => normalizeSettingsTab(search.tab));
  const [language, setLanguage] = useState<TranscriptionLanguage>('zh-Hans');
  const [backend, setBackend] = useState('local');
  const [timestamps, setTimestamps] = useState(true);
  const [wordTimestamps, setWordTimestamps] = useState(false);
  const [diarization, setDiarization] = useState(false);
  const [vad, setVad] = useState(true);
  const [localConcurrency, setLocalConcurrency] = useState(1);
  const [providerConcurrency, setProviderConcurrency] = useState(2);
  const [cleanupOptions, setCleanupOptions] = useState({
    delete_normalized: true,
    delete_chunks: true,
    delete_orphans: false,
    delete_old_diagnostics: false,
  });
  const [cleanupResult, setCleanupResult] = useState<{ removed: string[]; errors: string[]; freed_mb: number } | null>(null);
  const importInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    setActiveTab(normalizeSettingsTab(search.tab));
  }, [search.tab]);

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
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      toast.success(t('toast.settingsSaved'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const cleanupDryRun = useMutation({
    mutationFn: () => apiClient.cleanupStorage(cleanupOptions, true),
    onSuccess: (result) => {
      setCleanupResult(result);
      toast.info(t('settings.cleanupEstimated'), `${result.freed_mb} MB`);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const cleanupRun = useMutation({
    mutationFn: () => apiClient.cleanupStorage(cleanupOptions),
    onSuccess: (result) => {
      setCleanupResult(result);
      storageQuery.refetch();
      runtimeQuery.refetch();
      toast.success(t('settings.cleanupComplete'), `${result.freed_mb} MB`);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const exportFrontendSettings = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ui: { locale, theme, density, sidebarMode, fontScale, reducedMotion },
      server: { serverUrl },
    };
    const blobUrl = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
    const link = document.createElement('a');
    link.href = blobUrl;
    link.download = 'asrbox-frontend-settings.json';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
    toast.success(t('settings.exported'));
  };

  const importFrontendSettings = async (file: File) => {
    try {
      const payload = JSON.parse(await file.text()) as { ui?: Record<string, unknown>; server?: { serverUrl?: unknown } };
      const ui = payload.ui ?? {};
      if (ui.locale === 'zh' || ui.locale === 'en') setLocale(ui.locale);
      if (ui.theme === 'system' || ui.theme === 'dark' || ui.theme === 'light') setTheme(ui.theme);
      if (ui.density === 'comfortable' || ui.density === 'compact') setDensity(ui.density);
      if (ui.sidebarMode === 'icons' || ui.sidebarMode === 'expanded') setSidebarMode(ui.sidebarMode);
      if (ui.fontScale === 'standard' || ui.fontScale === 'large') setFontScale(ui.fontScale);
      if (ui.reducedMotion === 'system' || ui.reducedMotion === 'reduce' || ui.reducedMotion === 'normal') setReducedMotion(ui.reducedMotion);
      if (typeof payload.server?.serverUrl === 'string') setServerUrl(payload.server.serverUrl);
      toast.success(t('settings.imported'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  return (
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(normalizeSettingsTab(value))} className="grid gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('settings.eyebrow')} title={t('settings.title')} description={t('settings.description')} />
        <div className="border-b border-white/10 px-5 py-4">
          <TabsList className="flex w-full flex-wrap gap-1 md:w-fit">
            <TabsTrigger value="general">{t('settings.tabGeneral')}</TabsTrigger>
            <TabsTrigger value="transcription">{t('settings.tabTranscription')}</TabsTrigger>
            <TabsTrigger value="providers">{t('settings.tabProviders')}</TabsTrigger>
            <TabsTrigger value="storage">{t('settings.tabStorage')}</TabsTrigger>
          </TabsList>
        </div>
      </Panel>

      <TabsContent value="general">
        <Panel className="overflow-hidden">
          <PanelHeader title={t('settings.tabGeneral')} description={t('settings.generalDescription')} />
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
              <Field label={t('settings.theme')}>
                <Select
                  value={theme}
                  onValueChange={(value) => setTheme(value as ThemeMode)}
                  options={[
                    { value: 'system', label: t('settings.themeSystem') },
                    { value: 'dark', label: t('settings.themeDark') },
                    { value: 'light', label: t('settings.themeLight') },
                  ]}
                />
              </Field>
              <Field label={t('settings.density')}>
                <Select
                  value={density}
                  onValueChange={(value) => setDensity(value as DensityMode)}
                  options={[
                    { value: 'comfortable', label: t('settings.densityComfortable') },
                    { value: 'compact', label: t('settings.densityCompact') },
                  ]}
                />
              </Field>
              <Field label={t('settings.sidebarMode')}>
                <Select
                  value={sidebarMode}
                  onValueChange={(value) => setSidebarMode(value as SidebarMode)}
                  options={[
                    { value: 'icons', label: t('settings.sidebarIcons') },
                    { value: 'expanded', label: t('settings.sidebarExpanded') },
                  ]}
                />
              </Field>
              <Field label={t('settings.fontScale')}>
                <Select
                  value={fontScale}
                  onValueChange={(value) => setFontScale(value as FontScale)}
                  options={[
                    { value: 'standard', label: t('settings.fontScaleStandard') },
                    { value: 'large', label: t('settings.fontScaleLarge') },
                  ]}
                />
              </Field>
              <Field label={t('settings.reducedMotion')}>
                <Select
                  value={reducedMotion}
                  onValueChange={(value) => setReducedMotion(value as ReducedMotionMode)}
                  options={[
                    { value: 'system', label: t('settings.reducedMotionSystem') },
                    { value: 'reduce', label: t('settings.reducedMotionReduce') },
                    { value: 'normal', label: t('settings.reducedMotionNormal') },
                  ]}
                />
              </Field>
            </div>
            <div className="grid gap-3 rounded-xl border app-control p-4">
              <div>
                <h3 className="text-sm font-semibold text-app">{t('settings.importExport')}</h3>
                <p className="mt-1 text-sm text-app-muted">{t('settings.importExportDescription')}</p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={exportFrontendSettings}>
                  <Download className="size-4" />
                  {t('settings.exportSettings')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => importInputRef.current?.click()}>
                  <Upload className="size-4" />
                  {t('settings.importSettings')}
                </Button>
                <input
                  ref={importInputRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.currentTarget.files?.[0];
                    if (file) importFrontendSettings(file);
                    event.currentTarget.value = '';
                  }}
                />
              </div>
            </div>
          </div>
        </Panel>
      </TabsContent>

      <TabsContent value="transcription">
        <Panel className="overflow-hidden">
          <PanelHeader
            title={t('settings.tabTranscription')}
            description={t('settings.transcriptionDescription')}
            action={
              <Button onClick={() => save.mutate()} disabled={save.isPending}>
                <Save className="size-4" />
                {t('common.save')}
              </Button>
            }
          />
          <div className="grid gap-5 p-5">
            <div className="grid gap-4 md:grid-cols-2">
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
      </TabsContent>

      <TabsContent value="providers">
        <ProvidersPage />
      </TabsContent>

      <TabsContent value="storage">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
          <RuntimeHealthCard runtime={runtimeQuery.data} />
          <Panel className="overflow-hidden">
            <PanelHeader
              eyebrow={t('settings.storage')}
              title={t('settings.dataPaths')}
              description={runtimeQuery.data?.data_dir ?? t('settings.backendUnavailable')}
              action={
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => {
                    runtimeQuery.refetch();
                    storageQuery.refetch();
                  }}
                >
                  <RefreshCw className="size-4" />
                  {t('common.refresh')}
                </Button>
              }
            />
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
          <Panel className="overflow-hidden xl:col-span-2">
            <PanelHeader title={t('settings.cleanupStrategy')} description={t('settings.cleanupStrategyDescription')} />
            <div className="grid gap-4 p-5">
              <div className="grid gap-2 md:grid-cols-2">
                <ToggleRow
                  label={t('settings.cleanupNormalized')}
                  checked={cleanupOptions.delete_normalized}
                  onCheckedChange={(checked) => setCleanupOptions((current) => ({ ...current, delete_normalized: checked }))}
                />
                <ToggleRow
                  label={t('settings.cleanupChunks')}
                  checked={cleanupOptions.delete_chunks}
                  onCheckedChange={(checked) => setCleanupOptions((current) => ({ ...current, delete_chunks: checked }))}
                />
                <ToggleRow
                  label={t('settings.cleanupOrphans')}
                  checked={cleanupOptions.delete_orphans}
                  onCheckedChange={(checked) => setCleanupOptions((current) => ({ ...current, delete_orphans: checked }))}
                />
                <ToggleRow
                  label={t('settings.cleanupDiagnostics')}
                  checked={cleanupOptions.delete_old_diagnostics}
                  onCheckedChange={(checked) => setCleanupOptions((current) => ({ ...current, delete_old_diagnostics: checked }))}
                />
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" onClick={() => cleanupDryRun.mutate()} disabled={cleanupDryRun.isPending}>
                  {t('settings.cleanupDryRun')}
                </Button>
                <ConfirmAction
                  title={t('confirm.cleanupTitle')}
                  description={t('confirm.storageCleanupDescription')}
                  confirmLabel={t('settings.cleanupRun')}
                  tone="secondary"
                  onConfirm={() => cleanupRun.mutate()}
                >
                  <Button size="sm" variant="danger" disabled={cleanupRun.isPending}>
                    {t('settings.cleanupRun')}
                  </Button>
                </ConfirmAction>
              </div>
              {cleanupResult && (
                <div className="grid gap-2 rounded-lg border app-control px-3 py-3 text-sm">
                  <p className="text-app">{t('settings.cleanupFreed')}: {cleanupResult.freed_mb} MB</p>
                  <p className="text-app-muted">{t('settings.cleanupRemoved')}: {cleanupResult.removed.length}</p>
                  {cleanupResult.errors.length > 0 && <p className="text-[var(--app-danger)]">{t('settings.cleanupErrors')}: {cleanupResult.errors.length}</p>}
                </div>
              )}
            </div>
          </Panel>
        </section>
      </TabsContent>
    </Tabs>
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
