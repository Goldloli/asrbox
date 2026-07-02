import { Link, useMatchRoute } from '@tanstack/react-router';
import { DownloadCloud, FileOutput, ListChecks, Mic2, ServerCog, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { useI18n } from '../lib/i18n';

const nav: Array<{ to: string; labelKey: Parameters<ReturnType<typeof useI18n>['t']>[0]; icon: LucideIcon }> = [
  { to: '/', labelKey: 'nav.transcribe', icon: Mic2 },
  { to: '/tasks', labelKey: 'nav.tasks', icon: ListChecks },
  { to: '/models', labelKey: 'nav.models', icon: DownloadCloud },
  { to: '/providers', labelKey: 'nav.providers', icon: ServerCog },
  { to: '/exports', labelKey: 'nav.exports', icon: FileOutput },
  { to: '/settings', labelKey: 'nav.settings', icon: Settings },
];

export function Sidebar() {
  const matchRoute = useMatchRoute();
  const { t } = useI18n();
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>ASR</span>
      </div>
      <nav className="nav">
        {nav.map((item) => {
          const Icon = item.icon;
          const active =
            item.to === '/'
              ? matchRoute({ to: '/', fuzzy: false })
              : matchRoute({ to: item.to, fuzzy: true });
          return (
            <Link key={item.to} to={item.to} className={`nav-button ${active ? 'active' : ''}`} title={t(item.labelKey)}>
              <Icon size={20} strokeWidth={1.8} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
