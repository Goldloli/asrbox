export function formatDate(value: string): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat(undefined, {
    month: 'short',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

export function formatDuration(ms?: number | null): string {
  if (!ms) return '0:00';
  const seconds = Math.round(ms / 1000);
  const mins = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return `${mins}:${String(rest).padStart(2, '0')}`;
}

export function statusLabel(status: string): string {
  return status.replace(/_/g, ' ');
}

export function formatBytes(bytes?: number | null): string {
  if (bytes == null) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unit = 0;
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024;
    unit += 1;
  }
  return `${value >= 10 || unit === 0 ? value.toFixed(0) : value.toFixed(1)} ${units[unit]}`;
}

export function formatPercent(value?: number | null): string {
  return `${Math.round(value ?? 0)}%`;
}
