from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field

TaskStatus = Literal[
    "created",
    "queued",
    "preprocessing",
    "waiting_model",
    "downloading_model",
    "transcribing",
    "postprocessing",
    "exporting",
    "completed",
    "failed",
    "failed_resumable",
    "cancelled",
    "interrupted",
]


class DirectoryCheck(BaseModel):
    label: str
    path: str
    exists: bool
    writable: bool
    error: str | None = None


class FilesystemHealthResponse(BaseModel):
    healthy: bool
    disk_free_mb: float | None = None
    disk_total_mb: float | None = None
    directories: list[DirectoryCheck]


class HealthResponse(BaseModel):
    status: str
    version: str
    port: int
    backend_type: str
    gpu_available: bool
    active_tasks: int
    data_dir: str
    models_dir: str


class ASRModelStatus(BaseModel):
    model_name: str
    display_name: str
    engine: str
    source: str
    repo_id: str | None = None
    model_size: str
    size_mb: int
    languages: list[str]
    runtime: str
    supports_timestamps: bool
    supports_word_timestamps: bool
    supports_diarization: bool
    supports_streaming: bool
    downloaded: bool
    downloading: bool
    loaded: bool
    error: str | None = None
    size_on_disk_mb: float | None = None
    download_error: str | None = None
    compatible: bool | None = None
    compatibility_error: str | None = None
    cache_detected: bool = False
    cache_size_mb: float | None = None
    cache_path: str | None = None
    preferred_source: str | None = None
    source_candidates: list[dict[str, Any]] = Field(default_factory=list)
    installed_source: str | None = None
    installed_repo_id: str | None = None
    last_verified_at: str | None = None


class ModelStatusListResponse(BaseModel):
    models: list[ASRModelStatus]


class ModelDownloadRequest(BaseModel):
    model_name: str


class ModelMigrateRequest(BaseModel):
    source: str | None = None
    destination: str | None = None


class TranscriptSegment(BaseModel):
    id: int
    start: float
    end: float
    text: str
    speaker: str | None = None
    confidence: float | None = None


class TranscriptionResult(BaseModel):
    text: str
    language: str | None = None
    duration: float | None = None
    segments: list[TranscriptSegment] = Field(default_factory=list)
    words: list[dict[str, Any]] = Field(default_factory=list)
    model_name: str | None = None
    provider_id: str | None = None
    raw_result_summary: dict[str, Any] | None = None


class ProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    provider_type: str = Field(..., min_length=1, max_length=40)
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool = True
    options: dict[str, Any] = Field(default_factory=dict)


class ProviderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    provider_type: str | None = Field(None, min_length=1, max_length=40)
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool | None = None
    options: dict[str, Any] | None = None


class ProviderResponse(BaseModel):
    id: str
    name: str
    provider_type: str
    base_url: str | None = None
    api_key_masked: str | None = None
    default_model: str | None = None
    enabled: bool
    options: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime
    updated_at: datetime


class ProviderListResponse(BaseModel):
    items: list[ProviderResponse]


class ProviderHealth(BaseModel):
    ok: bool
    provider_type: str
    message: str
    models: list[str] = Field(default_factory=list)


class LLMProviderPresetResponse(BaseModel):
    id: str
    name: str
    base_url: str
    requires_api_key: bool
    local_default: bool = False


class LLMProviderPresetListResponse(BaseModel):
    items: list[LLMProviderPresetResponse]


class LLMProviderCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=120)
    preset: str = Field(..., min_length=1, max_length=40)
    base_url: str
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool = True


class LLMProviderUpdate(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=120)
    preset: str | None = Field(None, min_length=1, max_length=40)
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool | None = None


class LLMProviderResponse(BaseModel):
    id: str
    name: str
    preset: str
    base_url: str
    api_key_masked: str | None = None
    default_model: str | None = None
    enabled: bool
    is_local: bool
    created_at: datetime
    updated_at: datetime


class LLMProviderListResponse(BaseModel):
    items: list[LLMProviderResponse]


class LLMProviderTestResponse(BaseModel):
    ok: bool
    message: str
    error_code: str | None = None


