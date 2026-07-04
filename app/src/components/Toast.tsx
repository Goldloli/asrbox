import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from 'react';
import { AlertCircle, CheckCircle2, Info, X } from 'lucide-react';
import { cn } from '../lib/cn';

type ToastTone = 'success' | 'error' | 'info';

type ToastItem = {
  id: number;
  tone: ToastTone;
  title: string;
  description?: string;
};

type ToastApi = {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  dismiss: (id: number) => void;
};

const ToastContext = createContext<ToastApi | null>(null);

export function toastErrorMessage(error: unknown) {
  if (error instanceof Error) return error.message;
  return String(error);
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const nextId = useRef(1);
  const timers = useRef(new Map<number, number>());

  const dismiss = useCallback((id: number) => {
    const timer = timers.current.get(id);
    if (timer) window.clearTimeout(timer);
    timers.current.delete(id);
    setItems((current) => current.filter((item) => item.id !== id));
  }, []);

  const show = useCallback((tone: ToastTone, title: string, description?: string) => {
    const id = nextId.current;
    nextId.current += 1;
    setItems((current) => [{ id, tone, title, description }, ...current].slice(0, 4));
    const timer = window.setTimeout(() => dismiss(id), tone === 'error' ? 7000 : 4200);
    timers.current.set(id, timer);
  }, [dismiss]);

  const api = useMemo<ToastApi>(() => ({
    success: (title, description) => show('success', title, description),
    error: (title, description) => show('error', title, description),
    info: (title, description) => show('info', title, description),
    dismiss,
  }), [dismiss, show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed left-24 right-4 top-16 z-[80] grid gap-2 md:left-auto md:w-[min(360px,calc(100vw-32px))]">
        {items.map((item) => (
          <ToastCard key={item.id} item={item} onDismiss={() => dismiss(item.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const toast = useContext(ToastContext);
  if (!toast) throw new Error('useToast must be used inside ToastProvider');
  return toast;
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const Icon = item.tone === 'success' ? CheckCircle2 : item.tone === 'error' ? AlertCircle : Info;
  return (
    <div
      role={item.tone === 'error' ? 'alert' : 'status'}
      className={cn(
        'app-panel pointer-events-auto grid grid-cols-[auto_minmax(0,1fr)_auto] gap-3 rounded-xl border p-3 text-sm shadow-2xl',
        item.tone === 'success' && 'border-[color:var(--app-success)]',
        item.tone === 'error' && 'border-[color:var(--app-danger)]',
        item.tone === 'info' && 'border-[color:var(--app-accent)]',
      )}
    >
      <Icon
        className={cn(
          'mt-0.5 size-4',
          item.tone === 'success' && 'text-[var(--app-success)]',
          item.tone === 'error' && 'text-[var(--app-danger)]',
          item.tone === 'info' && 'text-[var(--app-accent-text)]',
        )}
      />
      <div className="min-w-0">
        <p className="font-medium text-app">{item.title}</p>
        {item.description && <p className="mt-1 break-words text-xs leading-5 text-app-muted">{item.description}</p>}
      </div>
      <button
        type="button"
        className="grid size-7 place-items-center rounded-lg text-app-muted transition hover:bg-[var(--app-control)] hover:text-app"
        onClick={onDismiss}
        aria-label="Dismiss notification"
      >
        <X className="size-4" />
      </button>
    </div>
  );
}
