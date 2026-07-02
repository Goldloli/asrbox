import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RotateCcw, Square, Trash2 } from 'lucide-react';
import { apiClient, type TaskStatus } from '../lib/api';
import { formatDate, formatDuration, statusLabel } from '../lib/format';

const statuses: Array<'all' | TaskStatus> = ['all', 'queued', 'transcribing', 'completed', 'failed', 'cancelled'];

export function TasksPage() {
  const queryClient = useQueryClient();
  const [status, setStatus] = useState<'all' | TaskStatus>('all');
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => apiClient.listTasks(), refetchInterval: 4000 });

  const tasks = useMemo(() => {
    const items = tasksQuery.data?.items ?? [];
    return status === 'all' ? items : items.filter((task) => task.status === status);
  }, [status, tasksQuery.data?.items]);

  const refresh = () => queryClient.invalidateQueries({ queryKey: ['tasks'] });
  const retry = useMutation({ mutationFn: apiClient.retryTask.bind(apiClient), onSuccess: refresh });
  const cancel = useMutation({ mutationFn: apiClient.cancelTask.bind(apiClient), onSuccess: refresh });
  const remove = useMutation({ mutationFn: apiClient.deleteTask.bind(apiClient), onSuccess: refresh });

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Queue</p>
          <h1>Tasks</h1>
        </div>
        <div className="segmented">
          {statuses.map((item) => (
            <button key={item} className={status === item ? 'active' : ''} onClick={() => setStatus(item)}>
              {statusLabel(item)}
            </button>
          ))}
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>File</th>
              <th>Status</th>
              <th>Engine</th>
              <th>Duration</th>
              <th>Updated</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tasks.map((task) => (
              <tr key={task.id}>
                <td>
                  <strong>{task.filename}</strong>
                  {task.error && <small className="error block">{task.error}</small>}
                </td>
                <td>{statusLabel(task.status)} · {Math.round(task.progress)}%</td>
                <td>{task.model_name ?? task.provider_id ?? task.source}</td>
                <td>{formatDuration(task.duration_ms)}</td>
                <td>{formatDate(task.updated_at)}</td>
                <td className="row-actions">
                  <button className="icon-button" title="Cancel" onClick={() => cancel.mutate(task.id)}><Square size={16} /></button>
                  <button className="icon-button" title="Retry" onClick={() => retry.mutate(task.id)}><RotateCcw size={16} /></button>
                  <button className="icon-button danger" title="Delete" onClick={() => remove.mutate(task.id)}><Trash2 size={16} /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {tasks.length === 0 && <p className="muted table-empty">No matching tasks.</p>}
      </div>
    </section>
  );
}
