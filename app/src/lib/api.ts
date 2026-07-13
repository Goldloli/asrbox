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

export interface ActiveTasksResponse {
  items?: TranscriptionTask[];
  queued_tasks?: TranscriptionTask[];
  running_tasks?: TranscriptionTask[];
  downloads?: ModelProgress[];
  local_queue_length?: number;
  provider_queue_length?: number;
  local_worker_count?: number;
  provider_worker_count?: number;
  max_concurrent_local_tasks?: number;
  max_concurrent_provider_tasks?: number;
  recent_error?: string | null;
}

export interface TranscriptionReadiness {
  ready: boolean;
  can_transcribe?: boolean;
  issues?: string[];
  warnings?: string[];
  missing_models?: string[];
  default_backend?: string;
  default_model_name?: string | null;
  default_provider_id?: string | null;
  runtime?: Record<string, unknown>;
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

export interface BatchTranscriptionResponse {
  batch_id?: string;
  items?: TranscriptionTask[];
  tasks?: TranscriptionTask[];
  total?: number;
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
  status: 'queued' | 'downloading' | 'extracting' | 'complete' | 'cancelled' | 'error';
  error?: string | null;
  source?: string | null;
  repo_id?: string | null;
  fallback_from?: string | null;
  timestamp: string;
}

export type ActiveDownloadsResponse = ModelProgress[] | { items?: ModelProgress[]; downloads?: ModelProgress[] };

export interface ModelStorage {
  models_dir?: string;
  total_bytes?: number;
  used_bytes?: number;
  free_bytes?: number;
  models?: Array<{
    model_name: string;
    size_bytes?: number;
    path?: string;
    last_modified?: string;
  }>;
}

export interface StorageCleanupOptions {
  delete_normalized: boolean;
  delete_chunks: boolean;
  delete_orphans: boolean;
  delete_old_diagnostics: boolean;
}

export interface StorageCleanupResult {
  removed: string[];
  errors: string[];
  freed_mb: number;
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

export interface ProviderTestResult {
  ok: boolean;
  message: string;
  models?: string[];
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
  ffmpeg_path?: string | null;
  ffprobe_path?: string | null;
}

export interface RuntimeStatus {
  python_version: string;
  platform: string;
  ffmpeg_available: boolean;
  ffprobe_available: boolean;
  ffmpeg_path?: string | null;
  ffprobe_path?: string | null;
  ffmpeg_source: 'manual' | 'bundled' | 'system' | 'missing';
  ffprobe_source: 'manual' | 'bundled' | 'system' | 'missing';
  ffmpeg_version?: string | null;
  ffprobe_version?: string | null;
  ffmpeg_error?: string | null;
  ffprobe_error?: string | null;
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

export interface HealthStatus {
  status: string;
  version?: string;
  port?: number;
  backend_type?: string;
}

export interface TaskDiagnostic {
  id: number;
  task_id: string;
  stage: string;
  error_code?: string | null;
  message: string;
  created_at: string;
}

export interface TaskLogEntry {
  id?: number;
  task_id?: string;
  level?: string;
  stage?: string;
  message: string;
  created_at?: string;
  timestamp?: string;
}

export interface TaskVersion {
  id: string | number;
  task_id?: string;
  label?: string | null;
  text?: string | null;
  created_at: string;
  metadata?: Record<string, unknown>;
}

export interface TaskQuality {
  task_id: string;
  warnings: string[];
  metrics: Record<string, unknown>;
}

export type AppEvent =
  | { type: 'task.updated' | 'task.failed' | 'task.completed'; task?: TranscriptionTask; task_id?: string; [key: string]: unknown }
  | { type: 'chunk.updated'; task_id?: string; chunk_id?: string | number; [key: string]: unknown }
  | { type: 'model.download.updated'; model?: ModelProgress; model_name?: string; [key: string]: unknown }
  | { type: 'runtime.warning' | 'storage.warning'; message?: string; [key: string]: unknown };

async function parseError(response: Response): Promise<Error> {
  const fallback = `HTTP ${response.status}`;
  try {
    const body = await response.json();
    const detail = body.detail ?? body.message ?? body.error ?? fallback;
    return new Error(typeof detail === 'string' ? detail : JSON.stringify(detail));
  } catch {
    return new Error(fallback);
  }
}

class ApiClient {
  baseUrl(): string {
    return useServerStore.getState().serverUrl.replace(/\/$/, '');
  }

  private async request<T>(path: string, init?: RequestInit): Promise<T> {
    const headers = new Headers(init?.headers);
    const apiToken = useServerStore.getState().apiToken;
    if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
    if (init?.body && !headers.has('Content-Type')) {
      headers.set('Content-Type', 'application/json');
    }
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw await parseError(response);
    if (response.status === 204) return undefined as T;
    return response.json();
  }

  private async formRequest<T>(path: string, form: FormData): Promise<T> {
    const headers = new Headers();
    const apiToken = useServerStore.getState().apiToken;
    if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
    const response = await fetch(`${this.baseUrl()}${path}`, {
      method: 'POST',
      body: form,
      headers,
    });
    if (!response.ok) throw await parseError(response);
    return response.json() as Promise<T>;
  }

  getHealth() {
    return this.request<HealthStatus>('/health');
  }

  getReadiness() {
    return this.request<TranscriptionReadiness>('/transcriptions/readiness');
  }

  async preflightTranscription(file: File) {
    const form = new FormData();
    form.append('file', file);
    return this.formRequest<TranscriptionPreflight>('/transcriptions/preflight', form);
  }

