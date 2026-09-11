import { useServerStore } from '../stores/serverStore';
import { consumeChatSseResponse } from './eventStream';

export type TaskStatus =
  | 'created'
  | 'queued'
  | 'importing'
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
  source_kind: 'managed' | 'external';
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

export interface SegmentBulkUpdateItem {
  id: number;
  start: number;
  end: number;
  text: string;
  speaker: string | null;
}

export interface ResourceTicketResponse {
  ticket: string;
  path: string;
  expires_at: string;
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

export interface PathTranscriptionInput {
  paths: string[];
  backend: string;
  modelName?: string;
  providerId?: string;
  language?: string;
  outputFormats: string[];
  postprocessMode?: string;
  traditionalToSimplified?: boolean;
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
  supported_devices: Array<'cpu' | 'cuda' | 'mps' | 'mlx'>;
  supports_timestamps: boolean;
  supports_word_timestamps: boolean;
  supports_diarization: boolean;
  supports_streaming: boolean;
  downloaded: boolean | null;
  downloading: boolean;
  loaded: boolean;
  error?: string | null;
  compatible?: boolean | null;
  compatibility_error?: string | null;
  compatibility_error_code?: 'model_not_downloaded' | 'missing_files' | 'unknown_model' | 'runtime_incompatible' | null;
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
  storage_status: 'available' | 'read_only' | 'unavailable' | 'migrating';
  storage_error?: string | null;
}

export interface ModelProgress {
  model_name: string;
  current: number;
  total: number;
  progress: number;
  filename?: string | null;
  status: 'queued' | 'downloading' | 'paused' | 'extracting' | 'complete' | 'cancelled' | 'error';
  error?: string | null;
  source?: string | null;
  repo_id?: string | null;
  fallback_from?: string | null;
  timestamp: string;
}

export type ActiveDownloadsResponse = ModelProgress[] | { items?: ModelProgress[]; downloads?: ModelProgress[] };

export interface ModelStorage {
  root: string;
  models_dir: string;
  status: 'available' | 'read_only' | 'unavailable' | 'migrating';
  reason?: string | null;
  detail?: string | null;
  available: boolean;
  writable: boolean;
  cache_dirs: Record<string, string>;
  cache_usage: ModelCacheUsage[];
  cache_bytes: number;
  allowed_roots: string[];
  root_locked: boolean;
  runtime: 'desktop' | 'container';
  network_filesystem: boolean;
  filesystem_type?: string | null;
  total_bytes?: number | null;
  used_bytes: number;
  free_bytes?: number | null;
  models?: Array<{
    model_name: string;
    size_bytes?: number;
    path?: string;
    last_modified?: string;
  }>;
}

export interface ModelCacheUsage {
  name: string;
  path: string;
  size_bytes: number;
  shared: boolean;
  selected: boolean;
  warning?: string | null;
}

export interface ModelStorageCandidate {
  target_root: string;
  mode: 'move' | 'adopt';
  valid: boolean;
  writable: boolean;
  errors: string[];
  warnings: string[];
  conflicts: string[];
  blockers: string[];
  valid_models: string[];
  incomplete_models: string[];
  caches: ModelCacheUsage[];
  required_bytes: number;
  required_headroom_bytes: number;
  free_bytes?: number | null;
  network_filesystem: boolean;
}

export interface ModelRelocationRequest {
  target_root: string;
  mode: 'move' | 'adopt';
  include_shared_caches: boolean;
  acknowledge_network: boolean;
}

export interface ModelRelocationJob {
  id?: string | null;
  status: 'idle' | 'running' | 'cancelling' | 'cancelled' | 'complete' | 'failed';
  phase: string;
  mode?: 'move' | 'adopt' | null;
  source_root?: string | null;
  target_root?: string | null;
  current_item?: string | null;
  copied_bytes: number;
  total_bytes: number;
  progress: number;
  warnings: string[];
  conflicts: string[];
  cleanup_required: boolean;
  cleanup_paths: string[];
  error_code?: string | null;
  error?: string | null;
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

export interface LLMProviderPreset {
  id: 'minimax' | 'kimi' | 'deepseek' | 'qwen' | 'glm' | 'ollama' | 'custom';
  name: string;
  base_url: string;
  requires_api_key: boolean;
  local_default: boolean;
}

export interface LLMCompatibility {
  protocol: 'auto' | 'openai' | 'deepseek' | 'ollama' | 'qwen' | 'glm';
  thinking: 'auto' | 'default' | 'disabled';
  output_format: 'auto' | 'json_schema' | 'json_object' | 'prompt';
  transport: 'json' | 'sse';
}

export interface LLMCapabilityTestResult {
  ok: boolean;
  message: string;
  provider_updated_at: string;
  requests_made: number;
  translation: { ok: boolean; error_code: string | null };
  proofreading: { ok: boolean; error_code: string | null };
  recommended: LLMCompatibility | null;
}

export interface LLMProvider {
  compatibility: LLMCompatibility;
  id: string;
  name: string;
  preset: LLMProviderPreset['id'];
  base_url: string;
  api_key_masked?: string | null;
  default_model?: string | null;
  enabled: boolean;
  is_local: boolean;
  created_at: string;
  updated_at: string;
}

export interface LLMProviderTestResult {
  ok: boolean;
  message: string;
  error_code?: string | null;
}

export interface LLMProviderModelsResult {
  ok: boolean;
  items: string[];
  message: string;
  error_code?: string | null;
}

export type ChatMessageRole = 'user' | 'assistant';
export type ChatMessageStatus = 'complete' | 'partial' | 'error';

export interface ChatMessage {
  id: number;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  status: ChatMessageStatus;
  created_at: string;
}

export interface ChatSessionSummary {
  id: string;
  task_id?: string | null;
  provider_id?: string | null;
  title: string;
  created_at: string;
  updated_at: string;
}

export interface ChatSession extends ChatSessionSummary {
  messages: ChatMessage[];
}

export interface ChatSessionListResponse {
  items: ChatSessionSummary[];
}

export type TranslationLanguage =
  | { kind: 'auto'; code?: null; name?: null }
  | { kind: 'preset'; code: string; name?: null }
  | { kind: 'custom'; name: string; code?: null };

export interface TranslationInput {
  provider_id: string;
  source_version_id: number;
  source_language: TranslationLanguage;
  target_language: TranslationLanguage;
}

export interface TranslationRun {
  id: string;
  task_id: string;
  source_version_id: number;
  source_language: TranslationLanguage;
  target_language: TranslationLanguage;
  source_is_current: boolean;
  llm_provider_id: string | null;
  provider_name: string;
  provider_preset: string;
  model_name: string;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled' | 'interrupted';
  attempt: number;
  total_batches: number;
  completed_batches: number;
  total_segments: number;
  completed_segments: number;
  latest_translation_version_id: number | null;
  can_retry: boolean;
  can_edit: boolean;
  can_export: boolean;
  error_code: string | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  completed_at: string | null;
}

export interface TranslationVersionSummary {
  id: number;
  run_id: string;
  revision: number;
  version_type: 'translate' | 'edit';
  parent_version_id: number | null;
  created_at: string;
}

export interface TranslationVersion extends TranslationVersionSummary {
  source_version_id: number;
  source_language: TranslationLanguage;
  target_language: TranslationLanguage;
  segments: Array<{ id: number; start: number; end: number; speaker: string | null; source_text: string; text: string }>;
}

export type TranslationExportMode = 'translated' | 'bilingual';
export type TranslationExportOrder = 'source-first' | 'target-first';
export type TranslationExportFormat = 'txt' | 'srt' | 'vtt' | 'ass' | 'json' | 'md';

export type ProofreadingRunStatus = 'queued' | 'running' | 'completed' | 'failed' | 'interrupted' | 'applied';

export interface ProofreadingSuggestion {
  id: number;
  segment_id: number;
  original_text: string;
  suggested_text: string;
  reason: string;
  resolution: 'pending' | 'applied' | 'skipped';
}

export interface ProofreadingRun {
  id: string;
  task_id: string;
  source_version_id: number;
  llm_provider_id?: string | null;
  provider_name: string;
  provider_preset: string;
  model_name: string;
  status: ProofreadingRunStatus;
  total_batches: number;
  completed_batches: number;
  error_code?: string | null;
  error?: string | null;
  stale: boolean;
  suggestions: ProofreadingSuggestion[];
  created_at: string;
  updated_at: string;
  completed_at?: string | null;
  applied_at?: string | null;
}

export interface ProofreadingApplyResult {
  run: ProofreadingRun;
  version: {
    id: number;
    task_id: string;
    version_type: string;
    text?: string | null;
    segments: TranscriptSegment[];
    created_at: string;
  };
}

export interface MediaStorageLocation {
  path: string;
  status: 'available' | 'read_only' | 'unavailable';
  reason?: string | null;
  available: boolean;
  writable: boolean;
}

export interface MediaStorageSettings {
  ingest_mode: 'reference' | 'copy';
  uploads_dir: string;
  derived_audio_dir: string;
  delete_derived_on_complete: boolean;
  uploads_dir_locked: boolean;
  derived_audio_dir_locked: boolean;
  uploads: MediaStorageLocation;
  derived_audio: MediaStorageLocation;
  runtime: 'desktop' | 'container';
}

export type MediaStorageSettingsUpdate = Partial<
  Pick<MediaStorageSettings, 'ingest_mode' | 'uploads_dir' | 'derived_audio_dir' | 'delete_derived_on_complete'>
>;

export type CudaAccelerationStatus = 'not_downloaded' | 'downloading' | 'ready' | 'enabled' | 'enable_failed' | 'invalidated';

export type CudaAccelerationReasonCode =
  | 'unsupported_platform'
  | 'kit_version_mismatch'
  | 'probe_failed'
  | 'kit_not_injected'
  | 'cuda_device_missing';

export interface CudaKitInfo {
  kit_version: string;
  torch_version: string;
  total_bytes: number;
}

export interface CudaProbeInfo {
  state: 'pending' | 'ok' | 'failed';
  torch_cuda_available: boolean;
  cuda_device_name: string | null;
  torch_file: string | null;
}

export interface CudaKitDownloadJob {
  id: string | null;
  status: 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';
  phase: string;
  current_part: string | null;
  parts_total: number;
  downloaded_bytes: number;
  total_bytes: number;
  error: string | null;
}

export interface CudaAccelerationSettings {
  enabled: boolean;
  status: CudaAccelerationStatus;
  reason: string | null;
  reason_code: CudaAccelerationReasonCode | null;
  supported: boolean;
  gpu_detected: boolean | null;
  kit: CudaKitInfo | null;
  probe: CudaProbeInfo;
  job: CudaKitDownloadJob | null;
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
  moss_transcribe_diarize_available: boolean;
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
  gpu_available?: boolean;
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
  version_type?: string;
  label?: string | null;
  text?: string | null;
  segments?: TranscriptSegment[];
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

