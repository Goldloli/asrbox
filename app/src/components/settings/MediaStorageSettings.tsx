import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Clipboard, FolderOpen, RefreshCw, Save } from 'lucide-react';
import { apiClient, type MediaStorageLocation, type MediaStorageSettingsUpdate } from '../../lib/api';
import { desktopCapabilities } from '../../lib/desktopCapabilities';
import { useI18n } from '../../lib/i18n';
import { queryKeys, useMediaStorageSettingsQuery } from '../../lib/queries';
import { toastErrorMessage, useToast } from '../Toast';
import { Badge, Button, Field, Panel, PanelHeader, Select } from '../weiui';
import { ToggleRow } from './SettingsHealth';

type DirectoryTarget = 'uploads' | 'derived';

export function MediaStorageSettings() {
  const { t } = useI18n();
  const toast = useToast();
  const queryClient = useQueryClient();
  const settingsQuery = useMediaStorageSettingsQuery();
  const [ingestMode, setIngestMode] = useState<'reference' | 'copy'>('reference');
  const [deleteDerived, setDeleteDerived] = useState(false);
  const [pendingDirs, setPendingDirs] = useState<{ uploads_dir?: string; derived_audio_dir?: string }>({});

  useEffect(() => {
    if (!settingsQuery.data) return;
    setIngestMode(settingsQuery.data.ingest_mode);
    setDeleteDerived(settingsQuery.data.delete_derived_on_complete);
    setPendingDirs({});
  }, [settingsQuery.data]);

  const data = settingsQuery.data;
  const isContainer = data?.runtime === 'container';
  const uploadsValue = pendingDirs.uploads_dir ?? data?.uploads_dir ?? '';
  const derivedValue = pendingDirs.derived_audio_dir ?? data?.derived_audio_dir ?? '';
  const isDirty = Boolean(
    data &&
      (data.ingest_mode !== ingestMode ||
        data.delete_derived_on_complete !== deleteDerived ||
        uploadsValue !== data.uploads_dir ||
        derivedValue !== data.derived_audio_dir),
  );

  const save = useMutation({
    mutationFn: () => {
      const payload: MediaStorageSettingsUpdate = {};
      if (!data || data.ingest_mode !== ingestMode) payload.ingest_mode = ingestMode;
      if (!data || data.delete_derived_on_complete !== deleteDerived) payload.delete_derived_on_complete = deleteDerived;
      if (uploadsValue && uploadsValue !== data?.uploads_dir) payload.uploads_dir = uploadsValue;
      if (derivedValue && derivedValue !== data?.derived_audio_dir) payload.derived_audio_dir = derivedValue;
      return apiClient.updateMediaStorageSettings(payload);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.mediaStorageSettings });
      toast.success(t('toast.settingsSaved'));
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });

  const pickDirectory = async (target: DirectoryTarget) => {
    try {
      const path = await desktopCapabilities.pickModelStorageDirectory();
      if (!path) return;
      setPendingDirs((current) => (target === 'uploads' ? { ...current, uploads_dir: path } : { ...current, derived_audio_dir: path }));
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  return (
    <Panel className="overflow-hidden">
      <PanelHeader
        eyebrow={t('settings.storage')}
        title={t('settings.mediaStorageTitle')}
        description={t('settings.mediaStorageDescription')}
        action={
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" onClick={() => settingsQuery.refetch()}>
              <RefreshCw className="size-4" />
              {t('common.refresh')}
            </Button>
            <Button size="sm" onClick={() => save.mutate()} disabled={!isDirty || save.isPending}>
              <Save className="size-4" />
              {t('common.save')}
            </Button>
          </div>
        }
      />
      <div className="grid gap-4 p-5">
        {!isContainer && data ? (
          <div className="max-w-md">
            <Field label={t('settings.ingestMode')} hint={t('settings.ingestModeHint')}>
              <Select
                value={ingestMode}
                onValueChange={(value) => setIngestMode(value as 'reference' | 'copy')}
                options={[
                  { value: 'reference', label: t('settings.ingestModeReference') },
                  { value: 'copy', label: t('settings.ingestModeCopy') },
                ]}
              />
            </Field>
          </div>
        ) : null}

        <div className="grid gap-3 md:grid-cols-2">
          <DirectoryRow
            label={t('settings.uploadsPath')}
            location={data?.uploads}
            value={uploadsValue}
            pending={pendingDirs.uploads_dir != null && pendingDirs.uploads_dir !== data?.uploads_dir}
            locked={data?.uploads_dir_locked}
            readOnly={isContainer}
            onPick={() => pickDirectory('uploads')}
          />
          <DirectoryRow
            label={t('settings.derivedAudioPath')}
            location={data?.derived_audio}
            value={derivedValue}
            pending={pendingDirs.derived_audio_dir != null && pendingDirs.derived_audio_dir !== data?.derived_audio_dir}
            locked={data?.derived_audio_dir_locked}
            readOnly={isContainer}
            onPick={() => pickDirectory('derived')}
          />
        </div>
        <p className="text-xs text-app-muted">{t('settings.mediaStoragePathHint')}</p>

        <div className="grid gap-2">
          <ToggleRow label={t('settings.deleteDerivedOnComplete')} checked={deleteDerived} onCheckedChange={setDeleteDerived} />
          <p className="text-xs text-app-muted">{t('settings.deleteDerivedOnCompleteHint')}</p>
        </div>
      </div>
    </Panel>
  );
}

function DirectoryRow({
  label,
  location,
  value,
  pending,
  locked,
  readOnly,
  onPick,
}: {
  label: string;
  location?: MediaStorageLocation;
  value: string;
  pending: boolean;
  locked?: boolean;
  readOnly: boolean;
  onPick: () => void;
}) {
  const { t } = useI18n();
  const toast = useToast();
  const statusTone: 'success' | 'danger' | 'warning' =
    location?.status === 'available' ? 'success' : location?.status === 'unavailable' ? 'danger' : 'warning';
  const statusLabel =
    location?.status === 'available'
      ? t('settings.modelStorageStatus.available')
      : location?.status === 'read_only'
        ? t('settings.modelStorageStatus.read_only')
        : t('settings.modelStorageStatus.unavailable');

  const openOrCopy = async () => {
    const path = location?.path;
    if (!path) return;
    try {
      if (desktopCapabilities.canOpenFileLocation) await desktopCapabilities.openFileLocation(path);
      else {
        await navigator.clipboard.writeText(path);
        toast.success(t('settings.modelStoragePathCopied'));
      }
    } catch (error) {
      toast.error(t('toast.actionFailed'), toastErrorMessage(error));
    }
  };

  return (
    <div className="grid gap-2 rounded-lg border app-control p-4">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm font-medium text-app">{label}</span>
        {location ? <Badge tone={statusTone}>{statusLabel}</Badge> : null}
      </div>
      <p className="break-all text-sm text-app">{value || '-'}</p>
      {pending ? <p className="text-xs text-app-accent">{t('settings.mediaStoragePendingSave')}</p> : null}
      {location?.reason ? <p className="text-xs text-app-muted">{location.reason}</p> : null}
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="secondary" onClick={openOrCopy} disabled={!location?.path}>
          {desktopCapabilities.canOpenFileLocation ? <FolderOpen className="size-4" /> : <Clipboard className="size-4" />}
          {desktopCapabilities.canOpenFileLocation ? t('settings.openModelStorage') : t('settings.copyModelStoragePath')}
        </Button>
        {!readOnly ? (
          <Button size="sm" variant="secondary" onClick={onPick} disabled={locked || !desktopCapabilities.canPickModelStorageDirectory}>
            <FolderOpen className="size-4" />
            {t('settings.changeModelStorage')}
          </Button>
        ) : null}
      </div>
      {locked && !readOnly ? <p className="text-xs text-app-muted">{t('settings.mediaStorageLocked')}</p> : null}
    </div>
  );
}
