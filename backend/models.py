from __future__ import annotations

from datetime import datetime
from typing import Any, Literal
import unicodedata

from pydantic import BaseModel, ConfigDict, Field, FiniteFloat, model_validator

from backend.translation_languages import LANGUAGE_NAMES

TaskStatus = Literal[
    "created",
    "queued",
    "importing",
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

TaskSourceKind = Literal["managed", "external"]
MediaIngestMode = Literal["reference", "copy"]


class DirectoryCheck(BaseModel):
    label: str
    path: str
    exists: bool
    writable: bool
    error: str | None = None


class ResourceTicketRequest(BaseModel):
    path: str = Field(..., pattern=r"^/tasks/[^/?#]+/audio$")


class ResourceTicketResponse(BaseModel):
    ticket: str
    path: str
    expires_at: datetime


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
    supported_devices: list[Literal["cpu", "cuda", "mps", "mlx"]]
    supports_timestamps: bool
    supports_word_timestamps: bool
    supports_diarization: bool
    supports_streaming: bool
    downloaded: bool | None
    downloading: bool
    loaded: bool
    error: str | None = None
    size_on_disk_mb: float | None = None
    download_error: str | None = None
    compatible: bool | None = None
    compatibility_error: str | None = None
    compatibility_error_code: str | None = None
    cache_detected: bool = False
    cache_size_mb: float | None = None
    cache_path: str | None = None
    preferred_source: str | None = None
    source_candidates: list[dict[str, Any]] = Field(default_factory=list)
    installed_source: str | None = None
    installed_repo_id: str | None = None
    last_verified_at: str | None = None
    storage_status: Literal["available", "read_only", "unavailable", "migrating"] = "available"
    storage_error: str | None = None


class ModelStatusListResponse(BaseModel):
    models: list[ASRModelStatus]


class ModelDownloadRequest(BaseModel):
    model_name: str


class ModelMigrateRequest(BaseModel):
    source: str | None = None
    destination: str | None = None


ModelStorageStatus = Literal["available", "read_only", "unavailable", "migrating"]
ModelRelocationMode = Literal["move", "adopt"]


class ModelCacheUsage(BaseModel):
    name: str
    path: str
    size_bytes: int
    shared: bool = False
    selected: bool = True
    warning: str | None = None


class ModelStorageCandidateRequest(BaseModel):
    target_root: str
    mode: ModelRelocationMode
    include_shared_caches: bool = False
    acknowledge_network: bool = False


class ModelStorageCandidateResponse(BaseModel):
    target_root: str
    mode: ModelRelocationMode
    valid: bool
    writable: bool
    errors: list[str] = Field(default_factory=list)
    warnings: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    blockers: list[str] = Field(default_factory=list)
    valid_models: list[str] = Field(default_factory=list)
    incomplete_models: list[str] = Field(default_factory=list)
    caches: list[ModelCacheUsage] = Field(default_factory=list)
    required_bytes: int = 0
    required_headroom_bytes: int = 0
    free_bytes: int | None = None
    network_filesystem: bool = False


class ModelRelocationStartRequest(ModelStorageCandidateRequest):
    pass


class ModelRelocationJobResponse(BaseModel):
    id: str | None = None
    status: Literal["idle", "running", "cancelling", "cancelled", "complete", "failed"] = "idle"
    phase: str = "idle"
    mode: ModelRelocationMode | None = None
    source_root: str | None = None
    target_root: str | None = None
    current_item: str | None = None
    copied_bytes: int = 0
    total_bytes: int = 0
    progress: float = 0
    warnings: list[str] = Field(default_factory=list)
    conflicts: list[str] = Field(default_factory=list)
    cleanup_required: bool = False
    cleanup_paths: list[str] = Field(default_factory=list)
    error_code: str | None = None
    error: str | None = None


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


class LLMCompatibility(BaseModel):
    model_config = ConfigDict(extra="forbid")
    protocol: Literal["auto", "openai", "deepseek", "ollama", "qwen", "glm"] = "auto"
    thinking: Literal["auto", "default", "disabled"] = "auto"
    output_format: Literal["auto", "json_schema", "json_object", "prompt"] = "auto"
    transport: Literal["json", "sse"] = "json"


class LLMCapabilityCheck(BaseModel):
    ok: bool = False
    error_code: str | None = None


class LLMCapabilityTestResponse(BaseModel):
    ok: bool
    message: str
    provider_updated_at: datetime
    requests_made: int
    translation: LLMCapabilityCheck
    proofreading: LLMCapabilityCheck
    recommended: LLMCompatibility | None = None


class LLMProviderCreate(BaseModel):
    compatibility: LLMCompatibility = Field(default_factory=LLMCompatibility)
    name: str = Field(..., min_length=1, max_length=120)
    preset: str = Field(..., min_length=1, max_length=40)
    base_url: str
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool = True


class LLMProviderUpdate(BaseModel):
    compatibility: LLMCompatibility | None = None
    expected_updated_at: datetime | None = None
    name: str | None = Field(None, min_length=1, max_length=120)
    preset: str | None = Field(None, min_length=1, max_length=40)
    base_url: str | None = None
    api_key: str | None = None
    default_model: str | None = None
    enabled: bool | None = None


class LLMProviderResponse(BaseModel):
    compatibility: LLMCompatibility = Field(default_factory=LLMCompatibility)
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


class LLMProviderModelsRequest(BaseModel):
    preset: str = Field(..., min_length=1, max_length=40)
    base_url: str
    api_key: str | None = None
    provider_id: str | None = None


class LLMProviderModelsResponse(BaseModel):
    ok: bool
    items: list[str] = Field(default_factory=list)
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


class MediaStorageLocation(BaseModel):
    path: str
    status: str
    reason: str | None = None
    available: bool
    writable: bool


class MediaStorageSettingsResponse(BaseModel):
    ingest_mode: MediaIngestMode
    uploads_dir: str
    derived_audio_dir: str
    delete_derived_on_complete: bool
    uploads_dir_locked: bool
    derived_audio_dir_locked: bool
    uploads: MediaStorageLocation
    derived_audio: MediaStorageLocation
    runtime: Literal["desktop", "container"] = "desktop"


class MediaStorageSettingsUpdate(BaseModel):
    ingest_mode: MediaIngestMode | None = None
    uploads_dir: str | None = None
    derived_audio_dir: str | None = None
    delete_derived_on_complete: bool | None = None


CudaAccelerationStatus = Literal["not_downloaded", "downloading", "ready", "enabled", "enable_failed", "invalidated"]


class CudaKitInfo(BaseModel):
    kit_version: str
    torch_version: str
    total_bytes: int


class CudaKitProbeStatus(BaseModel):
    state: Literal["pending", "ok", "failed"] = "pending"
    torch_cuda_available: bool = False
    cuda_device_name: str | None = None
    torch_file: str | None = None


class CudaKitJobResponse(BaseModel):
    id: str | None = None
    status: Literal["idle", "running", "completed", "failed", "cancelled"] = "idle"
    phase: str = "idle"
    current_part: str | None = None
    parts_total: int = 0
    downloaded_bytes: int = 0
    total_bytes: int = 0
    error: str | None = None


CudaAccelerationReasonCode = Literal[
    "unsupported_platform",
    "kit_version_mismatch",
    "probe_failed",
    "kit_not_injected",
    "cuda_device_missing",
]


class CudaAccelerationStatusResponse(BaseModel):
    enabled: bool
    status: CudaAccelerationStatus
    reason: str | None = None
    reason_code: CudaAccelerationReasonCode | None = None
    supported: bool
    gpu_detected: bool | None = None
    kit: CudaKitInfo | None = None
    probe: CudaKitProbeStatus
    job: CudaKitJobResponse | None = None


class CudaAccelerationUpdate(BaseModel):
    enabled: bool


class TaskRelinkRequest(BaseModel):
    path: str = Field(min_length=1)


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
    source_kind: TaskSourceKind = "managed"
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
    mlx_import_error: str | None = None
    mlx_whisper_import_error: str | None = None
    qwen3_asr_available: bool = False
    transformers_qwen3_asr_available: bool = False
    moss_transcribe_diarize_available: bool = False
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
    downloaded: bool | None


class ModelStorageResponse(BaseModel):
    root: str
    models_dir: str
    models: list[ModelStorageItem]
    status: ModelStorageStatus = "available"
    reason: str | None = None
    detail: str | None = None
    available: bool = True
    writable: bool = True
    cache_dirs: dict[str, str] = Field(default_factory=dict)
    cache_usage: list[ModelCacheUsage] = Field(default_factory=list)
    cache_bytes: int = 0
    allowed_roots: list[str] = Field(default_factory=list)
    root_locked: bool = False
    runtime: Literal["desktop", "container"] = "desktop"
    network_filesystem: bool = False
    filesystem_type: str | None = None
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
    code: str | None = None


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


class DesktopPathPreflightRequest(BaseModel):
    path: str


class DesktopPathTranscriptionRequest(BaseModel):
    paths: list[str] = Field(min_length=1, max_length=32)
    backend: str = "local"
    model_name: str | None = None
    provider_id: str | None = None
    language: str | None = None
    output_formats: list[str] = Field(default_factory=lambda: ["txt", "srt"])
    postprocess_mode: str | None = None
    traditional_to_simplified: bool | None = None


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


class TranslationLanguage(BaseModel):
    model_config = ConfigDict(extra="forbid")
    kind: Literal["auto", "preset", "custom"]
    code: str | None = None
    name: str | None = None

    @model_validator(mode="after")
    def validate_choice(self):
        if self.kind == "auto":
            if self.code is not None or self.name is not None:
                raise ValueError("Automatic language cannot include a code or name")
        elif self.kind == "preset":
            if self.code not in LANGUAGE_NAMES or self.name is not None:
                raise ValueError("Invalid translation language preset")
        else:
            if self.code is not None or self.name is None:
                raise ValueError("Custom language requires a name only")
            if any(unicodedata.category(c).startswith("C") for c in self.name):
                raise ValueError("Language names cannot contain control characters")
            self.name = self.name.strip()
            if not 1 <= len(self.name) <= 80:
                raise ValueError("Language name must contain 1 to 80 characters")
        return self


class TranslationCreateRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    provider_id: str = Field(min_length=1)
    source_version_id: int = Field(gt=0)
    source_language: TranslationLanguage
    target_language: TranslationLanguage

    @model_validator(mode="after")
    def validate_pair(self):
        if self.target_language.kind == "auto":
            raise ValueError("Choose a target language")
        source, target = self.source_language, self.target_language
        if source.kind == target.kind and (
            source.kind == "preset" and source.code == target.code
            or source.kind == "custom" and unicodedata.normalize("NFKC", source.name).casefold() == unicodedata.normalize("NFKC", target.name).casefold()
        ):
            raise ValueError("Source and target languages must differ")
        return self


class TranslationTextUpdate(BaseModel):
    model_config = ConfigDict(extra="forbid", strict=True)
    id: int
    text: str = Field(min_length=1, max_length=100_000)


class TranslationEditRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")
    base_version_id: int = Field(gt=0)
    segments: list[TranslationTextUpdate] = Field(min_length=1)


class TranslationRunResponse(BaseModel):
    id: str
    task_id: str
    source_version_id: int
    source_language: TranslationLanguage
    target_language: TranslationLanguage
    source_is_current: bool
    llm_provider_id: str | None
    provider_name: str
    provider_preset: str
    model_name: str
    status: Literal["queued", "running", "completed", "failed", "cancelled", "interrupted"]
    attempt: int
    total_batches: int
    completed_batches: int
    total_segments: int
    completed_segments: int
    latest_translation_version_id: int | None
    can_retry: bool
    can_edit: bool
    can_export: bool
    error_code: str | None
    error: str | None
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None


class TranslationRunListResponse(BaseModel):
    items: list[TranslationRunResponse]


class TranslationVersionSummary(BaseModel):
    id: int
    run_id: str
    revision: int
    version_type: Literal["translate", "edit"]
    parent_version_id: int | None
    created_at: datetime


class TranslationVersionListResponse(BaseModel):
    items: list[TranslationVersionSummary]


class TranslationSegmentResponse(BaseModel):
    id: int
    start: float
    end: float
    speaker: str | None = None
    source_text: str
    text: str


class TranslationVersionResponse(TranslationVersionSummary):
    source_version_id: int
    source_language: TranslationLanguage
    target_language: TranslationLanguage
    segments: list[TranslationSegmentResponse]


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
    start: FiniteFloat | None = Field(None, ge=0)
    end: FiniteFloat | None = Field(None, ge=0)
    text: str | None = None
    speaker: str | None = None
    confidence: FiniteFloat | None = None


class SegmentCreateRequest(BaseModel):
    start: FiniteFloat = Field(..., ge=0)
    end: FiniteFloat = Field(..., ge=0)
    text: str
    speaker: str | None = None
    confidence: FiniteFloat | None = None


class SegmentSplitRequest(BaseModel):
    split_at: FiniteFloat = Field(..., ge=0)
    left_text: str | None = None
    right_text: str | None = None


class SegmentMergeRequest(BaseModel):
    segment_ids: list[int] = Field(..., min_length=2)


class SegmentBulkItem(BaseModel):
    id: int
    start: FiniteFloat = Field(..., ge=0)
    end: FiniteFloat = Field(..., ge=0)
    text: str
    speaker: str | None = None


class SegmentsBulkUpdateRequest(BaseModel):
    segments: list[SegmentBulkItem] = Field(..., min_length=1)


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


class ChatSessionCreate(BaseModel):
    task_id: str | None = None
    provider_id: str | None = None
    title: str = Field("", max_length=120)


class ChatSessionUpdate(BaseModel):
    task_id: str | None = None
    provider_id: str | None = None


class ChatMessageRequest(BaseModel):
    content: str = Field(..., min_length=1, max_length=20000)


class ChatMessageResponse(BaseModel):
    id: int
    session_id: str
    role: Literal["user", "assistant"]
    content: str
    status: Literal["complete", "partial", "error"]
    created_at: datetime


class ChatSessionSummaryResponse(BaseModel):
    id: str
    task_id: str | None = None
    provider_id: str | None = None
    title: str
    created_at: datetime
    updated_at: datetime


class ChatSessionResponse(ChatSessionSummaryResponse):
    messages: list[ChatMessageResponse] = Field(default_factory=list)


class ChatSessionListResponse(BaseModel):
    items: list[ChatSessionSummaryResponse]