  private async resourceRequest(path: string, init?: RequestInit): Promise<Response> {
    const headers = new Headers(init?.headers);
    const apiToken = useServerStore.getState().apiToken;
    if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
    const response = await fetch(`${this.baseUrl()}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) throw await parseError(response);
    return response;
  }

  private async formRequest<T>(path: string, form: FormData, onUploadProgress?: (progress: number) => void): Promise<T> {
    const headers = new Headers();
    const apiToken = useServerStore.getState().apiToken;
    if (apiToken) headers.set('Authorization', `Bearer ${apiToken}`);
    if (onUploadProgress) {
      return new Promise<T>((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open('POST', `${this.baseUrl()}${path}`);
        if (apiToken) request.setRequestHeader('Authorization', `Bearer ${apiToken}`);
        request.upload.addEventListener('progress', (event) => {
          if (event.lengthComputable && event.total > 0) onUploadProgress(Math.round((event.loaded / event.total) * 100));
        });
        request.addEventListener('load', () => {
          if (request.status < 200 || request.status >= 300) {
            try {
              const body = JSON.parse(request.responseText) as { detail?: unknown; message?: unknown; error?: unknown };
              const detail = body.detail ?? body.message ?? body.error ?? `HTTP ${request.status}`;
              reject(new Error(typeof detail === 'string' ? detail : JSON.stringify(detail)));
            } catch {
              reject(new Error(`HTTP ${request.status}`));
            }
            return;
          }
          try {
            resolve(JSON.parse(request.responseText) as T);
          } catch {
            reject(new Error('Backend returned an invalid JSON response'));
          }
        });
        request.addEventListener('error', () => reject(new Error('Media upload failed')));
        request.send(form);
      });
    }
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

  async preflightTranscription(file: File, onUploadProgress?: (progress: number) => void) {
    const form = new FormData();
    form.append('file', file);
    return this.formRequest<TranscriptionPreflight>('/transcriptions/preflight', form, onUploadProgress);
  }

  preflightPath(path: string) {
    return this.request<TranscriptionPreflight>('/transcriptions/preflight/path', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
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
    onUploadProgress?: (progress: number) => void;
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
    return this.formRequest<TranscriptionTask>('/transcriptions', form, input.onUploadProgress);
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
    onUploadProgress?: (progress: number) => void;
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
    return this.formRequest<BatchTranscriptionResponse>('/transcriptions/batch', form, input.onUploadProgress);
  }

  createPathTranscriptions(input: PathTranscriptionInput) {
    return this.request<BatchTranscriptionResponse>('/transcriptions/path', {
      method: 'POST',
      body: JSON.stringify({
        paths: input.paths,
        backend: input.backend,
        model_name: input.modelName,
        provider_id: input.providerId,
        language: input.language,
        output_formats: input.outputFormats,
        postprocess_mode: input.postprocessMode,
        traditional_to_simplified: input.traditionalToSimplified,
      }),
    });
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

  updateSegments(id: string, segments: SegmentBulkUpdateItem[]) {
    return this.request<TranscriptionTask>(`/tasks/${id}/segments`, {
      method: 'PUT',
      body: JSON.stringify({ segments }),
    });
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

  relinkTask(id: string, path: string) {
    return this.request<TranscriptionTask>(`/tasks/${id}/relink`, {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
  }

  deleteTask(id: string) {
    return this.request<{ message: string }>(`/tasks/${id}`, { method: 'DELETE' });
  }

  clearTasks() {
    return this.request<{ deleted: number }>('/tasks', { method: 'DELETE' });
  }

  exportTask(id: string, format: string) {
    return this.resourceRequest(`/tasks/${id}/export/${format}`);
  }

  async taskAudioUrl(id: string) {
    const path = `/tasks/${id}/audio`;
    const url = new URL(`${this.baseUrl()}${path}`);
    if (!useServerStore.getState().apiToken) return url.toString();
    const grant = await this.request<ResourceTicketResponse>('/auth/resource-ticket', {
      method: 'POST',
      body: JSON.stringify({ path }),
    });
    url.searchParams.set('resource_ticket', grant.ticket);
    return url.toString();
  }

  eventsUrl() {
    return new URL(`${this.baseUrl()}/events`).toString();
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

  planModelStorage(request: ModelRelocationRequest) {
    return this.request<ModelStorageCandidate>('/models/storage/plan', { method: 'POST', body: JSON.stringify(request) });
  }

  startModelStorageRelocation(request: ModelRelocationRequest) {
    return this.request<ModelRelocationJob>('/models/storage/relocation', { method: 'POST', body: JSON.stringify(request) });
  }

  getModelStorageRelocation() {
    return this.request<ModelRelocationJob>('/models/storage/relocation');
  }

  cancelModelStorageRelocation() {
    return this.request<ModelRelocationJob>('/models/storage/relocation/cancel', { method: 'POST' });
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

  pauseModelDownload(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/pause-download`, { method: 'POST' });
  }

