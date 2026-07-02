import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Download, FileAudio, Play, RefreshCw } from 'lucide-react';
import { apiClient, type TranscriptionTask } from '../lib/api';
import { formatDate, formatDuration, statusLabel } from '../lib/format';

const formats = ['txt', 'srt', 'vtt', 'ass', 'json', 'md'];

export function TranscribePage() {
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [backend, setBackend] = useState('local');
  const [modelName, setModelName] = useState('faster-whisper-small');
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
            <p className="eyebrow">Input</p>
            <h1>Transcription</h1>
          </div>
          <button className="icon-button" onClick={() => tasksQuery.refetch()} title="Refresh tasks">
            <RefreshCw size={17} />
          </button>
        </div>

        <label className="dropzone">
          <FileAudio size={24} />
          <span>{file ? file.name : 'Choose audio or video'}</span>
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
              <small>{statusLabel(task.status)} · {Math.round(task.progress)}%</small>
            </button>
          ))}
          {tasks.length === 0 && <p className="muted">No tasks yet.</p>}
        </div>
      </aside>

      <main className="panel transcript-panel">
        {selectedTask ? <Transcript task={selectedTask} /> : <EmptyTranscript />}
      </main>

      <aside className="panel control-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Engine</p>
            <h2>Run options</h2>
          </div>
        </div>

        <label className="field">
          <span>Backend</span>
          <select value={backend} onChange={(event) => setBackend(event.target.value)}>
            <option value="local">Local model</option>
            <option value="provider">Online provider</option>
          </select>
        </label>

        {backend === 'local' ? (
          <label className="field">
            <span>Model</span>
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
            <span>Provider</span>
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
          <span>Language</span>
          <input value={language} onChange={(event) => setLanguage(event.target.value)} placeholder="zh, en, auto" />
        </label>

        <div className="field">
          <span>Exports</span>
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
          {createMutation.isPending ? 'Starting' : 'Start transcription'}
        </button>
      </aside>
    </section>
  );
}

function Transcript({ task }: { task: TranscriptionTask }) {
  return (
    <>
      <div className="panel-header">
        <div>
          <p className="eyebrow">{statusLabel(task.status)} · {Math.round(task.progress)}%</p>
          <h2>{task.filename}</h2>
          <p className="muted">{formatDate(task.created_at)} · {formatDuration(task.duration_ms)}</p>
        </div>
      </div>

      <div className="meter"><span style={{ width: `${Math.min(task.progress, 100)}%` }} /></div>

      <section className="transcript-text">
        <h3>Text</h3>
        <textarea value={task.text ?? ''} readOnly placeholder="Transcript will appear here." />
      </section>

      <section>
        <div className="section-title">
          <h3>Segments</h3>
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
          {task.segments.length === 0 && <p className="muted">No segments yet.</p>}
        </div>
      </section>
    </>
  );
}

function EmptyTranscript() {
  return (
    <div className="empty-state">
      <FileAudio size={32} />
      <p>Select a file and start a transcription.</p>
    </div>
  );
}
