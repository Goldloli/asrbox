import { Link, useMatchRoute, useNavigate } from '@tanstack/react-router';
import { DownloadCloud, ListChecks, Mic2, ServerCog, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import { Tooltip, TooltipContent, TooltipTrigger } from './weiui';
import asrboxIcon from '../assets/asrbox-icon.png';

const nav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon: LucideIcon }> = [
  { to: '/', labelKey: 'nav.transcribe', icon: Mic2 },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/providers', labelKey: 'nav.providers', icon: ServerCog },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar() {
  const matchRoute = useMatchRoute();
  const navigate = useNavigate();
  const { t } = useI18n();

  return (
    <aside className="flex h-dvh w-20 shrink-0 flex-col items-center border-r border-white/10 bg-zinc-950 px-3 py-4">
      <Tooltip>
        <TooltipTrigger asChild>
          <Link
            to="/"
            aria-label={t('nav.home')}
            className="grid size-12 place-items-center overflow-hidden rounded-[14px] shadow-lg shadow-amber-950/30 ring-1 ring-white/10 transition hover:scale-[1.02] hover:ring-amber-300/50 focus:outline-none focus:ring-2 focus:ring-amber-300/70"
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
                    'grid size-11 place-items-center rounded-xl border text-zinc-500 transition hover:border-white/10 hover:bg-white/[0.06] hover:text-zinc-100',
                    active
                      ? 'border-amber-300/40 bg-white/[0.08] text-amber-100 shadow-inner shadow-amber-950/30'
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
      <div className="mb-1 rotate-[-90deg] whitespace-nowrap text-[10px] font-semibold uppercase tracking-[0.22em] text-zinc-700">
        ASRbox
      </div>
    </aside>
  );
}