  resumeModelDownload(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/resume-download`, { method: 'POST' });
  }

  stopModelDownload(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/stop-download`, { method: 'POST' });
  }

  retryModelDownload(modelName: string) {
    return this.request<{ message: string }>(`/models/${modelName}/retry-download`, { method: 'POST' });
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

  listLLMProviderPresets() {
    return this.request<{ items: LLMProviderPreset[] }>('/llm-providers/presets');
  }

  listLLMProviders() {
    return this.request<{ items: LLMProvider[] }>('/llm-providers');
  }

  createLLMProvider(data: Record<string, unknown>) {
    return this.request<LLMProvider>('/llm-providers', { method: 'POST', body: JSON.stringify(data) });
  }

  updateLLMProvider(id: string, data: Record<string, unknown>) {
    return this.request<LLMProvider>(`/llm-providers/${id}`, { method: 'PUT', body: JSON.stringify(data) });
  }

  deleteLLMProvider(id: string) {
    return this.request<{ message: string }>(`/llm-providers/${id}`, { method: 'DELETE' });
  }

  testLLMCapabilities(id: string) {
    return this.request<LLMCapabilityTestResult>(`/llm-providers/${id}/test-capabilities`, { method: 'POST' });
  }

  testLLMProvider(id: string) {
    return this.request<LLMProviderTestResult>(`/llm-providers/${id}/test`, { method: 'POST' });
  }

  fetchLLMProviderModels(data: { preset: string; base_url: string; api_key?: string; provider_id?: string }) {
    return this.request<LLMProviderModelsResult>('/llm-providers/models', { method: 'POST', body: JSON.stringify(data) });
  }

  createChatSession(input: { task_id?: string | null; provider_id?: string | null; title?: string }) {
    return this.request<ChatSession>('/chat/sessions', { method: 'POST', body: JSON.stringify(input) });
  }

  listChatSessions() {
    return this.request<ChatSessionListResponse>('/chat/sessions');
  }

  getChatSession(id: string) {
    return this.request<ChatSession>(`/chat/sessions/${encodeURIComponent(id)}`);
  }

  updateChatSession(id: string, patch: { task_id?: string | null; provider_id?: string | null }) {
    return this.request<ChatSession>(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(patch) });
  }

