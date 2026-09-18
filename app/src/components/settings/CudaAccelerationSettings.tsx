import { useCallback, useEffect, useRef, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Download, RefreshCw, Trash2, X, Zap } from 'lucide-react';
import { apiClient, type CudaAccelerationStatus } from '../../lib/api';
import { desktopCapabilities } from '../../lib/desktopCapabilities';
import { formatBytes } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import {
  queryKeys,
  useCudaAccelerationQuery,
  useCudaAccelerationRedetectMutation,
  useCudaAccelerationToggleMutation,
  useCudaKitDeleteMutation,
  useCudaKitDownloadCancelMutation,
  useCudaKitDownloadMutation,
  useRuntimeQuery,
} from '../../lib/queries';
import { useServerStore } from '../../stores/serverStore';
import { toastErrorMessage, useToast } from '../Toast';
import { ConfirmAction } from '../ConfirmAction';
import { Badge, Button, ErrorState, Panel, PanelHeader, Progress, Switch } from '../weiui';
import { PathRow } from './SettingsHealth';
import { localizedErrorPresentation } from '../../lib/errorMessages';
import { LocalizedTechnicalMessage } from '../LocalizedTechnicalMessage';

export function CudaAccelerationSettings() {
  const { locale, t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useCudaAccelerationQuery();
  const runtimeQuery = useRuntimeQuery();
  const toggleMutation = useCudaAccelerationToggleMutation();
  const redetectMutation = useCudaAccelerationRedetectMutation();
  const downloadMutation = useCudaKitDownloadMutation();
  const cancelMutation = useCudaKitDownloadCancelMutation();
  const deleteMutation = useCudaKitDeleteMutation();
  const [restarting, setRestarting] = useState(false);
  const restartingRef = useRef(false);
  const autoRestartedRef = useRef(false);

  const data = query.data;
  const isDesktop = desktopCapabilities.runtime === 'tauri';
  const gpuUnavailable = isDesktop && data?.supported === true && data?.gpu_detected === false;
  const supported = isDesktop && data?.supported === true && data?.gpu_detected !== false;
  const enabled = data?.enabled === true;
  const job = data?.job ?? null;
  const jobRunning = job?.status === 'running';
  const busy = toggleMutation.isPending || restarting;
  const detecting = data?.supported === true && data.gpu_detected == null;

  const statusMeta: Record<CudaAccelerationStatus, { tone: 'neutral' | 'success' | 'warning' | 'danger' | 'accent'; label: string }> = {
    not_downloaded: { tone: 'neutral', label: t('settings.cudaStatus.not_downloaded') },
    downloading: { tone: 'warning', label: t('settings.cudaStatus.downloading') },
    ready: { tone: 'accent', label: t('settings.cudaStatus.ready') },
    enabled: { tone: 'success', label: t('settings.cudaStatus.enabled') },
    enable_failed: { tone: 'danger', label: t('settings.cudaStatus.enable_failed') },
    invalidated: { tone: 'warning', label: t('settings.cudaStatus.invalidated') },
  };

  const runRestart = useCallback(async () => {
    if (restartingRef.current) return;
    restartingRef.current = true;
    setRestarting(true);
    try {
      const connection = await desktopCapabilities.restartServer();
      if (!connection) throw new Error(t('status.backendDesktopUnavailable'));
      useServerStore.getState().setServerConnection(connection.url, connection.apiToken);
      const health = await apiClient.getHealth();
      if (health.status !== 'healthy') throw new Error(t('status.backendDesktopUnavailable'));
      queryClient.invalidateQueries({ queryKey: queryKeys.cudaAcceleration });
      queryClient.invalidateQueries({ queryKey: queryKeys.health });
      queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
      toast.success(t('toast.backendStarted'));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    } finally {
      restartingRef.current = false;
      setRestarting(false);
    }
  }, [queryClient, t, toast]);

  const readyToEnable = enabled && data?.status === 'ready';
  useEffect(() => {
    if (!readyToEnable) {
      autoRestartedRef.current = false;
      return;
    }
    if (!isDesktop || autoRestartedRef.current) return;
    autoRestartedRef.current = true;
    void runRestart();
  }, [isDesktop, readyToEnable, runRestart]);

  const handleToggle = (next: boolean) => {
    const previousStatus = data?.status;
    toggleMutation.mutate(next, {
      onSuccess: () => {
        if (next) {
          if (previousStatus === 'ready' || previousStatus === 'enable_failed') void runRestart();
        } else if (previousStatus === 'enabled' || previousStatus === 'enable_failed') {
          void runRestart();
        }
      },
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  };

  const redetect = useCallback(() => {
    redetectMutation.mutate(undefined, {
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  }, [redetectMutation, t, toast]);

  const startDownload = useCallback(() => {
    downloadMutation.mutate(undefined, {
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  }, [downloadMutation, t, toast]);

  const redownload = () => {
    deleteMutation.mutate(undefined, {
      onSuccess: () => startDownload(),
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  };

  const removeKit = () => {
    deleteMutation.mutate(undefined, {
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  };

  const cancelDownload = () => {
    cancelMutation.mutate(undefined, {
      onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
    });
  };

  const description = query.error
    ? t('settings.backendUnavailable')
    : gpuUnavailable
      ? t('settings.cudaNoGpu')
      : supported
        ? t('settings.cudaDescription')
        : t('settings.cudaUnsupported');
  const downloadPercent = job && job.total_bytes > 0 ? (job.downloaded_bytes / job.total_bytes) * 100 : null;
  const partMatch = job?.current_part ? /part(\d+)$/i.exec(job.current_part) : null;
  const currentPartOrdinal = partMatch ? Number(partMatch[1]) : null;
  const showDownloadButton = !jobRunning && data?.status === 'not_downloaded' && (job == null || job.status === 'cancelled');

  const dataDir = runtimeQuery.data?.data_dir ?? null;
  const separator = dataDir && dataDir.includes('\\') ? '\\' : '/';
  const kitPath = dataDir ? [dataDir.replace(/[\\/]+$/, ''), 'runtime', 'cuda-kit', 'kit'].join(separator) : null;
  const probeState = data?.probe.state ?? 'pending';
  const gpuDetectedLabel = data?.gpu_detected == null
    ? t('settings.cudaDetecting')
    : data.gpu_detected
      ? t('settings.cudaDetected')
      : t('settings.cudaNotDetected');
  const reasonLabel = data?.reason_code ? t(`settings.cudaReason.${data.reason_code}`) : null;
  const showRawReason = Boolean(data?.reason) && data?.reason !== reasonLabel;

  return (
    <section className="grid content-start gap-4">
      <Panel className="overflow-hidden">
        <PanelHeader
          eyebrow={t('settings.system')}
          title={t('settings.cudaTitle')}
          description={description}
          action={
            <Button size="sm" variant="secondary" disabled={redetectMutation.isPending || detecting} onClick={redetect}>
              <RefreshCw className={`size-4 ${detecting ? 'animate-spin' : ''}`} />
              {detecting ? t('settings.cudaDetecting') : t('settings.cudaRedetect')}
            </Button>
          }
        />
        <div className="grid gap-4 p-5">
          {query.error ? <ErrorState title={t('settings.unavailable')} error={query.error} /> : null}

          <div className="flex flex-wrap items-center gap-2">
            <Zap className="size-4 text-app-muted" />
            {data ? <Badge tone={statusMeta[data.status].tone}>{statusMeta[data.status].label}</Badge> : <Badge>-</Badge>}
            {data?.kit ? (
              <span className="truncate text-xs text-app-muted">
                {t('settings.cudaKitVersion')} {data.kit.kit_version} · torch {data.kit.torch_version} · {formatBytes(data.kit.total_bytes)}
              </span>
            ) : null}
            {data?.probe.state === 'ok' && data.probe.cuda_device_name ? (
              <span className="truncate text-xs text-app-muted">{data.probe.cuda_device_name}</span>
            ) : null}
          </div>

          <div className="grid gap-2">
            <div className="flex items-center justify-between gap-4 rounded-xl border app-control px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm text-app">{t('settings.cudaEnable')}</p>
                <p className="mt-1 text-xs text-app-muted">{restarting ? t('settings.cudaRestarting') : t('settings.cudaEnableHint')}</p>
              </div>
              <Switch checked={enabled} disabled={!supported || busy} onCheckedChange={handleToggle} />
            </div>
            {enabled && (data?.status === 'not_downloaded' || data?.status === 'downloading') ? (
              <p className="text-xs text-[var(--app-accent-text)]">{t('settings.cudaNeedsKit')}</p>
            ) : null}
            {enabled && data?.status === 'ready' && !restarting ? (
              <p className="text-xs text-app-muted">{t('settings.cudaReadyHint')}</p>
            ) : null}
          </div>

          {jobRunning && job ? (
            <div className="grid gap-2 rounded-xl border app-control p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <span className="text-sm font-medium text-app">{t('settings.cudaStatus.downloading')}</span>
                <span className="text-xs text-app-muted">
                  {formatBytes(job.downloaded_bytes)} / {formatBytes(job.total_bytes)}
                  {job.parts_total > 1 && currentPartOrdinal != null ? ` · ${t('settings.cudaDownloadPart', { current: currentPartOrdinal, total: job.parts_total })}` : ''}
                </span>
              </div>
              <Progress value={downloadPercent} />
              <div>
                <Button size="sm" variant="secondary" onClick={cancelDownload} disabled={cancelMutation.isPending || !supported}>
                  <X className="size-4" />
                  {t('common.cancel')}
                </Button>
              </div>
            </div>
          ) : null}

          {!jobRunning && job?.status === 'failed' ? (
            <div className="grid gap-2 rounded-xl border app-control p-4">
              {job.error ? (
                <LocalizedTechnicalMessage message={localizedErrorPresentation(new Error(job.error), locale)} className="text-sm text-[var(--app-danger)]" />
              ) : (
                <p className="text-sm text-[var(--app-danger)]">{t('toast.actionFailed')}</p>
              )}
              <div>
                <Button size="sm" onClick={startDownload} disabled={!supported || downloadMutation.isPending}>
                  <Download className="size-4" />
                  {t('common.retry')}
                </Button>
              </div>
            </div>
          ) : null}

          {!jobRunning && data?.status === 'invalidated' ? (
            <div className="grid gap-2 rounded-xl border app-control p-4">
              <p className="break-words text-sm text-app-muted">{reasonLabel ?? data.reason ?? t('settings.cudaInvalidated')}</p>
              <div>
                <Button size="sm" onClick={redownload} disabled={!supported || deleteMutation.isPending || downloadMutation.isPending}>
                  <Download className="size-4" />
                  {t('settings.cudaRedownload')}
                </Button>
              </div>
            </div>
          ) : null}

          {showDownloadButton ? (
            <div>
              <Button size="sm" onClick={startDownload} disabled={!supported || downloadMutation.isPending}>
                <Download className="size-4" />
                {t('settings.cudaDownload')}
              </Button>
            </div>
          ) : null}

          {data?.status === 'enable_failed' ? (
            <div className="grid gap-1">
              <p className="break-words text-sm text-[var(--app-danger)]">{reasonLabel ?? data.reason ?? t('toast.actionFailed')}</p>
              {showRawReason ? <p className="break-all text-xs text-app-muted">{data.reason}</p> : null}
            </div>
          ) : null}
        </div>
      </Panel>

      <Panel className="overflow-hidden">
        <PanelHeader eyebrow={t('settings.system')} title={t('settings.cudaDetailsTitle')} />
        <div className="grid gap-3 p-5">
          <PathRow label={t('settings.cudaGpuDetection')} value={gpuDetectedLabel} />
          <PathRow label={t('settings.cudaDevice')} value={probeState === 'ok' ? data?.probe.cuda_device_name : null} />
          <PathRow
            label="CUDA"
            value={probeState === 'ok' ? (data?.probe.torch_cuda_available ? t('settings.cudaAvailable') : t('settings.cudaUnavailable')) : t('settings.cudaProbePending')}
          />
          {data?.kit ? (
            <>
              <PathRow label={t('settings.cudaKitVersion')} value={`${data.kit.kit_version} · torch ${data.kit.torch_version}`} />
              <PathRow label={t('settings.cudaKitSize')} value={formatBytes(data.kit.total_bytes)} />
              <PathRow label={t('settings.cudaKitPath')} value={kitPath} />
              <div>
                <ConfirmAction
                  title={t('confirm.cudaDeleteTitle')}
                  description={t('confirm.cudaDeleteDescription')}
                  confirmLabel={t('settings.cudaDeleteKit')}
                  tone="secondary"
                  onConfirm={removeKit}
                >
                  <Button size="sm" variant="secondary" disabled={jobRunning || deleteMutation.isPending || !supported}>
                    <Trash2 className="size-4" />
                    {t('settings.cudaDeleteKit')}
                  </Button>
                </ConfirmAction>
              </div>
            </>
          ) : (
            <p className="text-sm text-app-muted">{t('settings.cudaKitNotInstalled')}</p>
          )}
          <div className="grid gap-1.5 border-t app-border pt-3">
            <p className="text-xs leading-5 text-app-muted">{t('settings.cudaAboutBody')}</p>
            <p className="text-xs leading-5 text-app-muted">{t('settings.cudaAboutDisk')}</p>
          </div>
        </div>
      </Panel>
    </section>
  );
}