class ASRSettingsResponse(BaseModel):
    id: int = 1
    default_backend: str
    default_model_name: str | None = None
    default_provider_id: str | None = None
    default_language: str
    timestamps: bool
    word_timestamps: bool
    diarization: bool
    vad: bool
    output_formats: list[str]
    max_concurrent_local_tasks: int
    max_concurrent_provider_tasks: int
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None
    updated_at: datetime | None = None


class ASRSettingsUpdate(BaseModel):
    default_backend: str | None = None
    default_model_name: str | None = None
    default_provider_id: str | None = None
    default_language: str | None = None
    timestamps: bool | None = None
    word_timestamps: bool | None = None
    diarization: bool | None = None
    vad: bool | None = None
    output_formats: list[str] | None = None
    max_concurrent_local_tasks: int | None = Field(None, ge=1, le=4)
    max_concurrent_provider_tasks: int | None = Field(None, ge=1, le=8)
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None


class TaskRetranscribeRequest(BaseModel):
    backend: str | None = None
    model_name: str | None = None
    provider_id: str | None = None
    language: str | None = None
    output_formats: list[str] | None = None


class TaskPostprocessRequest(BaseModel):
    mode: Literal["safe", "aggressive"] = "safe"
    max_chars_per_line: int = Field(42, ge=8, le=120)
    max_lines: int = Field(2, ge=1, le=4)
    min_duration_ms: int = Field(800, ge=0, le=10000)
    merge_short_segments: bool = True
    traditional_to_simplified: bool = False


class TranscriptionReadinessResponse(BaseModel):
    backend: str
    ready: bool
    message: str
    model: dict[str, Any] | None = None
    provider: dict[str, Any] | None = None
    recommended_model: dict[str, Any] | None = None
    checks: list[dict[str, Any]] = Field(default_factory=list)


class TranscriptionTaskResponse(BaseModel):
    id: str
    filename: str
    source: str
    audio_path: str
    normalized_audio_path: str | None = None
    status: TaskStatus
    progress: float
    language: str | None = None
    model_name: str | None = None
    provider_id: str | None = None
    duration_ms: int | None = None
    text: str | None = None
    error: str | None = None
    error_code: str | None = None
    options: dict[str, Any] = Field(default_factory=dict)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    batch_id: str | None = None


class TaskListResponse(BaseModel):
    items: list[TranscriptionTaskResponse]
    total: int


class BatchFailure(BaseModel):
    filename: str
    error: str


class BatchTranscriptionResponse(BaseModel):
    items: list[TranscriptionTaskResponse]
    failures: list[BatchFailure] = Field(default_factory=list)
    total: int
    batch_id: str | None = None


class RuntimeStatusResponse(BaseModel):
    python_version: str
    platform: str
    ffmpeg_available: bool
    ffprobe_available: bool
    ffmpeg_path: str | None = None
    ffprobe_path: str | None = None
    ffmpeg_source: Literal["manual", "bundled", "system", "missing"] = "missing"
    ffprobe_source: Literal["manual", "bundled", "system", "missing"] = "missing"
    ffmpeg_version: str | None = None
    ffprobe_version: str | None = None
    ffmpeg_error: str | None = None
    ffprobe_error: str | None = None
    torch_available: bool
    torch_cuda_available: bool
    torch_mps_available: bool
    cuda_device_name: str | None = None
    cuda_capability: str | None = None
    ctranslate2_available: bool
    faster_whisper_available: bool
    funasr_available: bool
    torchaudio_available: bool = False
    modelscope_available: bool
    huggingface_hub_available: bool
    pyannote_available: bool
    diarization_ready: bool
    mlx_available: bool = False
    mlx_whisper_available: bool = False
    qwen3_asr_available: bool = False
    transformers_qwen3_asr_available: bool = False
    data_dir: str
    models_dir: str
    free_disk_bytes: int | None = None
    warnings: list[str] = Field(default_factory=list)


class ActiveDownloadResponse(BaseModel):
    model_name: str
    status: str
    progress: float | None = None
    current: int | None = None
    total: int | None = None
    filename: str | None = None
    error: str | None = None
    source: str | None = None
    repo_id: str | None = None
    fallback_from: str | None = None


class ActiveTaskSummary(BaseModel):
    id: str
    filename: str
    status: str
    progress: float
    source: str
    model_name: str | None = None
    provider_id: str | None = None
    error_code: str | None = None
    batch_id: str | None = None


