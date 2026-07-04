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
  | 'failed_resumable'
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
  error_code?: string | null;
  options: Record<string, unknown>;
  segments: TranscriptSegment[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  batch_id?: string | null;
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
  compatible?: boolean | null;
  compatibility_error?: string | null;
  download_error?: string | null;
  size_on_disk_mb?: number | null;
  cache_detected?: boolean;
  cache_size_mb?: number | null;
  cache_path?: string | null;
  preferred_source?: string | null;
  source_candidates?: Array<{ source: string; repo_id: string; priority: number; verified: boolean }>;
  installed_source?: string | null;
  installed_repo_id?: string | null;
  last_verified_at?: string | null;
}

export interface ModelProgress {
  model_name: string;
  current: number;
  total: number;
  progress: number;
  filename?: string | null;
  status: 'downloading' | 'extracting' | 'complete' | 'error';
  error?: string | null;
  source?: string | null;
  repo_id?: string | null;
  fallback_from?: string | null;
  timestamp: string;
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

export interface RuntimeStatus {
  python_version: string;
  platform: string;
  ffmpeg_available: boolean;
  ffprobe_available: boolean;
  torch_available: boolean;
  torch_cuda_available: boolean;
  torch_mps_available: boolean;
  ctranslate2_available: boolean;
  faster_whisper_available: boolean;
  funasr_available: boolean;
  torchaudio_available: boolean;
  modelscope_available: boolean;
  huggingface_hub_available: boolean;
  pyannote_available: boolean;
  diarization_ready: boolean;
  mlx_available: boolean;
  mlx_whisper_available: boolean;
  qwen3_asr_available: boolean;
  transformers_qwen3_asr_available: boolean;
  data_dir: string;
  models_dir: string;
  free_disk_bytes?: number | null;
  warnings: string[];
}

export interface TaskDiagnostic {
  id: number;
  task_id: string;
  stage: string;
  error_code?: string | null;
  message: string;
  created_at: string;
}

export interface TaskQuality {
  task_id: string;
  warnings: string[];
  metrics: Record<string, unknown>;
}

export interface TranscriptionPreflight {
  filename: string;
  supported_format: boolean;
  has_audio_stream: boolean;
  duration_ms?: number | null;
  will_chunk: boolean;
  chunk_count: number;
  warnings: string[];
  readiness: Record<string, unknown>;
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

  async preflightTranscription(file: File) {
    const form = new FormData();
    form.append('file', file);
    const response = await fetch(`${this.baseUrl()}/transcriptions/preflight`, {
      method: 'POST',
      body: form,
    });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<TranscriptionPreflight>;
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

  getTaskDiagnostics(id: string) {
    return this.request<TaskDiagnostic[]>(`/tasks/${id}/diagnostics`);
  }

  getTaskQuality(id: string) {
    return this.request<TaskQuality>(`/tasks/${id}/quality`);
  }

  retryFailedChunks(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/chunks/retry-failed`, { method: 'POST' });
  }

  cleanupTaskArtifacts(id: string) {
    return this.request<{ removed: string[]; errors: string[] }>(`/tasks/${id}/cleanup-artifacts`, { method: 'POST' });
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

  modelProgressUrl(modelName: string) {
    return `${this.baseUrl()}/models/progress/${modelName}`;
  }

  unloadModel(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/unload`, { method: 'POST' });
  }

  deleteModel(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}`, { method: 'DELETE' });
  }

  redownloadModel(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/redownload`, { method: 'POST' });
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

  getRuntimeStatus() {
    return this.request<RuntimeStatus>('/runtime/status');
  }

  runtimeDiagnosticBundleUrl() {
    return `${this.baseUrl()}/runtime/diagnostic-bundle.zip`;
  }
}

export const apiClient = new ApiClient();
