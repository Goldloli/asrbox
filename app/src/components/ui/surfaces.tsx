import { Loader2 } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

export function Panel({ className, children }: { className?: string; children: ReactNode }) {
  return <section className={cn('app-panel rounded-xl border', className)}>{children}</section>;
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
    <div className={cn('flex items-start justify-between gap-4 border-b app-border px-5 py-4', className)}>
      <div className="min-w-0">
        {eyebrow && <p className="mb-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-app-accent">{eyebrow}</p>}
        <h1 className="truncate text-lg font-semibold text-app">{title}</h1>
        {description && <p className="mt-1 text-sm text-app-muted">{description}</p>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
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

export function ErrorState({ title = 'Unable to load', error }: { title?: string; error: unknown }) {
  const message = error instanceof Error ? error.message : String(error);
  return (
    <div className="rounded-lg border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] px-4 py-3 text-sm text-[var(--app-danger)]">
      <p className="font-medium">{title}</p>
      <p className="mt-1 opacity-80">{message}</p>
    </div>
  );
}

export function LoadingState({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="flex items-center gap-2 text-sm text-app-muted">
      <Loader2 className="size-4 animate-spin" />
      {label}
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
    <div className={cn('flex items-center justify-between gap-3 border-b app-border py-2 text-sm last:border-b-0', className)}>
      <span className="min-w-0 text-app-muted">{label}</span>
      <span className="min-w-0 truncate text-right font-medium text-app">{value}</span>
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
