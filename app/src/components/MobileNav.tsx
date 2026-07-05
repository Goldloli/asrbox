import { Link, useMatchRoute } from '@tanstack/react-router';
import { DownloadCloud, ListChecks, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';
import { cn } from '../lib/cn';
import asrboxIcon from '../assets/asrbox-icon.png';

const mobileNav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon?: LucideIcon; brand?: boolean }> = [
  { to: '/', labelKey: 'nav.transcribe', brand: true },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function MobileNav() {
  const matchRoute = useMatchRoute();
  const { t } = useI18n();

  return (
    <nav className="app-shell-surface grid h-16 shrink-0 grid-cols-4 border-t app-border md:hidden">
      {mobileNav.map((item) => {
        const Icon = item.icon;
        const active = item.to === '/' ? matchRoute({ to: '/', fuzzy: false }) : matchRoute({ to: item.to, fuzzy: true });
        return (
          <Link
            key={item.to}
            to={item.to}
            aria-label={item.brand ? t('nav.home') : t(item.labelKey)}
            className={cn(
              'grid min-w-0 place-items-center gap-1 px-2 py-2 text-[11px] font-medium text-app-muted transition focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/30',
              active && 'text-[var(--app-accent-text)]',
            )}
          >
            {item.brand ? (
              <span
                className={cn(
                  'grid size-8 place-items-center overflow-hidden rounded-[10px] ring-1 ring-[var(--app-border)]',
                  active && 'ring-[var(--app-accent)]',
                )}
              >
                <img src={asrboxIcon} alt="" className="size-full object-cover" />
              </span>
            ) : (
              Icon && (
                <span
                  className={cn(
                    'grid size-8 place-items-center rounded-lg border border-transparent',
                    active && 'border-[var(--app-accent)] bg-[var(--app-accent-soft)]',
                  )}
                >
                  <Icon className="size-4" strokeWidth={1.8} />
                </span>
              )
            )}
            <span className="w-full truncate text-center">{t(item.labelKey)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
