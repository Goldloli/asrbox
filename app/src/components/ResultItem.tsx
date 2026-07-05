import { type ReactNode } from 'react';
import { Badge } from './weiui';

export const resultItemClassName =
  'grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-lg border app-control px-3 py-3 text-left transition hover:border-[color:var(--app-accent)] hover:bg-[var(--app-accent-soft)] focus:outline-none focus:ring-2 focus:ring-[color:var(--app-accent)]/30';

export function ResultItemContent({
  icon,
  title,
  description,
  meta,
  tone = 'neutral',
}: {
  icon: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  meta?: ReactNode;
  tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'accent';
}) {
  return (
    <>
      <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-[var(--app-control-strong)] text-app-accent">
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium text-app">{title}</span>
        {description && <span className="mt-0.5 block truncate text-xs text-app-muted">{description}</span>}
      </span>
      {meta && <Badge tone={tone}>{meta}</Badge>}
    </>
  );
}
