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


class ModelStatusListResponse(BaseModel):
    models: list[ASRModelStatus]


class ModelDownloadRequest(BaseModel):
    model_name: str


class ModelMigrateRequest(BaseModel):
    destination: str


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
    options: dict[str, Any] = Field(default_factory=dict)
    segments: list[TranscriptSegment] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    completed_at: datetime | None = None


class TaskListResponse(BaseModel):
    items: list[TranscriptionTaskResponse]
    total: int

