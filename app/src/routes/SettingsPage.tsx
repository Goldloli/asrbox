import { useEffect, useRef, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Download, FolderOpen, RefreshCw, RotateCcw, Save, Upload } from 'lucide-react';
import { useSearch } from '@tanstack/react-router';
import { apiClient, type RuntimeStatus } from '../lib/api';
import { queryKeys, useActiveTasksQuery, useHealthQuery, useModelStorageQuery, useModelsQuery, useRuntimeQuery, useSettingsQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { useServerStore } from '../stores/serverStore';
import { useUiStore, type DensityMode, type FontScale, type Locale, type ReducedMotionMode, type SidebarMode, type ThemeMode } from '../stores/uiStore';
import { Badge, Button, ErrorState, Field, Input, Panel, PanelHeader, Select, Tabs, TabsContent, TabsList, TabsTrigger } from '../components/weiui';
import { toastErrorMessage, useToast } from '../components/Toast';
import { ConfirmAction } from '../components/ConfirmAction';
import { useI18n } from '../lib/i18n';
import { backendLanguage, languageOptions, normalizeLanguageValue, type TranscriptionLanguage } from '../lib/transcriptionOptions';
import { ProvidersPage } from './ProvidersPage';
import { LLMProvidersPanel } from '../components/settings/LLMProvidersPanel';
import { formatShortcut, type ShortcutAction } from '../lib/shortcuts';
import { DiagnosticsHealthCenter, PathRow, ToggleRow } from '../components/settings/SettingsHealth';
import { desktopCapabilities } from '../lib/desktopCapabilities';

type SettingsTab = 'general' | 'transcription' | 'providers' | 'llm' | 'storage';

const shortcutActions: ShortcutAction[] = ['newTranscription', 'globalSearch', 'settings', 'commandPalette'];

function normalizeSettingsTab(value: unknown): SettingsTab {
  return value === 'transcription' || value === 'providers' || value === 'llm' || value === 'storage' ? value : 'general';
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
  const exportDirectory = useUiStore((state) => state.exportDirectory);
  const shortcuts = useUiStore((state) => state.shortcuts);
  const setLocale = useUiStore((state) => state.setLocale);
  const setTheme = useUiStore((state) => state.setTheme);
  const setDensity = useUiStore((state) => state.setDensity);
  const setSidebarMode = useUiStore((state) => state.setSidebarMode);
  const setFontScale = useUiStore((state) => state.setFontScale);
  const setReducedMotion = useUiStore((state) => state.setReducedMotion);
  const setExportDirectory = useUiStore((state) => state.setExportDirectory);
  const setShortcut = useUiStore((state) => state.setShortcut);
  const { serverUrl, apiToken, setServerUrl, setApiToken } = useServerStore();
  const settingsQuery = useSettingsQuery();
  const healthQuery = useHealthQuery();
  const runtimeQuery = useRuntimeQuery();
  const storageQuery = useModelStorageQuery();
  const modelsQuery = useModelsQuery();
  const activeTasksQuery = useActiveTasksQuery();
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
  const updateToolPaths = useMutation({
    mutationFn: (patch: { ffmpeg_path?: string | null; ffprobe_path?: string | null }) => apiClient.updateSettings(patch),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.settings });
      queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
      toast.success(t('toast.settingsSaved'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const pickToolPath = async (tool: 'ffmpeg' | 'ffprobe') => {
    try {
      const path = await desktopCapabilities.pickExecutableFile();
      if (!path) return;
      updateToolPaths.mutate(tool === 'ffmpeg' ? { ffmpeg_path: path } : { ffprobe_path: path });
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const chooseExportDirectory = async () => {
    try {
      const path = await desktopCapabilities.pickExportDirectory();
      if (!path) return;
      setExportDirectory(path);
      toast.success(t('toast.settingsSaved'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const exportFrontendSettings = () => {
    const payload = {
      version: 1,
      exportedAt: new Date().toISOString(),
      ui: { locale, theme, density, sidebarMode, fontScale, reducedMotion, exportDirectory, shortcuts },
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
      if (typeof ui.exportDirectory === 'string' || ui.exportDirectory === null) setExportDirectory(ui.exportDirectory);
      if (ui.shortcuts && typeof ui.shortcuts === 'object') {
        Object.entries(ui.shortcuts as Partial<Record<ShortcutAction, unknown>>).forEach(([action, shortcut]) => {
          if (typeof shortcut === 'string' && shortcutActions.includes(action as ShortcutAction)) setShortcut(action as ShortcutAction, shortcut);
        });
      }
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
        <div className="border-b app-border px-5 py-4">
          <TabsList className="flex w-full flex-wrap gap-1 md:w-fit">
            <TabsTrigger value="general">{t('settings.tabGeneral')}</TabsTrigger>
            <TabsTrigger value="transcription">{t('settings.tabTranscription')}</TabsTrigger>
            <TabsTrigger value="providers">{t('settings.tabProviders')}</TabsTrigger>
            <TabsTrigger value="llm">{t('settings.tabLLMProviders')}</TabsTrigger>
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
              <Field label={t('settings.apiToken')}>
                <div className="grid gap-1.5">
                  <Input
                    type="password"
                    autoComplete="off"
                    value={apiToken ?? ''}
                    placeholder={t('settings.apiTokenPlaceholder')}
                    onChange={(event) => setApiToken(event.target.value)}
                  />
                  <p className="text-xs text-app-muted">{t('settings.apiTokenHint')}</p>
                </div>
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
                <h3 className="text-sm font-semibold text-app">{t('settings.exportDirectory')}</h3>
                <p className="mt-1 text-sm text-app-muted">{t('settings.exportDirectoryDescription')}</p>
              </div>
              <div className="grid gap-2 lg:grid-cols-[minmax(0,1fr)_auto_auto]">
                <Input value={exportDirectory ?? t('settings.defaultExportDirectory')} readOnly />
                <Button size="sm" variant="secondary" onClick={chooseExportDirectory} disabled={!desktopCapabilities.canPickExportDirectory}>
                  <FolderOpen className="size-4" />
                  {t('settings.chooseExportDirectory')}
                </Button>
                <Button size="sm" variant="secondary" onClick={() => setExportDirectory(null)} disabled={!exportDirectory}>
                  <RotateCcw className="size-4" />
                  {t('settings.resetExportDirectory')}
                </Button>
              </div>
            </div>
            <div className="grid gap-3 rounded-xl border app-control p-4">
              <div>
                <h3 className="text-sm font-semibold text-app">{t('settings.shortcuts')}</h3>
                <p className="mt-1 text-sm text-app-muted">{t('settings.shortcutsDescription')}</p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {[
                  { action: 'newTranscription' as const, label: t('settings.shortcutNewTranscription') },
                  { action: 'globalSearch' as const, label: t('settings.shortcutGlobalSearch') },
                  { action: 'settings' as const, label: t('settings.shortcutSettings') },
                  { action: 'commandPalette' as const, label: t('settings.shortcutCommandPalette') },
                ].map((item) => (
                  <Field key={item.action} label={item.label}>
                    <Input
                      value={formatShortcut(shortcuts[item.action])}
                      onChange={(event) => setShortcut(item.action, event.target.value)}
                    />
                  </Field>
                ))}
              </div>
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

      <TabsContent value="llm">
        <LLMProvidersPanel />
      </TabsContent>

      <TabsContent value="storage">
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_460px]">
          <DiagnosticsHealthCenter
            connected={healthQuery.isSuccess}
            runtime={runtimeQuery.data}
            storage={storageQuery.data}
            modelCount={modelsQuery.data?.models.length ?? 0}
            downloadedModelCount={(modelsQuery.data?.models ?? []).filter((model) => model.downloaded).length}
            recentError={activeTasksQuery.data?.recent_error}
            onRefresh={() => {
              healthQuery.refetch();
              runtimeQuery.refetch();
              storageQuery.refetch();
              modelsQuery.refetch();
              activeTasksQuery.refetch();
            }}
          />
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
            <PanelHeader
              eyebrow={t('settings.system')}
              title={t('settings.mediaTools')}
              description={t('settings.mediaToolsDescription')}
              action={
                <div className="flex flex-wrap gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      runtimeQuery.refetch();
                      settingsQuery.refetch();
                    }}
                  >
                    <RefreshCw className="size-4" />
                    {t('common.refresh')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => updateToolPaths.mutate({ ffmpeg_path: null, ffprobe_path: null })}
                    disabled={updateToolPaths.isPending}
                  >
                    <RotateCcw className="size-4" />
                    {t('settings.useBundledTools')}
                  </Button>
                </div>
              }
            />
            <div className="grid gap-3 p-5 md:grid-cols-2">
              <MediaToolRow
                label="ffmpeg"
                available={runtimeQuery.data?.ffmpeg_available}
                source={runtimeQuery.data?.ffmpeg_source}
                detectedPath={runtimeQuery.data?.ffmpeg_path}
                configuredPath={settingsQuery.data?.ffmpeg_path}
                version={runtimeQuery.data?.ffmpeg_version}
                error={runtimeQuery.data?.ffmpeg_error}
                canChoose={desktopCapabilities.canPickExecutableFile}
                chooseLabel={t('settings.chooseFfmpeg')}
                isPending={updateToolPaths.isPending}
                onChoose={() => pickToolPath('ffmpeg')}
              />
              <MediaToolRow
                label="ffprobe"
                available={runtimeQuery.data?.ffprobe_available}
                source={runtimeQuery.data?.ffprobe_source}
                detectedPath={runtimeQuery.data?.ffprobe_path}
                configuredPath={settingsQuery.data?.ffprobe_path}
                version={runtimeQuery.data?.ffprobe_version}
                error={runtimeQuery.data?.ffprobe_error}
                canChoose={desktopCapabilities.canPickExecutableFile}
                chooseLabel={t('settings.chooseFfprobe')}
                isPending={updateToolPaths.isPending}
                onChoose={() => pickToolPath('ffprobe')}
              />
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

function MediaToolRow({
  label,
  available,
  source,
  detectedPath,
  configuredPath,
  version,
  error,
  canChoose,
  chooseLabel,
  isPending,
  onChoose,
}: {
  label: string;
  available?: boolean;
  source?: RuntimeStatus['ffmpeg_source'];
  detectedPath?: string | null;
  configuredPath?: string | null;
  version?: string | null;
  error?: string | null;
  canChoose: boolean;
  chooseLabel: string;
  isPending: boolean;
  onChoose: () => void;
}) {
  const { t } = useI18n();
  const sourceLabel = {
    manual: t('settings.toolManual'),
    bundled: t('settings.toolBundled'),
    system: t('settings.toolSystem'),
    missing: t('settings.toolMissing'),
  }[source ?? 'missing'];

  return (
    <div className="grid gap-3 rounded-lg border app-control p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-app">{label}</h3>
          <p className="mt-1 text-xs text-app-muted">{version || error || t('settings.toolUnavailable')}</p>
        </div>
        <Badge tone={available ? 'success' : 'warning'}>{available ? t('common.ready') : t('common.blocked')}</Badge>
      </div>
      <div className="grid gap-2">
        <PathRow label={t('settings.toolSource')} value={sourceLabel} />
        <PathRow label={t('settings.toolConfiguredPath')} value={configuredPath} />
        <PathRow label={t('settings.toolDetectedPath')} value={detectedPath} />
      </div>
      {canChoose && (
        <Button size="sm" variant="secondary" onClick={onChoose} disabled={isPending}>
          <FolderOpen className="size-4" />
          {chooseLabel}
        </Button>
      )}
    </div>
  );
}
