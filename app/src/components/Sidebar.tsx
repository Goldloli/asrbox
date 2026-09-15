import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { BrainCircuit, DownloadCloud, LayoutGrid, ListChecks, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './weiui';
import asrboxIcon from '../assets/asrbox-icon-256.png';
import { useUiStore } from '../stores/uiStore';
import { useAppUpdateStore } from '../stores/appUpdateStore';

const nav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon: LucideIcon }> = [
  { to: '/', labelKey: 'nav.transcribe', icon: LayoutGrid },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/ai', labelKey: 'nav.ai', icon: BrainCircuit },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];
export function Sidebar() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { t } = useI18n();
  const sidebarMode = useUiStore((state) => state.sidebarMode);
  const autoCheckUpdates = useUiStore((state) => state.autoCheckUpdates);
  const updateNotifications = useUiStore((state) => state.updateNotifications);
  const version = useAppUpdateStore((state) => state.versionInfo.version);
  const hasUpdate = useAppUpdateStore((state) => Boolean(state.checkResult?.updateAvailable))
    && autoCheckUpdates
    && updateNotifications;
  const expanded = sidebarMode === 'expanded';
  const appVersion = `v${version}`;

  return (
    <aside
      data-testid="app-sidebar"
      data-mode={sidebarMode}
      className={cn(
        'app-shell-surface hidden h-dvh shrink-0 flex-col border-r app-border px-3 py-4 md:flex',
        expanded ? 'w-60 items-stretch' : 'w-16 items-center',
      )}
    >
      <Link
        to="/"
        aria-label={t('nav.home')}
        className={cn('flex items-center gap-3 rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30', expanded ? 'px-1 py-1' : 'justify-center')}
        onKeyDown={(event) => {
          if (event.key !== 'Enter' && event.key !== ' ') return;
          event.preventDefault();
          navigate({ to: '/' });
        }}
      >
        <img src={asrboxIcon} alt="" className="size-10 shrink-0 rounded-xl shadow-sm ring-1 ring-[var(--app-border)]" />
        {expanded && (
          <span className="min-w-0">
            <span className="block text-sm font-semibold text-app">ASRbox</span>
            <span className="block truncate text-xs text-app-muted">{t('app.subtitle')}</span>
          </span>
        )}
      </Link>
      <nav className={cn('mt-6 flex flex-1 flex-col gap-1', expanded ? 'items-stretch' : 'items-center')}>
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            item.to === '/'
              ? matchRoute({ to: '/', fuzzy: false })
              : matchRoute({ to: item.to, fuzzy: true });
          return (
            <Tooltip key={item.to}>
              <TooltipTrigger asChild>
                <Link
                  to={item.to}
                  aria-current={active ? 'page' : undefined}
                  className={cn(
                    'relative rounded-lg text-app-muted transition hover:bg-[var(--app-control)] hover:text-app focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30',
                    expanded ? 'flex h-10 items-center gap-3 px-3' : 'grid size-10 place-items-center',
                    active && 'bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] hover:bg-[var(--app-accent-soft)]',
                  )}
                >
                  {active && <span aria-hidden className="absolute -left-3 top-1/2 h-5 w-1 -translate-y-1/2 rounded-r-full bg-[var(--app-accent)]" />}
                  <Icon size={18} strokeWidth={1.8} />
                  {expanded && <span className="text-sm font-medium">{t(item.labelKey)}</span>}
                  {item.to === '/settings' && hasUpdate && (
                    <span className={cn('absolute size-2 rounded-full bg-[var(--app-accent)]', expanded ? 'right-3 top-2' : 'right-1.5 top-1.5')} aria-label={t('about.newVersion')} />
                  )}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t(item.labelKey)}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <div className={cn('grid gap-1', expanded ? 'px-1' : 'justify-items-center')}>
        <span className={cn('whitespace-nowrap rounded-md border app-control px-2 py-1 text-[10px] font-semibold text-app-muted', expanded ? 'text-left tracking-[0.04em]' : 'text-center')}>
          {expanded ? `${appVersion} · Local` : appVersion}
        </span>
        {expanded && <p className="whitespace-nowrap text-[11px] text-app-faint">{t('app.tagline')}</p>}
      </div>
    </aside>
  );
}
