import { useQuery } from '@tanstack/react-query';
import { Download } from 'lucide-react';
import { apiClient } from '../lib/api';
import { formatDate } from '../lib/format';
import { useI18n } from '../lib/i18n';

const exportFormats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

export function ExportsPage() {
  const { t } = useI18n();
  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => apiClient.listTasks() });
  const completed = (tasksQuery.data?.items ?? []).filter((task) => task.status === 'completed');

  return (
    <section className="page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{t('exports.eyebrow')}</p>
          <h1>{t('exports.title')}</h1>
        </div>
      </header>

      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>{t('exports.task')}</th>
              <th>{t('exports.completedAt')}</th>
              <th>{t('exports.formats')}</th>
            </tr>
          </thead>
          <tbody>
            {completed.map((task) => (
              <tr key={task.id}>
                <td><strong>{task.filename}</strong></td>
                <td>{task.completed_at ? formatDate(task.completed_at) : '-'}</td>
                <td className="export-links">
                  {exportFormats.map((format) => (
                    <a key={format} className="secondary-button" href={apiClient.exportTaskUrl(task.id, format)}>
                      <Download size={15} /> {format.toUpperCase()}
                    </a>
                  ))}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {completed.length === 0 && <p className="muted table-empty">{t('exports.empty')}</p>}
      </div>
    </section>
  );
}
