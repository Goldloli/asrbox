import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { DownloadCloud, ListChecks, Mic2, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './weiui';
import asrboxIcon from '../assets/asrbox-icon.png';

const nav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon: LucideIcon }> = [
  { to: '/', labelKey: 'nav.transcribe', icon: Mic2 },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <aside className="app-shell-surface hidden h-dvh w-20 shrink-0 flex-col items-center border-r app-border px-3 py-4 md:flex">
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
      <nav className="mt-8 flex flex-1 flex-col items-center gap-2">
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
                    'grid size-11 place-items-center rounded-xl border text-app-muted transition hover:border-[var(--app-border-strong)] hover:bg-[var(--app-control)] hover:text-app',
                    active
                      ? 'border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-[var(--app-accent-text)] shadow-inner shadow-[var(--app-shadow)]'
                      : 'border-transparent',
                  )}
                >
                  <Icon size={20} strokeWidth={1.8} />
                </Link>
              </TooltipTrigger>
              <TooltipContent>{t(item.labelKey)}</TooltipContent>
            </Tooltip>
          );
        })}
      </nav>
      <div className="mb-1 rotate-[-90deg] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-app-faint">
        ASRbox
      </div>
    </aside>
  );
}