class ActiveChunkSummary(BaseModel):
    id: int
    task_id: str
    idx: int
    status: str
    progress: float
    error_code: str | None = None


class ActiveTasksResponse(BaseModel):
    downloads: list[ActiveDownloadResponse]
    queued_tasks: list[ActiveTaskSummary]
    running_tasks: list[ActiveTaskSummary]
    local_queue_length: int
    provider_queue_length: int
    local_worker_count: int
    provider_worker_count: int
    max_concurrent_local_tasks: int
    max_concurrent_provider_tasks: int
    recent_error: str | None = None
    running_chunks: list[ActiveChunkSummary] = Field(default_factory=list)
    failed_resumable_tasks: list[ActiveTaskSummary] = Field(default_factory=list)
    orphan_tasks: list[ActiveTaskSummary] = Field(default_factory=list)
    worker_state: dict[str, Any] = Field(default_factory=dict)
    cancelled_task_ids: list[str] = Field(default_factory=list)


class ModelStorageItem(BaseModel):
    model_name: str
    path: str
    exists: bool
    size_bytes: int
    size_on_disk_mb: float
    downloaded: bool


class ModelStorageResponse(BaseModel):
    models_dir: str
    models: list[ModelStorageItem]
    used_bytes: int
    free_bytes: int | None = None
    total_bytes: int | None = None
    total_size_mb: float
    free_disk_bytes: int | None = None


class ErrorCodeItem(BaseModel):
    code: str
    description: str


class ErrorCodeListResponse(BaseModel):
    items: list[ErrorCodeItem]


class TaskDiagnosticResponse(BaseModel):
    id: int
    task_id: str
    stage: str
    error_code: str | None = None
    message: str
    command: str | None = None
    stderr_excerpt: str | None = None
    model_name: str | None = None
    provider_id: str | None = None
    runtime_snapshot: dict[str, Any] | None = None
    audio_metadata: dict[str, Any] | None = None
    created_at: datetime


class ModelCompatibilityResponse(BaseModel):
    model_name: str
    downloaded: bool
    compatible: bool
    missing: list[str] = Field(default_factory=list)
    message: str


class TranscriptionPreflightResponse(BaseModel):
    filename: str
    supported_format: bool
    has_audio_stream: bool
    duration_ms: int | None = None
    audio_codec: str | None = None
    sample_rate: int | None = None
    channels: int | None = None
    peak_volume_db: float | None = None
    mean_volume_db: float | None = None
    near_silence: bool = False
    needs_normalization: bool
    will_chunk: bool
    chunk_count: int
    warnings: list[str] = Field(default_factory=list)
    readiness: dict[str, Any] = Field(default_factory=dict)


class TranscriptVersionResponse(BaseModel):
    id: int
    task_id: str
    version_type: str
    text: str | None = None
    segments: list[TranscriptSegment]
    options: dict[str, Any] = Field(default_factory=dict)
    model_name: str | None = None
    provider_id: str | None = None
    created_at: datetime
    summary: dict[str, Any] = Field(default_factory=dict)


class ProofreadingCreateRequest(BaseModel):
    provider_id: str = Field(..., min_length=1)


class ProofreadingApplyRequest(BaseModel):
    suggestion_ids: list[int] = Field(..., min_length=1)


class ProofreadingSuggestionResponse(BaseModel):
    id: int
    segment_id: int
    original_text: str
    suggested_text: str
    reason: str
    resolution: Literal["pending", "applied", "skipped"]


class ProofreadingRunResponse(BaseModel):
    id: str
    task_id: str
    source_version_id: int
    llm_provider_id: str | None = None
    provider_name: str
    provider_preset: str
    model_name: str
    status: Literal["queued", "running", "completed", "failed", "interrupted", "applied"]
    total_batches: int
    completed_batches: int
    error_code: str | None = None
    error: str | None = None
    stale: bool
    suggestions: list[ProofreadingSuggestionResponse] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None
    applied_at: datetime | None = None


class ProofreadingRunListResponse(BaseModel):
    items: list[ProofreadingRunResponse]


class ProofreadingApplyResponse(BaseModel):
    run: ProofreadingRunResponse
    version: TranscriptVersionResponse


