import {
  Bell,
  CheckCircle2,
  Download,
  ExternalLink,
  FileCheck2,
  FolderOpen,
  Github,
  Info,
  Loader2,
  RefreshCw,
  ShieldAlert,
  UserRound,
  XCircle,
} from 'lucide-react';
import {
  desktopCapabilities,
  type AboutLink,
  type AppUpdateRelease,
} from '../../lib/desktopCapabilities';
import { formatBytes, formatDate, formatPercent } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { localizedErrorPresentation } from '../../lib/errorMessages';
import { LocalizedTechnicalMessage } from '../LocalizedTechnicalMessage';
import { useCudaAccelerationQuery, useHealthQuery } from '../../lib/queries';
import {
  cancelAppUpdateDownload,
  checkForAppUpdate,
  startAppUpdateDownload,
  useAppUpdateStore,
} from '../../stores/appUpdateStore';
import { useUiStore, type UpdateChannel } from '../../stores/uiStore';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, DataRow, Panel, PanelHeader, Progress, Select, Switch } from '../weiui';
import asrboxIcon from '../../assets/asrbox-icon-256.png';

const activeDownloadStatuses = new Set(['preparing', 'downloading', 'verifying', 'cancelling']);

export function AboutSettings() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const updateChannel = useUiStore((state) => state.updateChannel);
  const autoCheckUpdates = useUiStore((state) => state.autoCheckUpdates);
  const updateNotifications = useUiStore((state) => state.updateNotifications);
  const setUpdateChannel = useUiStore((state) => state.setUpdateChannel);
  const setAutoCheckUpdates = useUiStore((state) => state.setAutoCheckUpdates);
  const setUpdateNotifications = useUiStore((state) => state.setUpdateNotifications);
  const versionInfo = useAppUpdateStore((state) => state.versionInfo);
  const checkStatus = useAppUpdateStore((state) => state.checkStatus);
  const checkResult = useAppUpdateStore((state) => state.checkResult);
  const checkError = useAppUpdateStore((state) => state.checkError);
  const download = useAppUpdateStore((state) => state.download);
  const isDesktop = desktopCapabilities.canManageAppUpdates;
  const isWindowsDesktop = isDesktop && versionInfo.target === 'Windows';
  const cudaQuery = useCudaAccelerationQuery(isWindowsDesktop);
  const healthQuery = useHealthQuery(isWindowsDesktop);
  const cudaAcceleration = cudaQuery.data;
  const cudaActive = cudaAcceleration?.status === 'enabled' && healthQuery.data?.gpu_available === true;
  const release = checkResult?.release;
  const hasUpdate = Boolean(checkResult?.updateAvailable && release);
  const downloadActive = activeDownloadStatuses.has(download.status);

  const run = async (action: () => Promise<unknown>) => {
    try {
      await action();
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const openLink = (link: AboutLink) => run(() => desktopCapabilities.openAboutLink(link));
  const downloadUpdate = () => {
    if (!release) return Promise.resolve();
    return startAppUpdateDownload(release.version, updateChannel);
  };

  return (
    <div className="grid gap-4">
      <Panel className="overflow-hidden">
        <div className="relative overflow-hidden px-5 py-6">
          <div className="pointer-events-none absolute -right-20 -top-24 size-72 rounded-full bg-[var(--app-accent-soft)] blur-3xl" />
          <div className="relative grid gap-5 md:grid-cols-[auto_minmax(0,1fr)_auto] md:items-center">
            <img src={asrboxIcon} alt="ASRbox" className="size-24 rounded-[24px] shadow-xl ring-1 ring-[var(--app-border)]" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-2xl font-semibold tracking-tight text-app">ASRbox</h2>
                <Badge tone="warning">{t('about.publicBeta')}</Badge>
              </div>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-app-muted">{t('about.productDescription')}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <Badge tone="accent">v{versionInfo.version}</Badge>
                <Badge>{isDesktop ? t('about.desktopRuntime') : t('about.webRuntime')}</Badge>
                {versionInfo.target.toLocaleLowerCase() !== (isDesktop ? 'desktop' : 'web') && (
                  <Badge>{versionInfo.target}</Badge>
                )}
                {isWindowsDesktop && cudaAcceleration && (
                  <Badge tone={cudaActive ? 'success' : 'neutral'}>
                    {cudaActive
                      ? t('about.cudaEnabled', { device: cudaAcceleration.probe.cuda_device_name ?? 'GPU' })
                      : cudaAcceleration.supported
                        ? t('about.cudaNotEnabled')
                        : t('about.cudaUnavailable')}
                  </Badge>
                )}
              </div>
            </div>
            <Button variant="secondary" onClick={() => openLink('repository')}>
              <Github className="size-4" />
              GitHub
              <ExternalLink className="size-3.5" />
            </Button>
          </div>
        </div>
      </Panel>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(360px,0.65fr)]">
        <Panel className="overflow-hidden">
          <PanelHeader
            eyebrow={t('about.updateEyebrow')}
            title={t('about.updateTitle')}
            description={isDesktop ? t('about.updateDescription') : t('about.webUpdateHint')}
            action={
              isDesktop ? (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={checkStatus === 'checking'}
                  onClick={() => run(() => checkForAppUpdate(updateChannel))}
                >
                  {checkStatus === 'checking' ? <Loader2 className="size-4 animate-spin" /> : <RefreshCw className="size-4" />}
                  {checkStatus === 'checking' ? t('about.checking') : t('about.checkNow')}
                </Button>
              ) : (
                <Button size="sm" variant="secondary" onClick={() => openLink('releases')}>
                  {t('about.viewReleases')}
                  <ExternalLink className="size-3.5" />
                </Button>
              )
            }
          />
          <div className="grid gap-4 p-5">
            {isDesktop && (
              <>
                <div className="grid gap-3 rounded-xl border app-control p-4">
                  <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_220px] md:items-end">
                    <div>
                      <h3 className="text-sm font-semibold text-app">{t('about.updatePreferences')}</h3>
                      <p className="mt-1 text-sm text-app-muted">{t('about.updatePreferencesDescription')}</p>
                    </div>
                    <label className="grid gap-2 text-xs font-medium text-app-muted">
                      {t('about.updateChannel')}
                      <Select
                        value={updateChannel}
                        onValueChange={(value) => setUpdateChannel(value as UpdateChannel)}
                        options={[
                          { value: 'stable', label: t('about.channelStable') },
                          { value: 'prerelease', label: t('about.channelPrerelease') },
                        ]}
                      />
                    </label>
                  </div>
                  <PreferenceRow
                    icon={<RefreshCw className="size-4" />}
                    title={t('about.autoCheck')}
                    description={t('about.autoCheckDescription')}
                    checked={autoCheckUpdates}
                    onCheckedChange={setAutoCheckUpdates}
                  />
                  <PreferenceRow
                    icon={<Bell className="size-4" />}
                    title={t('about.updateNotifications')}
                    description={t('about.updateNotificationsDescription')}
                    checked={updateNotifications}
                    disabled={!autoCheckUpdates}
                    onCheckedChange={setUpdateNotifications}
                  />
                </div>

                <UpdateResult
                  checkStatus={checkStatus}
                  checkError={checkError}
                  hasUpdate={hasUpdate}
                  release={release}
                  checkedAtMs={checkResult?.checkedAtMs}
                  onOpenReleases={() => openLink('releases')}
                  onDownload={() => run(downloadUpdate)}
                  downloadActive={downloadActive}
                  t={t}
                />

                {download.status !== 'idle' && (
                  <DownloadCard
                    onCancel={() => run(cancelAppUpdateDownload)}
                    onRetry={() => run(downloadUpdate)}
                    onOpen={() => run(() => desktopCapabilities.openDownloadedUpdate())}
                    onOpenLocation={() => run(() => desktopCapabilities.openUpdateFileLocation())}
                  />
                )}
              </>
            )}

            {isDesktop && (
              <div className="rounded-xl border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
                <div className="flex gap-3">
                  <ShieldAlert className="mt-0.5 size-5 shrink-0 text-app-accent" />
                  <div>
                    <h3 className="text-sm font-semibold text-app">{t('about.unsignedTitle')}</h3>
                    <p className="mt-1 text-sm leading-6 text-app-muted">{versionInfo.installerKind === 'nsis' ? t('about.unsignedDescriptionWindows') : t('about.unsignedDescription')}</p>
                    <Button className="mt-3" size="sm" variant="secondary" onClick={() => openLink('troubleshooting')}>
                      {t('about.installHelp')}
                      <ExternalLink className="size-3.5" />
                    </Button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </Panel>

        <Panel className="overflow-hidden">
          <PanelHeader eyebrow={t('about.supportEyebrow')} title={t('about.supportTitle')} description={t('about.supportDescription')} />
          <div className="grid gap-4 p-5">
            <div className="rounded-xl border app-control p-4">
              <div className="flex items-center gap-3">
                <div className="grid size-10 place-items-center rounded-xl border app-control text-app-accent">
                  <UserRound className="size-5" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-app">Goldloli 小卡塔克</p>
                  <p className="text-xs text-app-muted">© 2026 Goldloli 小卡塔克</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                <Button size="sm" variant="secondary" onClick={() => openLink('author_github')}>GitHub</Button>
                <Button size="sm" variant="secondary" onClick={() => openLink('author_bilibili')}>{t('about.bilibili')}</Button>
              </div>
            </div>
            <div className="grid gap-2">
              <AboutLinkButton label={t('about.documentation')} onClick={() => openLink('documentation')} />
              <AboutLinkButton label={t('about.reportIssue')} hint={t('about.reportIssueHint')} onClick={() => openLink('issues')} />
              <AboutLinkButton label={t('about.privacy')} onClick={() => openLink('privacy')} />
              <AboutLinkButton label={t('about.license')} onClick={() => openLink('license')} />
              <AboutLinkButton label={t('about.releases')} onClick={() => openLink('releases')} />
            </div>
          </div>
        </Panel>
      </div>
    </div>
  );
}

function PreferenceRow({
  icon,
  title,
  description,
  checked,
  disabled,
  onCheckedChange,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  disabled?: boolean;
  onCheckedChange: (checked: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-4 rounded-xl border app-control px-4 py-3">
      <div className="flex min-w-0 items-start gap-3">
        <span className="mt-0.5 text-app-accent">{icon}</span>
        <div>
          <p className="text-sm font-medium text-app">{title}</p>
          <p className="mt-1 text-xs leading-5 text-app-muted">{description}</p>
        </div>
      </div>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function UpdateResult({
  checkStatus,
  checkError,
  hasUpdate,
  release,
  checkedAtMs,
  onOpenReleases,
  onDownload,
  downloadActive,
  t,
}: {
  checkStatus: 'idle' | 'checking' | 'success' | 'error';
  checkError: string | null;
  hasUpdate: boolean;
  release: AppUpdateRelease | null | undefined;
  checkedAtMs?: number;
  onOpenReleases: () => void;
  onDownload: () => void;
  downloadActive: boolean;
  t: ReturnType<typeof useI18n>['t'];
}) {
  if (checkStatus === 'idle') {
    return <StatusBox icon={<Info className="size-5" />} title={t('about.checkPrompt')} body={t('about.checkPromptDescription')} />;
  }
  if (checkStatus === 'checking') {
    return <StatusBox icon={<Loader2 className="size-5 animate-spin" />} title={t('about.checking')} body={t('about.checkingDescription')} />;
  }
  if (checkStatus === 'error') {
    return (
      <StatusBox
        danger
        icon={<XCircle className="size-5" />}
        title={t('about.checkFailed')}
        body={checkError ?? t('about.checkFailedDescription')}
        action={<Button size="sm" variant="secondary" onClick={onOpenReleases}>{t('about.viewReleases')}</Button>}
      />
    );
  }
  if (!release) {
    return <StatusBox icon={<Info className="size-5" />} title={t('about.noRelease')} body={t('about.noReleaseDescription')} />;
  }
  if (!hasUpdate) {
    return (
      <StatusBox
        success
        icon={<CheckCircle2 className="size-5" />}
        title={t('about.upToDate')}
        body={checkedAtMs ? t('about.lastChecked', { date: new Date(checkedAtMs).toLocaleString() }) : undefined}
      />
    );
  }
  return (
    <div className="grid gap-3 rounded-xl border border-[color:var(--app-accent)] bg-[var(--app-accent-soft)] p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <Badge tone="accent">{t('about.newVersion')}</Badge>
            <h3 className="text-base font-semibold text-app">ASRbox v{release.version}</h3>
          </div>
          <p className="mt-2 text-xs text-app-muted">{release.publishedAt ? formatDate(release.publishedAt) : release.tagName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="secondary" onClick={onOpenReleases}>
            {t('about.releasePage')}
            <ExternalLink className="size-3.5" />
          </Button>
          {release.assetName && (
            <Button size="sm" disabled={downloadActive} onClick={onDownload}>
              <Download className="size-4" />
              {t('about.downloadUpdate')}
            </Button>
          )}
        </div>
      </div>
      {release.notes && <p className="line-clamp-5 text-sm leading-6 text-app-muted">{release.notes}</p>}
      <div className="grid gap-1 border-t app-border pt-3">
        <DataRow label={t('about.releaseAsset')} value={release.assetName ?? t('about.noInstaller')} />
        <DataRow label={t('about.downloadSize')} value={formatBytes(release.assetSize)} />
      </div>
    </div>
  );
}

function DownloadCard({
  onCancel,
  onRetry,
  onOpen,
  onOpenLocation,
}: {
  onCancel: () => void;
  onRetry: () => void;
  onOpen: () => void;
  onOpenLocation: () => void;
}) {
  const { locale, t } = useI18n();
  const download = useAppUpdateStore((state) => state.download);
  const installerKind = useAppUpdateStore((state) => state.versionInfo.installerKind);
  const active = activeDownloadStatuses.has(download.status);
  const description = [
    formatBytes(download.downloadedBytes),
    download.totalBytes ? `/ ${formatBytes(download.totalBytes)}` : null,
    download.bytesPerSecond ? `· ${formatBytes(download.bytesPerSecond)}/s` : null,
    download.etaSeconds != null && download.status === 'downloading' ? `· ${t('about.eta', { time: formatEta(download.etaSeconds) })}` : null,
  ].filter(Boolean).join(' ');
  return (
    <div className="grid gap-3 rounded-xl border app-control p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-app">{downloadStatusLabel(download.status, t)}</h3>
          <p className="mt-1 text-xs text-app-muted">{download.filename ?? download.version ?? t('about.applicationUpdate')}</p>
        </div>
        <Badge tone={download.status === 'error' ? 'danger' : download.status === 'completed' ? 'success' : 'warning'}>
          {download.progress != null ? formatPercent(download.progress) : download.status}
        </Badge>
      </div>
      {active && (
        <>
          <Progress value={download.progress} />
          <p className="text-xs text-app-muted">{description}</p>
          <Button size="sm" variant="secondary" onClick={onCancel} disabled={download.status === 'cancelling'}>
            {t('common.cancel')}
          </Button>
        </>
      )}
      {download.status === 'error' && (
        <>
          <LocalizedTechnicalMessage message={localizedErrorPresentation(new Error(download.error ?? ''), locale)} className="text-sm text-[var(--app-danger)]" />
          <Button size="sm" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>
        </>
      )}
      {download.status === 'cancelled' && <Button size="sm" variant="secondary" onClick={onRetry}>{t('common.retry')}</Button>}
      {download.status === 'completed' && (
        <>
          <div className="flex items-start gap-3 rounded-lg border border-[color:var(--app-success)] bg-[var(--app-success-soft)] p-3">
            <FileCheck2 className="mt-0.5 size-5 shrink-0 text-[var(--app-success)]" />
            <div>
              <p className="text-sm font-medium text-app">{t('about.downloadVerified')}</p>
              <p className="mt-1 text-xs leading-5 text-app-muted">{t('about.manualInstallDescription')}</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={onOpen}>{installerKind === 'nsis' ? t('about.openInstallerNsis') : t('about.openInstaller')}</Button>
            <Button size="sm" variant="secondary" onClick={onOpenLocation}>
              <FolderOpen className="size-4" />
              {t('about.openFileLocation')}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function StatusBox({
  icon,
  title,
  body,
  action,
  danger,
  success,
}: {
  icon: React.ReactNode;
  title: string;
  body?: string;
  action?: React.ReactNode;
  danger?: boolean;
  success?: boolean;
}) {
  return (
    <div className={`flex items-start gap-3 rounded-xl border p-4 ${danger ? 'border-[color:var(--app-danger)] bg-[var(--app-danger-soft)]' : success ? 'border-[color:var(--app-success)] bg-[var(--app-success-soft)]' : 'app-control'}`}>
      <span className={danger ? 'text-[var(--app-danger)]' : success ? 'text-[var(--app-success)]' : 'text-app-accent'}>{icon}</span>
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-app">{title}</h3>
        {body && <p className="mt-1 break-words text-sm leading-6 text-app-muted">{body}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

function AboutLinkButton({ label, hint, onClick }: { label: string; hint?: string; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} className="flex items-center justify-between gap-3 rounded-xl border app-control px-4 py-3 text-left transition hover:border-[var(--app-accent)]">
      <span>
        <span className="block text-sm font-medium text-app">{label}</span>
        {hint && <span className="mt-1 block text-xs text-app-muted">{hint}</span>}
      </span>
      <ExternalLink className="size-4 shrink-0 text-app-muted" />
    </button>
  );
}

function formatEta(seconds: number) {
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.ceil(seconds / 60);
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function downloadStatusLabel(status: string, t: ReturnType<typeof useI18n>['t']) {
  const labels: Record<string, string> = {
    preparing: t('about.preparingDownload'),
    downloading: t('about.downloadingUpdate'),
    verifying: t('about.verifyingDownload'),
    cancelling: t('about.cancellingDownload'),
    cancelled: t('about.downloadCancelled'),
    completed: t('about.downloadComplete'),
    error: t('about.downloadFailed'),
  };
  return labels[status] ?? t('about.applicationUpdate');
}
