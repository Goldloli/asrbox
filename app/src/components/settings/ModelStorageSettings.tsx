import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clipboard, FolderOpen, HardDrive, Move, RefreshCw, X } from 'lucide-react';
import { apiClient, type ModelRelocationRequest, type ModelStorageCandidate } from '../../lib/api';
import { desktopCapabilities } from '../../lib/desktopCapabilities';
import { formatBytes } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { queryKeys, useModelStorageQuery, useModelStorageRelocationQuery } from '../../lib/queries';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, Dialog, DialogContent, Field, Input, Panel, PanelHeader, Progress, Select, Switch } from '../weiui';

export function ModelStorageSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const storage = useModelStorageQuery();
  const relocation = useModelStorageRelocationQuery();
  const [open, setOpen] = useState(false);
  const [targetRoot, setTargetRoot] = useState('');
  const [mode, setMode] = useState<'move' | 'adopt'>('move');
  const [includeSharedCaches, setIncludeSharedCaches] = useState(false);
  const [acknowledgeNetwork, setAcknowledgeNetwork] = useState(false);
  const [plan, setPlan] = useState<ModelStorageCandidate | null>(null);

  const request: ModelRelocationRequest = {
    target_root: targetRoot,
    mode,
    include_shared_caches: includeSharedCaches,
    acknowledge_network: acknowledgeNetwork,
  };
  const planMutation = useMutation({
    mutationFn: () => apiClient.planModelStorage(request),
    onSuccess: setPlan,
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const startMutation = useMutation({
    mutationFn: () => apiClient.startModelStorageRelocation(request),
    onSuccess: () => {
      setOpen(false);
      setPlan(null);
      queryClient.invalidateQueries({ queryKey: queryKeys.modelStorageRelocation });
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
  const cancelMutation = useMutation({
    mutationFn: () => apiClient.cancelModelStorageRelocation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.modelStorageRelocation }),
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  useEffect(() => {
    if (relocation.data?.status === 'complete') {
      queryClient.invalidateQueries({ queryKey: queryKeys.modelStorage });
      queryClient.invalidateQueries({ queryKey: queryKeys.models });
      queryClient.invalidateQueries({ queryKey: queryKeys.runtime });
    }
  }, [queryClient, relocation.data?.status]);

  const chooseLocation = async () => {
    try {
      let path: string | null = null;
      if (desktopCapabilities.canPickModelStorageDirectory) {
        path = await desktopCapabilities.pickModelStorageDirectory();
      } else {
        path = storage.data?.allowed_roots.find((item) => item !== storage.data?.root) ?? storage.data?.allowed_roots[0] ?? null;
      }
      if (!path) return;
      setTargetRoot(path);
      setPlan(null);
      setOpen(true);
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const openOrCopy = async () => {
    const root = storage.data?.root;
    if (!root) return;
    try {
      if (desktopCapabilities.canOpenFileLocation) await desktopCapabilities.openFileLocation(root);
      else {
        await navigator.clipboard.writeText(root);
        toast.success(t('settings.modelStoragePathCopied'));
      }
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  const statusTone: 'success' | 'danger' | 'warning' = storage.data?.status === 'available' ? 'success' : storage.data?.status === 'unavailable' ? 'danger' : 'warning';
  const job = relocation.data;
  const jobActive = job?.status === 'running' || job?.status === 'cancelling';

  return (
    <Panel className="overflow-hidden xl:col-span-2">
      <PanelHeader
        eyebrow={t('settings.storage')}
        title={t('settings.modelStorageTitle')}
        description={storage.data?.root ?? t('settings.backendUnavailable')}
        action={
          <Button size="sm" variant="secondary" onClick={() => storage.refetch()}>
            <RefreshCw className="size-4" />
            {t('common.refresh')}
          </Button>
        }
      />
      <div className="grid gap-4 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <HardDrive className="size-4 text-app-muted" />
              <Badge tone={statusTone}>{storage.data?.status === 'unavailable' ? t('settings.modelStorageUnavailable') : modelStorageStatusLabel(storage.data?.status, t)}</Badge>
            </div>
            <p className="mt-2 break-all text-sm text-app">{storage.data?.root ?? '-'}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={openOrCopy} disabled={!storage.data?.available}>
              {desktopCapabilities.canOpenFileLocation ? <FolderOpen className="size-4" /> : <Clipboard className="size-4" />}
              {desktopCapabilities.canOpenFileLocation ? t('settings.openModelStorage') : t('settings.copyModelStoragePath')}
            </Button>
            <Button size="sm" onClick={chooseLocation} disabled={storage.data?.root_locked || jobActive || (!desktopCapabilities.canPickModelStorageDirectory && (storage.data?.allowed_roots.length ?? 0) < 2)}>
              <Move className="size-4" />
              {t('settings.changeModelStorage')}
            </Button>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Metric label={t('settings.modelFilesUsed')} value={formatBytes((storage.data?.used_bytes ?? 0) - (storage.data?.cache_bytes ?? 0))} />
          <Metric label={t('settings.modelCacheUsed')} value={formatBytes(storage.data?.cache_bytes)} />
          <Metric label={t('settings.storageUsed')} value={formatBytes(storage.data?.used_bytes)} />
          <Metric label={t('settings.freeDisk')} value={formatBytes(storage.data?.free_bytes)} />
        </div>

        {storage.data?.cache_usage?.length ? (
          <div className="grid gap-2 border-t app-border pt-3 md:grid-cols-2">
            {storage.data.cache_usage.map((cache) => (
              <div key={cache.name} className="flex min-w-0 items-center justify-between gap-3 text-xs">
                <span className="truncate text-app-muted" title={cache.path}>{cache.name}</span>
                <span className="shrink-0 text-app">{formatBytes(cache.size_bytes)}</span>
              </div>
            ))}
          </div>
        ) : null}

        {job && job.status !== 'idle' ? (
          <div className="grid gap-2 border-t app-border pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-sm font-medium text-app">{t('settings.modelStorageMigration')} · {job.phase}</span>
              <Badge tone={job.status === 'complete' ? 'success' : job.status === 'failed' ? 'danger' : 'warning'}>{job.status}</Badge>
            </div>
            <Progress value={job.progress} />
            <div className="flex flex-wrap justify-between gap-2 text-xs text-app-muted">
              <span className="break-all">{job.current_item}</span>
              <span>{formatBytes(job.copied_bytes)} / {formatBytes(job.total_bytes)}</span>
            </div>
            {job.error ? <p className="text-sm text-[var(--app-danger)]">{job.error}</p> : null}
            {job.cleanup_required ? <p className="text-sm text-[var(--app-accent-text)]">{t('settings.modelStorageCleanupRequired')}: {job.cleanup_paths.join(', ')}</p> : null}
            {jobActive ? (
              <Button size="sm" variant="secondary" onClick={() => cancelMutation.mutate()} disabled={cancelMutation.isPending}>
                <X className="size-4" />
                {t('settings.cancelModelStorageMigration')}
              </Button>
            ) : null}
          </div>
        ) : null}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent title={t('settings.changeModelStorage')}>
          <div className="grid gap-4">
            {storage.data?.runtime === 'container' ? (
              <Field label={t('settings.allowedMountPoint')}>
                <Select value={targetRoot} onValueChange={(value) => { setTargetRoot(value); setPlan(null); }} options={storage.data.allowed_roots.map((root) => ({ value: root, label: root, disabled: root === storage.data?.root }))} />
              </Field>
            ) : <Input value={targetRoot} readOnly />}
            <Field label={t('settings.modelStorageMode')}>
              <Select
                value={mode}
                onValueChange={(value) => { setMode(value as 'move' | 'adopt'); setPlan(null); }}
                options={[
                  { value: 'move', label: t('settings.moveExistingModels') },
                  { value: 'adopt', label: t('settings.useTargetModels') },
                ]}
              />
            </Field>
            <Toggle label={t('settings.includeSharedCaches')} checked={includeSharedCaches} onChange={(checked) => { setIncludeSharedCaches(checked); setPlan(null); }} />
            {plan?.network_filesystem ? <Toggle label={t('settings.acknowledgeNetworkStorage')} checked={acknowledgeNetwork} onChange={(checked) => { setAcknowledgeNetwork(checked); setPlan(null); }} /> : null}
            <Button variant="secondary" onClick={() => planMutation.mutate()} disabled={!targetRoot || planMutation.isPending}>{t('settings.inspectModelStorageTarget')}</Button>
            {plan ? <PlanSummary plan={plan} /> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
              <Button onClick={() => startMutation.mutate()} disabled={!plan?.valid || startMutation.isPending}>{t('settings.startModelStorageMigration')}</Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </Panel>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="min-w-0"><p className="text-xs text-app-muted">{label}</p><p className="mt-1 truncate text-sm font-medium text-app">{value}</p></div>;
}

function modelStorageStatusLabel(status: string | undefined, t: ReturnType<typeof useI18n>['t']) {
  if (status === 'available') return t('settings.modelStorageStatus.available');
  if (status === 'read_only') return t('settings.modelStorageStatus.read_only');
  if (status === 'migrating') return t('settings.modelStorageStatus.migrating');
  return t('settings.modelStorageStatus.unavailable');
}

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return <div className="flex items-center justify-between gap-3 text-sm text-app"><span>{label}</span><Switch checked={checked} onCheckedChange={onChange} /></div>;
}

function PlanSummary({ plan }: { plan: ModelStorageCandidate }) {
  const { t } = useI18n();
  return (
    <div className="grid gap-2 border-y app-border py-3 text-sm">
      <div className="flex justify-between gap-3"><span className="text-app-muted">{t('settings.requiredSpace')}</span><span>{formatBytes(plan.required_bytes + plan.required_headroom_bytes)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-app-muted">{t('settings.freeDisk')}</span><span>{formatBytes(plan.free_bytes)}</span></div>
      <div className="flex justify-between gap-3"><span className="text-app-muted">{t('settings.validTargetModels')}</span><span>{plan.valid_models.length}</span></div>
      {plan.errors.map((error) => <p key={error} className="break-all text-[var(--app-danger)]">{error}</p>)}
      {plan.conflicts.map((conflict) => <p key={conflict} className="break-all text-[var(--app-danger)]">{t('settings.targetConflict')}: {conflict}</p>)}
      {plan.warnings.map((warning) => <p key={warning} className="break-all text-[var(--app-accent-text)]">{warning}</p>)}
      {plan.caches.filter((cache) => cache.shared).map((cache) => <p key={cache.path} className="break-all text-app-muted">{cache.name}: {formatBytes(cache.size_bytes)} · {cache.path}</p>)}
    </div>
  );
}