  deleteChatSession(id: string) {
    return this.request<{ message: string }>(`/chat/sessions/${encodeURIComponent(id)}`, { method: 'DELETE' });
  }

  streamChatMessage(
    sessionId: string,
    content: string,
    options: { signal: AbortSignal; onDelta?: (content: string) => void },
  ) {
    return consumeChatSseResponse<ChatMessage>({
      url: `${this.baseUrl()}/chat/sessions/${encodeURIComponent(sessionId)}/messages`,
      apiToken: useServerStore.getState().apiToken,
      content,
      signal: options.signal,
      onDelta: options.onDelta,
    });
  }

  listTranslationRuns(taskId: string) {
    return this.request<{ items: TranslationRun[] }>(`/tasks/${encodeURIComponent(taskId)}/translation-runs`);
  }

  getTranslationRun(taskId: string, runId: string) {
    return this.request<TranslationRun>(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}`);
  }

  createTranslationRun(taskId: string, input: TranslationInput) {
    return this.request<TranslationRun>(`/tasks/${encodeURIComponent(taskId)}/translation-runs`, { method: 'POST', body: JSON.stringify(input) });
  }

  translationAction(taskId: string, runId: string, action: 'cancel' | 'retry') {
    return this.request<TranslationRun>(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}/${action}`, { method: 'POST' });
  }

