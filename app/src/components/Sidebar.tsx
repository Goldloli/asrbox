import { Link, useMatchRoute } from '@tanstack/react-router';
import { DownloadCloud, FileOutput, ListChecks, Mic2, ServerCog, Settings } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

const nav: Array<{ to: string; label: string; icon: LucideIcon }> = [
  { to: '/', label: 'Transcribe', icon: Mic2 },
  { to: '/tasks', label: 'Tasks', icon: ListChecks },
  { to: '/models', label: 'Models', icon: DownloadCloud },
  { to: '/providers', label: 'Providers', icon: ServerCog },
  { to: '/exports', label: 'Exports', icon: FileOutput },
  { to: '/settings', label: 'Settings', icon: Settings },
];

export function Sidebar() {
  const matchRoute = useMatchRoute();
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
            <Link key={item.to} to={item.to} className={`nav-button ${active ? 'active' : ''}`} title={item.label}>
              <Icon size={20} strokeWidth={1.8} />
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}

