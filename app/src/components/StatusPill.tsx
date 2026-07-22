import type { TaskStatus } from '../lib/api';
import { useI18n } from '../lib/i18n';
import { Badge } from './weiui';

const toneByStatus: Record<TaskStatus, 'neutral' | 'success' | 'warning' | 'danger' | 'accent'> = {
  created: 'neutral',
  queued: 'neutral',
  importing: 'accent',
  preprocessing: 'accent',
  waiting_model: 'warning',
  downloading_model: 'warning',
  transcribing: 'accent',
  postprocessing: 'accent',
  exporting: 'accent',
  completed: 'success',
  failed: 'danger',
  failed_resumable: 'warning',
  cancelled: 'neutral',
  interrupted: 'warning',
};

export function StatusPill({ status }: { status: TaskStatus }) {
  const { statusLabel } = useI18n();
  return <Badge tone={toneByStatus[status] ?? 'neutral'}>{statusLabel(status)}</Badge>;
}