  listTranslationVersions(taskId: string, runId: string) {
    return this.request<{ items: TranslationVersionSummary[] }>(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}/versions`);
  }

  getTranslationVersion(taskId: string, runId: string, versionId: number) {
    return this.request<TranslationVersion>(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}/versions/${versionId}`);
  }

  editTranslationVersion(taskId: string, runId: string, baseVersionId: number, segments: Array<{ id: number; text: string }>) {
    return this.request<TranslationVersion>(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}/versions`, {
      method: 'POST', body: JSON.stringify({ base_version_id: baseVersionId, segments }),
    });
  }

  exportTranslation(taskId: string, runId: string, versionId: number, format: TranslationExportFormat, mode: TranslationExportMode, order: TranslationExportOrder) {
    return this.resourceRequest(`/tasks/${encodeURIComponent(taskId)}/translation-runs/${encodeURIComponent(runId)}/versions/${versionId}/export/${format}?mode=${mode}&order=${order}`);
  }

  listProofreadingRuns(taskId: string) {
    return this.request<{ items: ProofreadingRun[] }>(`/tasks/${taskId}/proofreading-runs`);
  }

  getProofreadingRun(taskId: string, runId: string) {
    return this.request<ProofreadingRun>(`/tasks/${taskId}/proofreading-runs/${runId}`);
  }

  createProofreadingRun(taskId: string, providerId: string) {
    return this.request<ProofreadingRun>(`/tasks/${taskId}/proofreading-runs`, {
      method: 'POST',
      body: JSON.stringify({ provider_id: providerId }),
    });
  }

  applyProofreadingRun(taskId: string, runId: string, suggestionIds: number[]) {
    return this.request<ProofreadingApplyResult>(`/tasks/${taskId}/proofreading-runs/${runId}/apply`, {
      method: 'POST',
      body: JSON.stringify({ suggestion_ids: suggestionIds }),
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

  getMediaStorageSettings() {
    return this.request<MediaStorageSettings>('/settings/media-storage');
  }

  updateMediaStorageSettings(data: MediaStorageSettingsUpdate) {
    return this.request<MediaStorageSettings>('/settings/media-storage', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  getCudaAcceleration() {
    return this.request<CudaAccelerationSettings>('/settings/cuda-acceleration');
  }

  updateCudaAcceleration(data: { enabled: boolean }) {
    return this.request<CudaAccelerationSettings>('/settings/cuda-acceleration', {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  redetectCudaAcceleration() {
    return this.request<CudaAccelerationSettings>('/settings/cuda-acceleration/redetect', { method: 'POST' });
  }

  startCudaKitDownload() {
    return this.request<CudaKitDownloadJob>('/settings/cuda-acceleration/download', { method: 'POST' });
  }

  getCudaKitDownload() {
    return this.request<CudaKitDownloadJob>('/settings/cuda-acceleration/download');
  }

  cancelCudaKitDownload() {
    return this.request<CudaKitDownloadJob>('/settings/cuda-acceleration/download/cancel', { method: 'POST' });
  }

  deleteCudaKit() {
    return this.request<CudaAccelerationSettings>('/settings/cuda-acceleration/kit', { method: 'DELETE' });
  }

  getRuntimeStatus() {
    return this.request<RuntimeStatus>('/runtime/status');
  }

  runtimeDiagnosticBundle() {
    return this.resourceRequest('/runtime/diagnostic-bundle.zip');
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
