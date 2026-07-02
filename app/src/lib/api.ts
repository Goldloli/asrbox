import { useServerStore } from '../stores/serverStore';

export type TaskStatus =
  | 'created'
  | 'queued'
  | 'preprocessing'
  | 'waiting_model'
  | 'downloading_model'
  | 'transcribing'
  | 'postprocessing'
  | 'exporting'
  | 'completed'
  | 'failed'
  | 'cancelled'
  | 'interrupted';

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker?: string | null;
  confidence?: number | null;
}

export interface TranscriptionTask {
  id: string;
  filename: string;
  source: string;
  audio_path: string;
  normalized_audio_path?: string | null;
  status: TaskStatus;
  progress: number;
  language?: string | null;
  model_name?: string | null;
  provider_id?: string | null;
  duration_ms?: number | null;
  text?: string | null;
  error?: string | null;
  options: Record<string, unknown>;
  segments: TranscriptSegment[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
}

export interface TaskListResponse {
  items: TranscriptionTask[];
  total: number;
}

export interface ModelStatus {
  model_name: string;
  display_name: string;
  engine: string;
  source: string;
  repo_id?: string | null;
  model_size: string;
  size_mb: number;
  languages: string[];
  runtime: string;
  supports_timestamps: boolean;
  supports_word_timestamps: boolean;
  supports_diarization: boolean;
  supports_streaming: boolean;
  downloaded: boolean;
  downloading: boolean;
  loaded: boolean;
  error?: string | null;
}

export interface Provider {
  id: string;
  name: string;
  provider_type: string;
  base_url?: string | null;
  api_key_masked?: string | null;
  default_model?: string | null;
  enabled: boolean;
  options: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ASRSettings {
  id: number;
  default_backend: string;
  default_model_name?: string | null;
  default_provider_id?: string | null;
  default_language: string;
  timestamps: boolean;
  word_timestamps: boolean;
  diarization: boolean;
  vad: boolean;
  output_formats: string[];
  max_concurrent_local_tasks: number;
  max_concurrent_provider_tasks: number;
}

async function parseError(response: Response): Promise<Error> {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    const detail = body.detail ?? body.message ?? fallback;
    return new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  } catch {
    return new Error(fallback);
  }
}

class ApiClient {
  private baseUrl(): string {
    return useServerStore.getState().serverUrl;
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers: {
        'Content-Type': 'application/json',
        ...init?.headers,
      },
    });
    if (!response.ok) throw await parseError(response);
    return response.json();
  }

  getHealth() {
    return this.request<{ status: string; version: string; port: number }>('/health');
  }

  listTasks() {
    return this.request<TaskListResponse>('/tasks');
  }

  getTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}`);
  }

  async createTranscription(input: {
    file: File;
    backend: string;
    modelName?: string;
    providerId?: string;
    language?: string;
    outputFormats: string[];
  }) {
    const form = new FormData();
    form.append('file', input.file);
    form.append('backend', input.backend);
    if (input.modelName) form.append('model_name', input.modelName);
    if (input.providerId) form.append('provider_id', input.providerId);
    if (input.language) form.append('language', input.language);
    form.append('output_formats', JSON.stringify(input.outputFormats));

    const response = await fetch(`${this.baseUrl()}/transcriptions`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<TranscriptionTask>;
  }

  retryTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/retry`, { method: 'POST' });
  }

  cancelTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/cancel`, { method: 'POST' });
  }

  deleteTask(id: string) {
    return this.request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' });
  }

  taskEventsUrl(id: string) {
    return `${this.baseUrl()}/tasks/${id}/events`;
  }

  exportTaskUrl(id: string, format: string) {
    return `${this.baseUrl()}/tasks/${id}/export/${format}`;
  }

  listModels() {
    return this.request<{ models: ModelStatus[] }>('/models/status');
  }

  downloadModel(modelName: string) {
    return this.request<{ message: string }>('/models/download', {
      method: 'POST',
      body: JSON.stringify({ model_name: modelName }),
    });
  }

  unloadModel(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/unload`, { method: 'POST' });
  }

  deleteModel(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}`, { method: 'DELETE' });
  }

  listProviders() {
    return this.request<{ items: Provider[] }>('/providers');
  }

  createProvider(data: Record<string, unknown>) {
    return this.request<Provider>('/providers', { method: 'POST', body: JSON.stringify(data) });
  }

  updateProvider(id: string, data: Record<string, unknown>) {
    return this.request<Provider>(`/providers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  deleteProvider(id: string) {
    return this.request<{ message: string }>(`/providers/${id}`, { method: 'DELETE' });
  }

  testProvider(id: string) {
    return this.request<{ ok: boolean; message: string; models: string[] }>(`/providers/${id}/test`, {
      method: 'POST',
    });
  }

  getSettings() {
    return this.request<ASRSettings>('/settings/asr');
  }

  updateSettings(data: Partial<ASRSettings>) {
    return this.request<ASRSettings>('/settings/asr', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }
}

export const apiClient = new ApiClient();
