import { CloudOff, Cpu, PlugZap } from 'lucide-react';
import { type ReactNode } from 'react';
import { Link, useRouterState } from '@tanstack/react-router';
import { Sidebar } from './Sidebar';
import { MobileNav } from './MobileNav';
import { GlobalSearch } from './GlobalSearch';
import { PersistentAudioPlayer } from './PersistentAudioPlayer';
import { Badge, Button } from './weiui';
import { useHealthQuery, useRuntimeQuery } from '../lib/queries';
import { formatBytes } from '../lib/format';
import { useI18n } from '../lib/i18n';
import { useDesktopServerControl } from '../lib/useDesktopServerControl';

export function AppShell({ children }: { children: ReactNode }) {
  const { t } = useI18n();
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const immersiveTaskCenter = pathname === '/tasks';
  const boundedWorkspace = immersiveTaskCenter || pathname === '/ai';

  return (
    <div className="app-bg flex h-dvh min-w-[320px] overflow-hidden">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[60] focus:rounded-lg focus:border focus:border-[color:var(--app-accent)] focus:bg-[var(--app-panel-solid)] focus:px-3 focus:py-2 focus:text-sm focus:font-medium focus:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30"
      >
        {t('app.skipToContent')}
      </a>
      <Sidebar immersive={immersiveTaskCenter} />
      <div className="flex min-w-0 flex-1 flex-col">
        {!immersiveTaskCenter && <TopStatusBar />}
        <main id="main-content" tabIndex={-1} className={`min-h-0 flex-1 focus:outline-none ${boundedWorkspace ? 'overflow-hidden' : 'overflow-auto'}`}>
          <div className={immersiveTaskCenter ? 'h-full min-h-0 w-full' : 'h-full min-h-0 w-full py-3 pr-3 md:py-4'}>{children}</div>
        </main>
        <PersistentAudioPlayer />
        <MobileNav />
      </div>
    </div>
  );
}

function TopStatusBar() {
  const healthQuery = useHealthQuery();
  const runtimeQuery = useRuntimeQuery();
  const desktopServer = useDesktopServerControl();
  const { locale, t } = useI18n();
  const connected = healthQuery.isSuccess;
  const runtime = runtimeQuery.data;

  return (
    <header className="app-shell-surface flex h-20 shrink-0 items-center gap-4 border-b app-border px-6">
      <div className="flex w-full min-w-0 items-center gap-8">
        <div className="min-w-0 flex-1">
          <GlobalSearch />
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {connected && (
            <span className="hidden items-center gap-1.5 text-xs font-medium text-app-soft md:flex">
              <span className="size-1.5 rounded-full bg-[var(--app-success)]" />
              {t('status.localProcessing')}
            </span>
          )}
          <div className="hidden items-center gap-2 lg:flex">
            {!connected && (
              <>
                <Link to="/settings" search={{ tab: 'storage' }} aria-label={t('status.openDiagnostics')} className="transition hover:opacity-80">
                  <Badge tone="danger">
                    <CloudOff className="mr-1 size-3" />
                    {t('status.backendOffline')}
                  </Badge>
                </Link>
                {desktopServer.isDesktop && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => desktopServer.startServer()}
                    disabled={desktopServer.isStarting}
                    title={t('status.startBackend')}
                  >
                    <PlugZap className="size-3.5" />
                    {desktopServer.isStarting ? t('status.startingBackend') : t('status.startBackend')}
                  </Button>
                )}
              </>
            )}
            {runtime && (
              <>
                <Link to="/settings" search={{ tab: 'storage' }} aria-label={t('status.openDiagnostics')} className="transition hover:opacity-80">
                  <Badge tone={runtime.ffmpeg_available && runtime.ffprobe_available ? 'success' : 'warning'}>
                    {runtime.ffmpeg_available && runtime.ffprobe_available ? t('status.ffmpegReady') : t('status.ffmpegMissing')}
                  </Badge>
                </Link>
                <Badge tone={runtime.torch_cuda_available || runtime.torch_mps_available ? 'accent' : 'neutral'}>
                  <Cpu className="mr-1 size-3" />
                  {runtime.torch_cuda_available ? 'CUDA' : runtime.torch_mps_available ? 'MPS' : 'CPU'}
                </Badge>
                {runtime.free_disk_bytes != null && <Badge tone="neutral">{t('status.freeDisk')} {formatBytes(runtime.free_disk_bytes)}</Badge>}
              </>
            )}
          </div>
          <span className="hidden border-l app-border pl-4 text-xs text-app-muted xl:inline">
            {new Intl.DateTimeFormat(locale === 'zh' ? 'zh-CN' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short' }).format(new Date())}
          </span>
        </div>
      </div>
    </header>
  );
}
