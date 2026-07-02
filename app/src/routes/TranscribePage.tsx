import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileAudio, Play, RefreshCw } from 'lucide-react';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDate, formatDuration } from '../lib/format';
import { useI18n } from '../lib/i18n';

const formats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

export function TranscribePage() {
  const queryClient = useQueryClient();
  const { t, statusLabel: localizedStatus } = useI18n();
  const [file, setFile] = useState<File | null>(null);
  const [backend, setBackend] = useState('local');
  const [modelName, setModelName] = useState('whisper-base');
  const [providerId, setProviderId] = useState('bcut');
  const [language, setLanguage] = useState('zh');
  const [outputFormats, setOutputFormats] = useState<string[]>(['txt', 'srt', 'json']);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  const tasksQuery = useQuery({ queryKey: ['tasks'], queryFn: () => apiClient.listTasks(), refetchInterval: 3500 });
  const modelsQuery = useQuery({ queryKey: ['models'], queryFn: () => apiClient.listModels() });
  const providersQuery = useQuery({ queryKey: ['providers'], queryFn: () => apiClient.listProviders() });

  const tasks = tasksQuery.data?.items ?? [];
  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? tasks[0],
    [selectedTaskId, tasks],
  );

  useEffect(() => {
    if (!selectedTaskId && tasks[0]) setSelectedTaskId(tasks[0].id);
  }, [selectedTaskId, tasks]);

  const createMutation = useMutation({
    mutationFn: () => {
      if (!file) throw new Error('Please choose an audio or video file.');
      return apiClient.createTranscription({
        file,
        backend,
        modelName: backend === 'local' ? modelName : undefined,
        providerId: backend === 'provider' ? providerId : undefined,
        language,
        outputFormats,
      });
    },
    onSuccess: (task) => {
      setSelectedTaskId(task.id);
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const toggleFormat = (format: string) => {
    setOutputFormats((current) =>
      current.includes(format) ? current.filter((item) => item !== format) : [...current, format],
    );
  };

  return (
    <section className="workspace-grid">
      <aside className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('transcribe.input')}</p>
            <h1>{t('transcribe.title')}</h1>
          </div>
          <button className="icon-button" onClick={() => tasksQuery.refetch()} title={t('common.refresh')}>
            <RefreshCw size={17} />
          </button>
        </div>

        <label className="dropzone">
          <FileAudio size={24} />
          <span>{file ? file.name : t('transcribe.chooseFile')}</span>
          <input type="file" accept="audio/*,video/*" onChange={(event) => setFile(event.target.files?.[0] ?? null)} />
        </label>

        <div className="task-stack">
          {tasks.map((task) => (
            <button
              key={task.id}
              className={`task-row ${selectedTask?.id === task.id ? 'selected' : ''}`}
              onClick={() => setSelectedTaskId(task.id)}
            >
              <span>{task.filename}</span>
              <small>{localizedStatus(task.status)} · {Math.round(task.progress)}%</small>
            </button>
          ))}
          {tasks.length === 0 && <p className="muted">{t('transcribe.noTasks')}</p>}
        </div>
      </aside>

      <main className="panel transcript-panel">
        {selectedTask ? <Transcript task={selectedTask} /> : <EmptyTranscript />}
      </main>

      <aside className="panel control-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">{t('transcribe.engine')}</p>
            <h2>{t('transcribe.runOptions')}</h2>
          </div>
        </div>

        <label className="field">
          <span>{t('transcribe.backend')}</span>
          <select value={backend} onChange={(event) => setBackend(event.target.value)}>
            <option value="local">{t('settings.local')}</option>
            <option value="provider">{t('settings.provider')}</option>
          </select>
        </label>

        {backend === 'local' ? (
          <label className="field">
            <span>{t('transcribe.model')}</span>
            <select value={modelName} onChange={(event) => setModelName(event.target.value)}>
              {(modelsQuery.data?.models ?? []).map((model) => (
                <option key={model.model_name} value={model.model_name}>
                  {model.display_name}
                </option>
              ))}
            </select>
          </label>
        ) : (
          <label className="field">
            <span>{t('transcribe.provider')}</span>
            <select value={providerId} onChange={(event) => setProviderId(event.target.value)}>
              {(providersQuery.data?.items ?? []).map((provider) => (
                <option key={provider.id} value={provider.id}>
                  {provider.name}
                </option>
              ))}
            </select>
          </label>
        )}

        <label className="field">
          <span>{t('transcribe.language')}</span>
          <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="zh, en, auto" />
        </label>

        <div className="field">
          <span>{t('transcribe.exports')}</span>
          <div className="segmented wrap">
            {formats.map((format) => (
              <button
                key={format}
                className={outputFormats.includes(format) ? 'active' : ''}
                onClick={() => toggleFormat(format)}
                type="button"
              >
                {format.toUpperCase()}
              </button>
            ))}
          </div>
        </div>

        {createMutation.error && <p className="error">{createMutation.error.message}</p>}
        <button className="primary-button" onClick={() => createMutation.mutate()} disabled={!file || createMutation.isPending}>
          <Play size={17} />
          {createMutation.isPending ? t('transcribe.starting') : t('transcribe.start')}
        </button>
      </aside>
    </section>
  );
}

function Transcript({ task }: { task: TranscriptionTask }) {
  const { t, statusLabel: localizedStatus } = useI18n();
  return (
    <>
      <div className="panel-header">
        <div>
          <p className="eyebrow">{localizedStatus(task.status)} · {Math.round(task.progress)}%</p>
          <h2>{task.filename}</h2>
          <p className="muted">{formatDate(task.created_at)} · {formatDuration(task.duration_ms)}</p>
        </div>
      </div>

      <div className="meter"><span style={{ width: `${Math.min(task.progress, 100)}%` }} /></div>

      <section className="transcript-text">
        <h3>{t('transcribe.text')}</h3>
        <textarea value={task.text ?? ''} readOnly placeholder={t('transcribe.placeholder')} />
      </section>

      <section>
        <div className="section-title">
          <h3>{t('transcribe.segments')}</h3>
          {task.status === 'completed' && (
            <a className="secondary-button" href={apiClient.exportTaskUrl(task.id, 'srt')}>
              <Download size={16} /> SRT
            </a>
          )}
        </div>
        <div className="segment-list">
          {task.segments.map((segment) => (
            <div className="segment-row" key={segment.id}>
              <time>{segment.start.toFixed(2)} - {segment.end.toFixed(2)}</time>
              <span>{segment.text}</span>
            </div>
          ))}
          {task.segments.length === 0 && <p className="muted">{t('transcribe.noSegments')}</p>}
        </div>
      </section>
    </>
  );
}

function EmptyTranscript() {
  const { t } = useI18n();
  return (
    <div className="empty-state">
      <FileAudio size={32} />
      <p>{t('transcribe.empty')}</p>
    </div>
  );
}