class SegmentUpdateRequest(BaseModel):
    start: float | None = Field(None, ge=0)
    end: float | None = Field(None, ge=0)
    text: str | None = None
    speaker: str | None = None
    confidence: float | None = None


class SegmentCreateRequest(BaseModel):
    start: float = Field(..., ge=0)
    end: float = Field(..., ge=0)
    text: str
    speaker: str | None = None
    confidence: float | None = None


class SegmentSplitRequest(BaseModel):
    split_at: float = Field(..., ge=0)
    left_text: str | None = None
    right_text: str | None = None


class SegmentMergeRequest(BaseModel):
    segment_ids: list[int] = Field(..., min_length=2)


class ChunkResponse(BaseModel):
    id: int
    task_id: str
    idx: int
    audio_path: str
    start_ms: int
    end_ms: int
    status: str
    progress: float
    text: str | None = None
    error: str | None = None
    error_code: str | None = None


class StorageUsageResponse(BaseModel):
    uploads_mb: float
    normalized_mb: float
    chunks_mb: float
    exports_mb: float
    models_mb: float
    diagnostics_count: int
    transcript_versions_count: int
    total_mb: float
    free_disk_bytes: int | None = None


class StorageCleanupRequest(BaseModel):
    delete_normalized: bool = True
    delete_chunks: bool = True
    delete_orphans: bool = True
    delete_old_diagnostics: bool = False


class StorageCleanupResponse(BaseModel):
    removed: list[str] = Field(default_factory=list)
    errors: list[str] = Field(default_factory=list)
    freed_mb: float = 0


class ModelRecommendationRequest(BaseModel):
    language: str | None = None
    duration_ms: int | None = None
    prefer_speed: bool = False
    prefer_accuracy: bool = False
    allow_large_model: bool = False
    local_only: bool = True


class ModelRecommendationResponse(BaseModel):
    model_name: str
    display_name: str
    reason: str
    downloaded: bool
    compatible: bool
    download_required: bool


class ModelBenchmarkRequest(BaseModel):
    model_names: list[str] = Field(..., min_length=1)
    audio_path: str | None = None
    language: str | None = None


class ModelBenchmarkResponse(BaseModel):
    id: int
    model_name: str
    engine: str
    language: str | None = None
    audio_path: str
    duration_ms: int | None = None
    wall_time_ms: int | None = None
    realtime_factor: float | None = None
    peak_memory_mb: float | None = None
    text_length: int | None = None
    segment_count: int | None = None
    success: bool
    error_code: str | None = None
    error: str | None = None
    created_at: datetime


class TaskLogResponse(BaseModel):
    id: int
    task_id: str
    stage: str
    level: str
    message: str
    data: dict[str, Any] = Field(default_factory=dict)
    created_at: datetime


class TaskQualityResponse(BaseModel):
    task_id: str
    warnings: list[str] = Field(default_factory=list)
    metrics: dict[str, Any] = Field(default_factory=dict)


class BatchStatusResponse(BaseModel):
    id: str
    name: str | None = None
    total: int
    completed: int
    failed: int
    queued: int
    running: int
    retryable: int
    progress: float
    items: list[TranscriptionTaskResponse]


class ProviderTranscriptionTestResponse(BaseModel):
    ok: bool
    provider_id: str
    stage: str
    message: str
    text_preview: str | None = None
    segments_count: int = 0
    response_preview: dict[str, Any] | None = None
    error_code: str | None = None


class StorageBackupRequest(BaseModel):
    include_uploads: bool = False
    include_exports: bool = False


class StorageRestoreRequest(BaseModel):
    backup_path: str


class StorageBackupResponse(BaseModel):
    path: str
    included_uploads: bool
    included_exports: bool
    size_mb: float


class RuntimeHealthReportResponse(BaseModel):
    runtime: RuntimeStatusResponse
    filesystem: dict[str, Any]
    schema_version: str | None = None
    models: list[ASRModelStatus]
    providers: list[ProviderResponse]
    warnings: list[str] = Field(default_factory=list)


class MCPTranscribeRequest(BaseModel):
    path: str
    backend: str = "local"
    model_name: str | None = None
    provider_id: str | None = None
    language: str | None = None
    output_formats: list[str] = Field(default_factory=lambda: ["txt", "srt", "json"])
