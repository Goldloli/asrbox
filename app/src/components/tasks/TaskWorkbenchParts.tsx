import { useMutation } from '@tanstack/react-query';
import { Link } from '@tanstack/react-router';
import { Folder, RotateCcw, Star } from 'lucide-react';
import { type TranscriptionTask } from '../../lib/api';
import { cn } from '../../lib/cn';
import { formatDate, formatDuration, formatPercent } from '../../lib/format';
import { useI18n } from '../../lib/i18n';
import { Button, Progress } from '../weiui';
import { StatusPill } from '../StatusPill';
import { toastErrorMessage, useToast } from '../Toast';

export function TaskRow({
  task,
  selected,
  checked,
  favorited,
  collection,
  selectionMode = false,
  onToggle,
  onSelect,
}: {
  task: TranscriptionTask;
  selected: boolean;
  checked: boolean;
  favorited: boolean;
  collection?: string;
  selectionMode?: boolean;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return (
    <article
      className={cn(
        'relative grid items-start gap-2 rounded-xl border border-transparent px-3 py-3.5 transition hover:bg-[var(--app-control)]',
        selectionMode ? 'grid-cols-[auto_minmax(0,1fr)]' : 'grid-cols-1',
        selected ? 'border-[color:var(--app-accent)]/20 bg-[var(--app-accent-soft)] shadow-[inset_3px_0_0_var(--app-accent)]' : '',
      )}
    >
      {selectionMode && (
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggle}
          aria-label={task.filename}
          className="mt-1 size-4 rounded border app-control accent-[var(--app-accent)]"
        />
      )}
      <button type="button" className="grid min-w-0 gap-2.5 text-left" onClick={onSelect}>
        <div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
          <div className="min-w-0">
            <h2 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold leading-5 text-app">
              {favorited && <Star className="size-3.5 shrink-0 fill-[var(--app-accent)] text-[var(--app-accent)]" />}
              <span className="truncate">{task.filename}</span>
            </h2>
            <p className="mt-1 truncate text-xs text-app-muted">{task.model_name ?? task.provider_id ?? task.source}</p>
          </div>
          <StatusPill status={task.status} />
        </div>
        {task.status !== 'completed' && <Progress value={task.progress} />}
        <div className="flex justify-between gap-3 text-xs text-app-muted">
          <span>{formatDuration(task.duration_ms)} · {formatDate(task.updated_at)}</span>
          {task.status !== 'completed' && <span>{formatPercent(task.progress)}</span>}
        </div>
        {collection && (
          <div className="flex min-w-0 items-center gap-1 text-xs text-app-muted">
            <Folder className="size-3.5 shrink-0" />
            <span className="truncate">{collection}</span>
          </div>
        )}
      </button>
    </article>
  );
}

export function Metric({ label, value }: { label: string; value?: string | null }) {
  return (
    <div className="rounded-lg border app-control px-3 py-2">
      <p className="text-app-muted">{label}</p>
      <p className="mt-1 truncate text-app">{value || '-'}</p>
    </div>
  );
}

export function ErrorDiagnosticsPanel({
  task,
  diagnostics,
  logs,
  onRetry,
  onRetryChunks,
}: {
  task: TranscriptionTask;
  diagnostics: Array<{ stage: string; error_code?: string | null; message: string; created_at: string }>;
  logs: Array<{ level?: string; stage?: string; message: string; created_at?: string; timestamp?: string }>;
  onRetry: () => void;
  onRetryChunks: () => void;
}) {
  const { t } = useI18n();
  const importantLogs = logs.filter((item) => ['error', 'warning'].includes((item.level ?? '').toLowerCase())).slice(0, 3);
  const suspiciousSegments = (task.segments ?? [])
    .filter((segment) => segment.end < segment.start || (typeof segment.confidence === 'number' && segment.confidence < 0))
    .slice(0, 3);

  return (
    <div className="grid gap-3 rounded-xl border border-[color:var(--app-danger)] bg-[var(--app-danger-soft)] p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-semibold text-[var(--app-danger)]">{t('tasks.errorDiagnostics')}</h3>
          <p className="mt-1 text-xs text-[var(--app-danger)]/80">{task.error_code ?? t('tasks.errorUnknown')}</p>
        </div>
        <Button asChild size="sm" variant="secondary">
          <Link to="/settings" search={{ tab: 'storage' }}>{t('settings.diagnosticBundle')}</Link>
        </Button>
      </div>

      <div className="grid gap-2">
        <h4 className="text-xs font-semibold text-[var(--app-danger)]">{t('tasks.errorSignals')}</h4>
        {(diagnostics.length > 0 ? diagnostics.slice(0, 3) : [{ stage: task.error_code ?? 'error', message: task.error ?? t('tasks.errorUnknown'), created_at: task.updated_at }]).map((item, index) => (
          <div key={`${item.stage}-${index}`} className="rounded-lg border border-[color:var(--app-danger)]/30 bg-[var(--app-panel)] px-3 py-2 text-xs">
            <p className="font-medium text-app">{item.stage}</p>
            <p className="mt-1 text-app-muted">{item.message}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-2">
        <h4 className="text-xs font-semibold text-[var(--app-danger)]">{t('tasks.failedFragments')}</h4>
        {suspiciousSegments.length > 0 ? (
          suspiciousSegments.map((segment) => (
            <div key={segment.id} className="rounded-lg border border-[color:var(--app-danger)]/30 bg-[var(--app-panel)] px-3 py-2 text-xs text-app-muted">
              {segment.start.toFixed(2)}s - {segment.end.toFixed(2)}s · {segment.text || '-'}
            </div>
          ))
        ) : importantLogs.length > 0 ? (
          importantLogs.map((item, index) => (
            <div key={`${item.stage ?? item.level}-${index}`} className="rounded-lg border border-[color:var(--app-danger)]/30 bg-[var(--app-panel)] px-3 py-2 text-xs text-app-muted">
              {item.stage ?? item.level}: {item.message}
            </div>
          ))
        ) : (
          <p className="rounded-lg border border-[color:var(--app-danger)]/30 bg-[var(--app-panel)] px-3 py-2 text-xs text-app-muted">{t('tasks.noFailedFragments')}</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onRetry}>
          <RotateCcw className="size-4" />
          {t('tasks.retry')}
        </Button>
        <Button size="sm" variant="secondary" onClick={onRetryChunks}>
          <RotateCcw className="size-4" />
          {t('tasks.retryChunks')}
        </Button>
      </div>
    </div>
  );
}

export function FilterCheckboxGroup({
  title,
  options,
  values,
  onToggle,
}: {
  title: string;
  options: string[];
  values: string[];
  onToggle: (value: string) => void;
}) {
  return (
    <div className="grid gap-2">
      <p className="text-xs font-medium text-app-muted">{title}</p>
      <div className="flex flex-wrap gap-2">
        {options.map((option) => (
          <label key={option} className="flex h-8 items-center gap-2 rounded-lg border app-control px-3 text-xs text-app-soft">
            <input
              type="checkbox"
              checked={values.includes(option)}
              onChange={() => onToggle(option)}
              className="size-3.5 rounded border app-control accent-[var(--app-accent)]"
            />
            <span className="max-w-44 truncate">{option}</span>
          </label>
        ))}
      </div>
    </div>
  );
}

export function useTaskMutation<T>(mutationFn: (id: string) => Promise<T>, onSuccess: () => void, successMessage: string) {
  const { t } = useI18n();
  const toast = useToast();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      onSuccess();
      toast.success(successMessage);
    },
    onError: (error) => toast.error(t('toast.actionFailed'), toastErrorMessage(error)),
  });
}
