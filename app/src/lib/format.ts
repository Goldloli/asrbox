export function formatDate(value: string): string {
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