  async createTranscription(input: {
    file: File;
    backend: string;
    modelName?: string;
    providerId?: string;
    language?: string;
    outputFormats: string[];
    postprocessMode?: string;
    traditionalToSimplified?: boolean;
  }) {
    const form = new FormData();
    form.append('file', input.file);
    form.append('backend', input.backend);
    if (input.modelName) form.append('model_name', input.modelName);
    if (input.providerId) form.append('provider_id', input.providerId);
    if (input.language) form.append('language', input.language);
    form.append('output_formats', JSON.stringify(input.outputFormats));
    if (input.postprocessMode) form.append('postprocess_mode', input.postprocessMode);
    if (input.traditionalToSimplified != null) form.append('traditional_to_simplified', String(input.traditionalToSimplified));
    return this.formRequest<TranscriptionTask>('/transcriptions', form);
  }

  async createBatchTranscription(input: {
    files: File[];
    backend: string;
    modelName?: string;
    providerId?: string;
    language?: string;
    outputFormats: string[];
    postprocessMode?: string;
    traditionalToSimplified?: boolean;
  }) {
    const form = new FormData();
    input.files.forEach((file) => form.append('files', file));
    form.append('backend', input.backend);
    if (input.modelName) form.append('model_name', input.modelName);
    if (input.providerId) form.append('provider_id', input.providerId);
    if (input.language) form.append('language', input.language);
    form.append('output_formats', JSON.stringify(input.outputFormats));
    if (input.postprocessMode) form.append('postprocess_mode', input.postprocessMode);
    if (input.traditionalToSimplified != null) form.append('traditional_to_simplified', String(input.traditionalToSimplified));
    return this.formRequest<BatchTranscriptionResponse>('/transcriptions/batch', form);
  }

  listTasks() {
    return this.request<TaskListResponse>('/tasks');
  }

  listActiveTasks() {
    return this.request<ActiveTasksResponse>('/tasks/active');
  }

  getTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}`);
  }

  getTaskDiagnostics(id: string) {
    return this.request<TaskDiagnostic[]>(`/tasks/${id}/diagnostics`);
  }

  getTaskLogs(id: string) {
    return this.request<TaskLogEntry[]>(`/tasks/${id}/logs`);
  }

  getTaskVersions(id: string) {
    return this.request<TaskVersion[]>(`/tasks/${id}/versions`);
  }

  getTaskQuality(id: string) {
    return this.request<TaskQuality>(`/tasks/${id}/quality`);
  }

  retryTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/retry`, { method: 'POST' });
  }

  cancelTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/cancel`, { method: 'POST' });
  }

  retranscribeTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/retranscribe`, { method: 'POST' });
  }

  postprocessTask(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/postprocess`, { method: 'POST' });
  }

  retryFailedChunks(id: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/chunks/retry-failed`, { method: 'POST' });
  }

  cleanupTaskArtifacts(id: string) {
    return this.request<{ removed?: string[]; errors?: string[]; message?: string }>(`/tasks/${id}/cleanup-artifacts`, {
      method: 'POST',
    });
  }

  deleteTask(id: string) {
    return this.request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' });
  }

  clearTasks() {
    return this.request<{ deleted: number }>('/tasks', { method: 'DELETE' });
  }

  exportTaskUrl(id: string, format: string) {
    return this.browserResourceUrl(`/tasks/${id}/export/${format}`);
  }

  taskAudioUrl(id: string) {
    return this.browserResourceUrl(`/tasks/${id}/audio`);
  }

  eventsUrl() {
    return this.browserResourceUrl('/events');
  }

  listModels() {
    return this.request<{ models: ModelStatus[] }>('/models/status');
  }

  listActiveDownloads() {
    return this.request<ActiveDownloadsResponse>('/models/active-downloads');
  }

  getModelStorage() {
    return this.request<ModelStorage>('/models/storage');
  }

  cleanupStorage(options: StorageCleanupOptions, dryRun = false) {
    return this.request<StorageCleanupResult>(dryRun ? '/storage/cleanup/dry-run' : '/storage/cleanup', {
      method: 'POST',
      body: JSON.stringify(options),
    });
  }

  downloadModel(modelName: string) {
    return this.request<{ message: string }>('/models/download', {
      method: 'POST',
      body: JSON.stringify({ model_name: modelName }),
    });
  }

  cancelModelDownload(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/cancel-download`, { method: 'POST' });
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
    return this.request<ProviderTestResult>(`/providers/${id}/test`, { method: 'POST' });
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
    return this.browserResourceUrl('/runtime/diagnostic-bundle.zip');
  }

  private browserResourceUrl(path: string) {
    const url = new URL(`${this.baseUrl()}${path}`);
    const apiToken = useServerStore.getState().apiToken;
    if (apiToken) url.searchParams.set('api_token', apiToken);
    return url.toString();
  }
}

export const apiClient = new ApiClient();

export function getActiveTaskItems(response?: ActiveTasksResponse): TranscriptionTask[] {
  if (!response) return [];
  if (response.items) return response.items;
  return [...(response.running_tasks ?? []), ...(response.queued_tasks ?? [])];
}

export function getActiveDownloadItems(response?: ActiveDownloadsResponse | ActiveTasksResponse): ModelProgress[] {
  if (!response) return [];
  if (Array.isArray(response)) return response;
  if (response.downloads) return response.downloads;
  return (response.items as ModelProgress[] | undefined) ?? [];
}
