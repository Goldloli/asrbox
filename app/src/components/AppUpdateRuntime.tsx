import { useEffect, useRef } from 'react';
import { desktopCapabilities } from '../lib/desktopCapabilities';
import { useI18n } from '../lib/i18n';
import { checkForAppUpdate, loadAppVersion, useAppUpdateStore } from '../stores/appUpdateStore';
import { useUiStore } from '../stores/uiStore';
import { useToast } from './Toast';

const CHECK_INTERVAL_MS = 24 * 60 * 60 * 1000;
const STARTUP_DELAY_MS = 10_000;

export function AppUpdateRuntime() {
  const { t } = useI18n();
  const toast = useToast();
  const updateChannel = useUiStore((state) => state.updateChannel);
  const autoCheckUpdates = useUiStore((state) => state.autoCheckUpdates);
  const updateNotifications = useUiStore((state) => state.updateNotifications);
  const lastAutomaticCheckAt = useAppUpdateStore((state) => state.lastAutomaticCheckAt);
  const setLastAutomaticCheckAt = useAppUpdateStore((state) => state.setLastAutomaticCheckAt);
  const setDownload = useAppUpdateStore((state) => state.setDownload);
  const notifiedVersion = useRef<string | null>(null);

  useEffect(() => {
    void loadAppVersion();
    if (!desktopCapabilities.canManageAppUpdates) return;
    void desktopCapabilities.getAppUpdateDownloadState().then(setDownload).catch(() => undefined);
    return desktopCapabilities.listenAppUpdateDownload(setDownload);
  }, [setDownload]);

  useEffect(() => {
    if (!desktopCapabilities.canManageAppUpdates || !autoCheckUpdates) return;
    if (lastAutomaticCheckAt && Date.now() - lastAutomaticCheckAt < CHECK_INTERVAL_MS) return;
    const timer = window.setTimeout(() => {
      void checkForAppUpdate(updateChannel)
        .then((result) => {
          setLastAutomaticCheckAt(Date.now());
          if (!result.updateAvailable || !result.release || !updateNotifications) return;
          if (notifiedVersion.current === result.release.version) return;
          notifiedVersion.current = result.release.version;
          toast.info(t('updates.availableTitle'), t('updates.availableDescription', { version: result.release.version }));
        })
        .catch(() => {
          setLastAutomaticCheckAt(Date.now());
        });
    }, STARTUP_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [
    autoCheckUpdates,
    lastAutomaticCheckAt,
    setLastAutomaticCheckAt,
    t,
    toast,
    updateChannel,
    updateNotifications,
  ]);

  return null;
}
