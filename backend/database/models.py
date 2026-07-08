from __future__ import annotations

from datetime import UTC, datetime
import uuid

from sqlalchemy import Boolean, Column, DateTime, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import declarative_base

Base = declarative_base()


def utc_now() -> datetime:
    return datetime.now(UTC)


class TranscriptionTask(Base):
    __tablename__ = "transcription_tasks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    filename = Column(String, nullable=False)
    source = Column(String, nullable=False, default="upload")
    audio_path = Column(String, nullable=False)
    normalized_audio_path = Column(String, nullable=True)
    status = Column(String, nullable=False, default="created")
    progress = Column(Float, nullable=False, default=0.0)
    language = Column(String, nullable=True)
    model_name = Column(String, nullable=True)
    provider_id = Column(String, ForeignKey("asr_providers.id"), nullable=True)
    duration_ms = Column(Integer, nullable=True)
    text = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    error_code = Column(String, nullable=True)
    options_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
    completed_at = Column(DateTime, nullable=True)
    batch_id = Column(String, ForeignKey("transcription_batches.id"), nullable=True)


class TranscriptSegment(Base):
    __tablename__ = "transcript_segments"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("transcription_tasks.id"), nullable=False)
    idx = Column(Integer, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    text = Column(Text, nullable=False)
    speaker = Column(String, nullable=True)
    confidence = Column(Float, nullable=True)


class TranscriptionChunk(Base):
    __tablename__ = "transcription_chunks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("transcription_tasks.id"), nullable=False)
    idx = Column(Integer, nullable=False)
    audio_path = Column(String, nullable=False)
    start_ms = Column(Integer, nullable=False)
    end_ms = Column(Integer, nullable=False)
    status = Column(String, nullable=False, default="queued")
    progress = Column(Float, nullable=False, default=0.0)
    text = Column(Text, nullable=True)
    error = Column(Text, nullable=True)
    error_code = Column(String, nullable=True)


class TaskDiagnostic(Base):
    __tablename__ = "task_diagnostics"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("transcription_tasks.id"), nullable=False)
    stage = Column(String, nullable=False)
    error_code = Column(String, nullable=True)
    message = Column(Text, nullable=False)
    command = Column(Text, nullable=True)
    stderr_excerpt = Column(Text, nullable=True)
    model_name = Column(String, nullable=True)
    provider_id = Column(String, nullable=True)
    runtime_snapshot_json = Column(Text, nullable=True)
    audio_metadata_json = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class TaskLog(Base):
    __tablename__ = "task_logs"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("transcription_tasks.id"), nullable=False)
    stage = Column(String, nullable=False)
    level = Column(String, nullable=False, default="info")
    message = Column(Text, nullable=False)
    data_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)


class TranscriptVersion(Base):
    __tablename__ = "transcript_versions"

    id = Column(Integer, primary_key=True, autoincrement=True)
    task_id = Column(String, ForeignKey("transcription_tasks.id"), nullable=False)
    version_type = Column(String, nullable=False)
    text = Column(Text, nullable=True)
    segments_json = Column(Text, nullable=False, default="[]")
    options_json = Column(Text, nullable=False, default="{}")
    model_name = Column(String, nullable=True)
    provider_id = Column(String, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class SchemaMigration(Base):
    __tablename__ = "schema_migrations"

    version = Column(String, primary_key=True)
    applied_at = Column(DateTime, default=utc_now)


class TranscriptionBatch(Base):
    __tablename__ = "transcription_batches"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=True)
    options_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class ModelBenchmark(Base):
    __tablename__ = "model_benchmarks"

    id = Column(Integer, primary_key=True, autoincrement=True)
    model_name = Column(String, nullable=False)
    engine = Column(String, nullable=False)
    language = Column(String, nullable=True)
    audio_path = Column(String, nullable=False)
    duration_ms = Column(Integer, nullable=True)
    wall_time_ms = Column(Integer, nullable=True)
    realtime_factor = Column(Float, nullable=True)
    peak_memory_mb = Column(Float, nullable=True)
    text_length = Column(Integer, nullable=True)
    segment_count = Column(Integer, nullable=True)
    success = Column(Boolean, nullable=False, default=False)
    error_code = Column(String, nullable=True)
    error = Column(Text, nullable=True)
    created_at = Column(DateTime, default=utc_now)


class ASRProvider(Base):
    __tablename__ = "asr_providers"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String, nullable=False)
    provider_type = Column(String, nullable=False)
    base_url = Column(String, nullable=True)
    api_key_secret = Column(Text, nullable=True)
    default_model = Column(String, nullable=True)
    enabled = Column(Boolean, nullable=False, default=True)
    options_json = Column(Text, nullable=False, default="{}")
    created_at = Column(DateTime, default=utc_now)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)


class ASRSettings(Base):
    __tablename__ = "asr_settings"

    id = Column(Integer, primary_key=True, default=1)
    default_backend = Column(String, nullable=False, default="local")
    default_model_name = Column(String, nullable=True, default="whisper-base")
    default_provider_id = Column(String, nullable=True)
    default_language = Column(String, nullable=False, default="auto")
    timestamps = Column(Boolean, nullable=False, default=True)
    word_timestamps = Column(Boolean, nullable=False, default=False)
    diarization = Column(Boolean, nullable=False, default=False)
    vad = Column(Boolean, nullable=False, default=True)
    output_formats_json = Column(Text, nullable=False, default='["txt","srt"]')
    max_concurrent_local_tasks = Column(Integer, nullable=False, default=1)
    max_concurrent_provider_tasks = Column(Integer, nullable=False, default=2)
    ffmpeg_path = Column(Text, nullable=True)
    ffprobe_path = Column(Text, nullable=True)
    updated_at = Column(DateTime, default=utc_now, onupdate=utc_now)
