import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { BrainCircuit, DownloadCloud, ListChecks, Mic2, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './weiui';
import asrboxIcon from '../assets/asrbox-icon-256.png';
import { useUiStore } from '../stores/uiStore';

const nav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon: LucideIcon }> = [
  { to: '/', labelKey: 'nav.transcribe', icon: Mic2 },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/ai', labelKey: 'nav.ai', icon: BrainCircuit },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];
const appVersion = 'v0.1.2-rc.1';

export function Sidebar() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { t } = useI18n();
  const sidebarMode = useUiStore((state) => state.sidebarMode);
  const expanded = sidebarMode === 'expanded';

  return (
    <aside className={cn(
      'app-shell-surface hidden h-dvh shrink-0 flex-col border-r app-border px-3 py-4 md:flex',
      expanded ? 'w-52 items-stretch' : 'w-20 items-center',
    )}>
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/"
            aria-label={t('nav.home')}
            className="grid size-12 place-items-center overflow-hidden rounded-[14px] shadow-lg shadow-[var(--app-shadow)] ring-1 ring-[var(--app-border)] transition hover:scale-[1.02] hover:ring-[var(--app-accent)] focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]"
            onKeyDown={(event) => {
              if (event.key !== 'Enter' && event.key !== ' ') return;
              event.preventDefault();
              navigate({ to: '/' });
            }}
          >
            <img src={asrboxIcon} alt="" className="size-full object-cover" />
          </Link>
        </TooltipTrigger>
        <TooltipContent>{t('nav.home')}</TooltipContent>
      </Tooltip>
      {expanded && <p className="mt-3 px-1 text-sm font-semibold text-app">ASRbox</p>}
      <nav className={cn('mt-8 flex flex-1 flex-col gap-2', expanded ? 'items-stretch' : 'items-center')}>
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
                  className={cn(
                    'rounded-xl border text-app-muted transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-control)] hover:text-app focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30',
                    expanded ? 'flex h-11 items-center gap-3 px-3' : 'grid size-11 place-items-center',
                    active
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] shadow-inner shadow-[var(--app-shadow)]'
                      : 'border-transparent',
                  )}
                >
                  <Icon size={20} strokeWidth={1.8} />
                  {expanded && <span className="text-sm font-medium">{t(item.labelKey)}</span>}
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t(item.labelKey)}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <Tooltip>
        <TooltipTrigger asChild>
          <div className={cn(
            'mb-1 rounded-lg border app-control px-2 py-1.5 text-[10px] font-semibold uppercase text-app-muted',
            expanded ? 'text-center tracking-[0.04em]' : 'w-11 text-center tracking-[0.16em]',
          )}>
            {expanded ? `${appVersion} · Local` : 'v0.1'}
          </div>
        </TooltipTrigger>
        <TooltipContent>{`ASRbox ${appVersion}`}</TooltipContent>
      </Tooltip>
    </aside>
  );
}
