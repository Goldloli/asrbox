import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { localizedErrorPresentation } from '../../lib/errorMessages';
import { useI18n } from '../../lib/i18n';
import { LocalizedTechnicalMessage } from '../LocalizedTechnicalMessage';

export function Panel({ className, children, ...rest }: React.ComponentPropsWithoutRef<'section'>) {
  return <section className={cn('app-panel rounded-2xl border', className)} {...rest}>{children}</section>;
}

export function PanelHeader({
  title,
  eyebrow,
  description,
  action,
  className,
}: {
  title: string;
  eyebrow?: string;
  description?: ReactNode;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-4 border-b app-border px-5 py-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-accent">{eyebrow}</p>}
        <h1 className="truncate text-xl font-semibold text-app">{title}</h1>
        {description && <p className="mt-1 text-sm text-app-muted">{description}</p>}
      </div>
      {action && <div className="ml-auto shrink-0">{action}</div>}
    </div>
  );
}

export function EmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="grid min-h-56 place-items-center px-6 py-10 text-center">
      <div className="grid max-w-sm justify-items-center gap-3">
        {icon && <div className="grid size-11 place-items-center rounded-xl border app-control text-app-accent">{icon}</div>}
        <h3 className="text-sm font-semibold text-app">{title}</h3>
        {body && <p className="text-sm leading-6 text-app-muted">{body}</p>}
        {action && <div className="mt-1">{action}</div>}
      </div>
    </div>
  );
}

export function CompactEmptyState({ title, body, icon, action }: { title: string; body?: string; icon?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex items-start gap-3 rounded-lg border app-control px-3 py-3">
      {icon && <div className="grid size-10 shrink-0 place-items-center rounded-xl border app-control text-app-accent">{icon}</div>}
      <div className="min-w-0 flex-1">
        <h3 className="text-sm font-semibold text-app">{title}</h3>
        {body && <p className="mt-1 text-sm leading-6 text-app-muted">{body}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}

export function ErrorState({ title, error }: { title?: string; error: unknown }) {
  const { locale, t } = useI18n();
  const message = localizedErrorPresentation(error, locale);
  return (
    <div className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
      <p className="font-medium">{title ?? t('common.unableToLoad')}</p>
      <LocalizedTechnicalMessage message={message} className="mt-1 opacity-80" />
    </div>
  );
}

export function LoadingState({ label }: { label?: string }) {
  const { t } = useI18n();
  return (
    <div className="flex items-center gap-2 text-sm text-app-muted">
      <Loader2 className="size-4 animate-spin" />
      {label ?? t('common.loading')}
    </div>
  );
}

export function Toolbar({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-center justify-between gap-2 border-y app-border bg-[var(--app-panel-solid)] px-4 py-2.5', className)}>
      {children}
    </div>
  );
}

export function SplitPane({ children, className }: { children: ReactNode; className?: string }) {
  return <section className={cn('grid gap-4 xl:grid-cols-[380px_minmax(0,1fr)]', className)}>{children}</section>;
}

export function InspectorSection({ title, action, children, className }: { title: string; action?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('grid gap-3 rounded-xl border app-control p-3', className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold text-app">{title}</h3>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

export function DataRow({ label, value, className }: { label: ReactNode; value: ReactNode; className?: string }) {
  return (
    <div className={cn('flex min-w-0 items-start justify-between gap-3 border-b app-border py-2 text-sm last:border-b-0', className)}>
      <span className="shrink-0 text-app-muted">{label}</span>
      <span className="min-w-0 max-w-[68%] break-words text-right font-medium text-app">{value}</span>
    </div>
  );
}

export function KeyboardHint({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={cn('rounded-md border app-control px-1.5 py-0.5 font-mono text-[11px] text-app-muted', className)}>
      {children}
    </kbd>
  );
}

export function PageTitle({ title, description, action, className }: { title: string; description?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn('flex flex-wrap items-end justify-between gap-3', className)}>
      <div className="min-w-0">
        <h1 data-testid="page-title" className="truncate text-[28px] font-bold leading-tight tracking-[-0.02em] text-app">{title}</h1>
        {description && <p className="mt-1.5 text-[15px] text-app-muted">{description}</p>}
      </div>
      {action && <div className="ml-auto flex shrink-0 items-center gap-2">{action}</div>}
    </div>
  );
}

export function ContentSection({ title, description, action, children, className, contentClassName }: {
  title?: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  contentClassName?: string;
}) {
  return (
    <section className={cn('grid gap-3', className)}>
      {(title || action) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            {title && <h2 className="text-sm font-semibold text-app">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-app-muted">{description}</p>}
          </div>
          {action && <div className="ml-auto shrink-0">{action}</div>}
        </div>
      )}
      <div className={contentClassName}>{children}</div>
    </section>
  );
}

export function RowList({ children, className }: { children: ReactNode; className?: string }) {
  return <div role="list" className={cn('divide-y divide-[color:var(--app-border)] rounded-xl border app-control bg-[var(--app-panel)]', className)}>{children}</div>;
}

export function RowItem({ children, className, active }: { children: ReactNode; className?: string; active?: boolean }) {
  return (
    <div
      role="listitem"
      data-active={active ? 'true' : undefined}
      className={cn(
        'relative flex items-center gap-3 px-4 py-3 transition-colors',
        active && 'bg-[var(--app-accent-soft)]',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function WorkspaceRegion({ label, children, className }: { label?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-h-0 min-w-0 flex-col', className)}>
      {label && <div className="flex h-10 shrink-0 items-center border-b app-border px-4 text-sm font-semibold text-app">{label}</div>}
      {children}
    </section>
  );
}

export function ContextInspector({ title, children, className }: { title?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <aside className={cn('flex min-h-0 min-w-0 flex-col divide-y app-border overflow-y-auto', className)}>
      {title && <div className="flex shrink-0 items-center px-4 py-3 text-sm font-semibold text-app">{title}</div>}
      {children}
    </aside>
  );
}

export function FeedbackBar({ tone = 'info', icon, children, className }: {
  tone?: 'info' | 'success' | 'warning' | 'danger';
  icon?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: 'border-[color:var(--app-border)] bg-[var(--app-control)] text-app-soft',
    success: 'border-[color:var(--app-success)] bg-[var(--app-success-soft)] text-[var(--app-success)]',
    warning: 'border-[color:var(--app-warning)] bg-[var(--app-warning-soft)] text-[var(--app-warning)]',
    danger: 'border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] text-[var(--app-danger)]',
  } as const;
  return (
    <div role="status" className={cn('flex items-start gap-2 rounded-lg border px-3 py-2 text-sm', tones[tone], className)}>
      {icon && <span className="mt-0.5 shrink-0 [&>svg]:size-4">{icon}</span>}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
