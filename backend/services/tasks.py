from __future__ import annotations

import json
import logging
import os
import queue
import shutil
import subprocess
import sys
import threading
import time
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, BinaryIO

from sqlalchemy.orm import Session

from backend import config
from backend.database import session as db_session
from backend.database.models import TranscriptSegment as DBSegment
from backend.database.models import ProofreadingRun, ProofreadingSuggestion
from backend.database.models import TaskDiagnostic, TranscriptVersion
from backend.database.models import TaskLog, TranscriptionBatch
from backend.database.models import TranscriptionChunk
from backend.database.models import TranscriptionTask
from backend.models import ChunkResponse, SegmentCreateRequest, SegmentMergeRequest, SegmentSplitRequest, SegmentUpdateRequest, SegmentsBulkUpdateRequest, TranscriptSegment, TranscriptionTaskResponse
from backend.providers.base import ProviderError
from backend.services import diagnostics
from backend.services import models as model_service
from backend.services import postprocess
from backend.services import quality
from backend.services import providers as provider_service
from backend.services import settings as settings_service
from backend.services import task_runtime
from backend.services import task_logs
from backend.services import versions as version_service
from backend.services.diarization import apply_diarization
from backend.services.errors import ASRboxError
from backend.services.media import prepare_media_for_asr, preflight_media, split_audio_chunks
from backend.services.process_utils import no_window_kwargs
from backend.services.task_transitions import task_transition_lock as _task_transition_lock
from backend.services.transcribe import transcribe_with_local_model
from backend.services.uploads import copy_local_path, save_upload
from backend.utils.events import event_bus
from backend.utils.transcript_text import normalize_transcript_text
from backend.utils.transcript_text import transcript_text_from_segments

LONG_AUDIO_THRESHOLD_MS = 30 * 60 * 1000
CHUNK_WINDOW_MS = 10 * 60 * 1000
CHUNK_OVERLAP_MS = 5 * 1000
LOCAL_CHUNK_THRESHOLD_MS = 2 * 60 * 1000
LOCAL_CHUNK_WINDOW_MS = 2 * 60 * 1000
LOCAL_CHUNK_OVERLAP_MS = 2 * 1000
LOCAL_WORKER_POLL_SECONDS = 0.2
DEFAULT_LOCAL_WORKER_STALL_SECONDS = 20 * 60


def _local_worker_stall_seconds() -> int:
    try:
        return max(1, int(os.environ.get("ASRBOX_LOCAL_WORKER_STALL_SECONDS", DEFAULT_LOCAL_WORKER_STALL_SECONDS)))
    except ValueError:
        return DEFAULT_LOCAL_WORKER_STALL_SECONDS
LOCAL_QUEUE = "local"
PROVIDER_QUEUE = "provider"
logger = logging.getLogger(__name__)
ACTIVE_TASK_STATUSES = {
    "queued",
    "importing",
    "preprocessing",
    "waiting_model",
    "downloading_model",
    "transcribing",
    "postprocessing",
    "exporting",
}
_task_queues = {LOCAL_QUEUE: queue.Queue(), PROVIDER_QUEUE: queue.Queue()}
_worker_counts = {LOCAL_QUEUE: 0, PROVIDER_QUEUE: 0}
_worker_targets = {LOCAL_QUEUE: 0, PROVIDER_QUEUE: 0}
_queue_lock = threading.RLock()


def _utc_now() -> datetime:
    return datetime.now(UTC)


def _segments_for_task(db: Session, task_id: str) -> list[TranscriptSegment]:
    rows = (
        db.query(DBSegment)
        .filter(DBSegment.task_id == task_id)
        .order_by(DBSegment.idx.asc())
        .all()
    )
    return [
        TranscriptSegment(
            id=row.idx,
            start=row.start_ms / 1000,
            end=row.end_ms / 1000,
            text=row.text,
            speaker=row.speaker,
            confidence=row.confidence,
        )
        for row in rows
    ]


def mark_interrupted_tasks(db: Session) -> int:
    rows = db.query(TranscriptionTask).filter(TranscriptionTask.status.in_(ACTIVE_TASK_STATUSES)).all()
    for row in rows:
        has_completed_chunks = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id, TranscriptionChunk.status == "completed").first() is not None
        row.status = "failed_resumable" if has_completed_chunks else "interrupted"
        row.progress = 100
        row.error = "Task was interrupted before the server restarted"
        row.error_code = "TASK_INTERRUPTED"
        row.updated_at = _utc_now()
        task_logs.add_log(db, row.id, "recovery", "warning", row.error, {"status": row.status})
    if rows:
        db.commit()
    return len(rows)


def reconcile_orphan_tasks(db: Session) -> list[TranscriptionTask]:
    tracked = task_runtime.active_ids()
    rows = db.query(TranscriptionTask).filter(TranscriptionTask.status.in_(ACTIVE_TASK_STATUSES)).all()
    orphans: list[TranscriptionTask] = []
    for row in rows:
        if row.id in tracked:
            continue
        has_completed_chunks = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id, TranscriptionChunk.status == "completed").first() is not None
        row.status = "failed_resumable" if has_completed_chunks else "interrupted"
        row.progress = 100
        row.error = "Task was orphaned by the worker runtime"
        row.error_code = "TASK_INTERRUPTED"
        row.updated_at = _utc_now()
        task_logs.add_log(db, row.id, "recovery", "warning", row.error, {"status": row.status})
        orphans.append(row)
    if orphans:
        db.commit()
    return orphans


def to_response(db: Session, row: TranscriptionTask) -> TranscriptionTaskResponse:
    try:
        options = json.loads(row.options_json or "{}")
    except json.JSONDecodeError:
        options = {}
    return TranscriptionTaskResponse(
        id=row.id,
        filename=row.filename,
        source=row.source,
        audio_path=row.audio_path,
        normalized_audio_path=row.normalized_audio_path,
        status=row.status,
        progress=row.progress,
        language=row.language,
        model_name=row.model_name,
        provider_id=row.provider_id,
        duration_ms=row.duration_ms,
        text=row.text,
        error=row.error,
        error_code=row.error_code,
        source_kind=options.get("_source_kind", "managed"),
        options={key: value for key, value in options.items() if not key.startswith("_")},
        segments=_segments_for_task(db, row.id),
        created_at=row.created_at,
        updated_at=row.updated_at,
        completed_at=row.completed_at,
        batch_id=row.batch_id,
    )


def _read_options(row: TranscriptionTask) -> dict:
    try:
        return json.loads(row.options_json or "{}")
    except json.JSONDecodeError:
        return {}


def _write_options(row: TranscriptionTask, options: dict) -> None:
    row.options_json = json.dumps(options, ensure_ascii=False)


def _set_task_state(db: Session, row: TranscriptionTask, status: str, progress: float) -> None:
    row.status = status
    row.progress = progress
    row.updated_at = _utc_now()
    db.commit()
    event_bus.publish(
        "task.updated",
        {"id": row.id, "status": row.status, "progress": row.progress, "error": row.error, "error_code": row.error_code},
    )
    task_logs.add_log(db, row.id, status, "info", f"Task entered {status}", {"progress": progress})


def _set_error_code(row: TranscriptionTask, code: str | None) -> None:
    row.error_code = code
    options = _read_options(row)
    if code:
        options["error_code"] = code
    else:
        options.pop("error_code", None)
    _write_options(row, options)


def _error_from_exception(exc: Exception) -> tuple[str | None, str, str | None, str | None, str | None, dict | None]:
    if isinstance(exc, ASRboxError):
        return exc.code, exc.message, exc.stage, exc.command, exc.stderr_excerpt, getattr(exc, "audio_metadata", None)
    if isinstance(exc, ProviderError):
        return exc.code, str(exc), exc.stage or "provider", None, None, None
    return None, str(exc), None, None, None, None


def _raise_if_cancelled(task_id: str) -> None:
    if task_runtime.is_cancelled(task_id):
        raise ASRboxError("TASK_CANCELLED", "Task was cancelled", stage="cancel")


def _create_task_row(
    db: Session,
    *,
    filename: str,
    audio_path: Path,
    backend: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
    output_formats: list[str],
    options: dict[str, Any] | None = None,
    batch_id: str | None = None,
    initial_status: str = "queued",
    task_id: str | None = None,
) -> TranscriptionTaskResponse:
    stored_options = {"output_formats": output_formats, **(options or {})}
    stored_options.setdefault("_source_kind", "managed")
    row = TranscriptionTask(
        id=task_id or audio_path.stem,
        filename=filename,
        source=backend,
        audio_path=config.to_storage_path(audio_path),
        status=initial_status,
        progress=0,
        language=language,
        model_name=model_name,
        provider_id=provider_id,
        batch_id=batch_id,
        options_json=json.dumps(stored_options, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    response = to_response(db, row)
    start_task_in_background(row.id)
    return response


def start_task_in_background(task_id: str) -> None:
    db_session.init_db()
    db = db_session.SessionLocal()
    try:
        row = get_task_row(db, task_id)
        if row is None:
            return
        settings = settings_service.get_settings(db)
        _ensure_task_workers(settings.max_concurrent_local_tasks, settings.max_concurrent_provider_tasks)
        task_runtime.mark_queued(task_id)
        _task_queues[_queue_name_for_row(row)].put(task_id)
    finally:
        db.close()


def _queue_name_for_row(row: TranscriptionTask) -> str:
    return PROVIDER_QUEUE if row.source == "provider" or row.provider_id else LOCAL_QUEUE


def _ensure_task_workers(local_count: int, provider_count: int) -> None:
    desired = {LOCAL_QUEUE: local_count, PROVIDER_QUEUE: provider_count}
    with _queue_lock:
        for queue_name, count in desired.items():
            _worker_targets[queue_name] = count
            _start_missing_workers_locked(queue_name)


def _start_missing_workers_locked(queue_name: str) -> None:
    while _worker_counts[queue_name] < _worker_targets[queue_name]:
        thread = threading.Thread(target=_task_worker, args=(queue_name,), daemon=True)
        _worker_counts[queue_name] += 1
        try:
            thread.start()
        except BaseException:
            _worker_counts[queue_name] -= 1
            raise


def _task_worker(queue_name: str) -> None:
    work_queue = _task_queues[queue_name]
    try:
        while True:
            task_id = work_queue.get()
            try:
                db = db_session.SessionLocal()
                try:
                    row = get_task_row(db, task_id)
                    if row is not None and row.status != "cancelled" and not task_runtime.is_cancelled(task_id):
                        task_runtime.mark_running(task_id)
                        run_task(db, row)
                    else:
                        task_runtime.mark_finished(task_id)
                finally:
                    db.close()
            except Exception:
                # The worker must never die: contain the escape and fail the task.
                logger.exception("Task worker escaped an unexpected error for task %s", task_id)
                _fail_task_after_escape(task_id)
            except BaseException:
                # Persist the current task best-effort, then let the worker
                # lifecycle replace this thread without surfacing an
                # unhandled thread exception.
                logger.exception("Task worker is exiting unexpectedly for task %s", task_id)
                _fail_task_after_escape(task_id)
                return
            finally:
                work_queue.task_done()
    finally:
        with _queue_lock:
            _worker_counts[queue_name] = max(0, _worker_counts[queue_name] - 1)
            _start_missing_workers_locked(queue_name)


def _fail_task_after_escape(task_id: str) -> None:
    """Best-effort failure persistence after run_task itself raised."""
    try:
        db = db_session.SessionLocal()
        try:
            db.rollback()
            row = get_task_row(db, task_id)
            if row is None or row.status not in ACTIVE_TASK_STATUSES:
                return
            row.status = "failed"
            row.error = "Task worker encountered an unexpected runtime error"
            _set_error_code(row, "WORKER_RUNTIME_ERROR")
            row.progress = 100
            row.updated_at = _utc_now()
            db.commit()
            task_logs.add_log(db, row.id, "failed", "error", row.error, {"error_code": row.error_code})
            event_bus.publish("task.failed", {"id": row.id, "status": row.status, "error": row.error, "error_code": row.error_code})
        finally:
            db.close()
    except Exception:
        logger.exception("Failed to persist escaped worker failure for task %s", task_id)
    finally:
        task_runtime.mark_finished(task_id)


def create_task(
    db: Session,
    *,
    filename: str,
    audio_bytes: bytes,
    backend: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
    output_formats: list[str],
    options: dict[str, Any] | None = None,
    batch_id: str | None = None,
) -> TranscriptionTaskResponse:
    task_id = str(uuid.uuid4())
    suffix = Path(filename).suffix or ".audio"
    audio_path = config.get_uploads_dir() / f"{task_id}{suffix}"
    audio_path.write_bytes(audio_bytes)
    return _create_task_row(
        db,
        filename=filename,
        audio_path=audio_path,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=output_formats,
        options=options,
        batch_id=batch_id,
    )


def create_task_from_file(
    db: Session,
    *,
    filename: str,
    file_obj: BinaryIO,
    backend: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
    output_formats: list[str],
    options: dict[str, Any] | None = None,
    batch_id: str | None = None,
) -> TranscriptionTaskResponse:
    task_id = str(uuid.uuid4())
    suffix = Path(filename).suffix or ".audio"
    audio_path = config.get_uploads_dir() / f"{task_id}{suffix}"
    save_upload(file_obj, audio_path)
    return _create_task_row(
        db,
        filename=filename,
        audio_path=audio_path,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=output_formats,
        options=options,
        batch_id=batch_id,
    )


def create_task_from_path(
    db: Session,
    *,
    path: Path,
    backend: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
    output_formats: list[str],
    options: dict[str, Any] | None = None,
    batch_id: str | None = None,
) -> TranscriptionTaskResponse:
    source_path = Path(path).expanduser()
    if not source_path.is_file():
        raise FileNotFoundError(f"Audio file not found: {path}")
    source_path = source_path.resolve(strict=True)
    task_id = str(uuid.uuid4())
    if config.get_media_ingest_mode() == config.INGEST_MODE_REFERENCE:
        reference_options = {**(options or {}), "_source_kind": "external"}
        return _create_task_row(
            db,
            filename=source_path.name,
            audio_path=source_path,
            backend=backend,
            model_name=model_name,
            provider_id=provider_id,
            language=language,
            output_formats=output_formats,
            options=reference_options,
            batch_id=batch_id,
            task_id=task_id,
        )
    target = config.get_uploads_dir() / f"{task_id}{source_path.suffix or '.audio'}"
    ingest_options = {
        **(options or {}),
        "_ingest_source_path": str(source_path),
        "_ingest_source_size": source_path.stat().st_size,
    }
    return _create_task_row(
        db,
        filename=source_path.name,
        audio_path=target,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=output_formats,
        options=ingest_options,
        batch_id=batch_id,
        initial_status="importing",
        task_id=task_id,
    )


def _import_task_media(db: Session, row: TranscriptionTask) -> None:
    options = _read_options(row)
    source_value = options.get("_ingest_source_path")
    if not source_value:
        return
    source = Path(str(source_value))
    destination = config.resolve_storage_path(row.audio_path)
    if destination is None:
        raise ASRboxError("MEDIA_IMPORT_FAILED", "Managed media destination is unavailable", stage="importing")

    _set_task_state(db, row, "importing", 0)
    last_progress = -1

    def update_progress(copied: int, total: int) -> None:
        nonlocal last_progress
        _raise_if_cancelled(row.id)
        progress = 9 if total <= 0 else min(9, int(copied / total * 9))
        if progress == last_progress:
            return
        last_progress = progress
        row.progress = progress
        row.updated_at = _utc_now()
        db.commit()
        event_bus.publish(
            "task.updated",
            {"id": row.id, "status": row.status, "progress": row.progress, "error": None, "error_code": None},
        )

    try:
        copy_local_path(source, destination, on_progress=update_progress)
    except ASRboxError:
        raise
    except Exception as exc:
        raise ASRboxError(
            "MEDIA_IMPORT_FAILED",
            f"Failed to import {source.name}: {exc}",
            stage="importing",
        ) from exc
    options.pop("_ingest_source_path", None)
    options.pop("_ingest_source_size", None)
    _write_options(row, options)
    db.commit()


def _prepare_task_media(db: Session, row: TranscriptionTask) -> Path:
    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise RuntimeError("Task audio file not found")

    normalized_path, metadata = prepare_media_for_asr(
        audio_path,
        output_dir=config.get_derived_audio_dir(),
        output_name=f"{row.id}.wav",
    )
    if normalized_path != audio_path:
        row.normalized_audio_path = config.to_storage_path(normalized_path)
    options = _read_options(row)
    options["audio_metadata"] = metadata
    is_local = row.source == "local" and bool(row.model_name)
    try:
        options["audio_quality"] = preflight_media(
            audio_path,
            long_audio_threshold_ms=LOCAL_CHUNK_THRESHOLD_MS if is_local else LONG_AUDIO_THRESHOLD_MS,
            chunk_window_ms=LOCAL_CHUNK_WINDOW_MS if is_local else CHUNK_WINDOW_MS,
            chunk_overlap_ms=LOCAL_CHUNK_OVERLAP_MS if is_local else CHUNK_OVERLAP_MS,
        )
    except Exception as exc:
        options["audio_quality"] = {"warnings": [str(exc)]}
    _write_options(row, options)
    if metadata.get("duration_ms") is not None:
        row.duration_ms = metadata["duration_ms"]
    db.commit()
    return normalized_path


def _transcribe_with_provider(db: Session, row: TranscriptionTask):
    provider_id = row.provider_id or "bcut"
    normalized_path = config.resolve_storage_path(row.normalized_audio_path or row.audio_path)
    if normalized_path is None:
        raise RuntimeError("Task audio file not found")

    return _transcribe_provider_path(db, row, normalized_path)


def _transcribe_provider_path(db: Session, row: TranscriptionTask, audio_path: Path):
    provider_id = row.provider_id or "bcut"
    return provider_service.transcribe_with_provider(
        db,
        provider_id,
        str(audio_path),
        {"language": row.language, "provider_id": provider_id, "should_cancel": task_runtime.cancellation_checker(row.id)},
    )


def _transcribe_with_local_model(db: Session, row: TranscriptionTask):
    normalized_path = config.resolve_storage_path(row.normalized_audio_path or row.audio_path)
    if normalized_path is None:
        raise RuntimeError("Task audio file not found")
    if os.environ.get("ASRBOX_INLINE_LOCAL_TRANSCRIPTION") == "1":
        if row.duration_ms and row.duration_ms > LONG_AUDIO_THRESHOLD_MS:
            return _transcribe_chunks(db, row, normalized_path)
        return _transcribe_local_path(db, row, normalized_path)
    return _transcribe_local_subprocess(db, row, normalized_path)


def _transcribe_local_path(db: Session, row: TranscriptionTask, audio_path: Path):
    model_name = row.model_name or "whisper-base"
    settings = settings_service.get_settings(db)
    options = _read_options(row)
    transcribe_options = {
        "language": row.language,
        "vad": options.get("vad", settings.vad),
        "word_timestamps": options.get("word_timestamps", settings.word_timestamps),
    }
    return transcribe_with_local_model(model_name, str(audio_path), transcribe_options)


def _local_worker_command(request_path: Path, result_path: Path) -> list[str]:
    command = [sys.executable]
    if not getattr(sys, "frozen", False):
        command.extend(["-m", "backend.server"])
    command.extend(
        [
            "--data-dir",
            str(config.get_data_dir()),
            "--parent-pid",
            str(os.getpid()),
            "--local-worker-request",
            str(request_path),
            "--local-worker-result",
            str(result_path),
        ]
    )
    return command


def _local_worker_environment(concurrency: int) -> dict[str, str]:
    """Lift the frozen runtime's startup thread cap for the inference worker.

    The PyInstaller runtime hook pins OMP_NUM_THREADS to 1 so the desktop startup
    stays cheap. A worker inheriting that pin runs CPU engines such as
    CTranslate2 single-threaded, which measured roughly four times slower than
    the same work in a development environment.
    """
    threads = max(1, (os.cpu_count() or 4) // max(1, concurrency))
    environment = os.environ.copy()
    environment["OMP_NUM_THREADS"] = str(threads)
    return environment


def _read_worker_state(path: Path) -> dict[str, Any] | None:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None
    return value if isinstance(value, dict) else None


def _terminate_worker(process: subprocess.Popen) -> None:
    if process.poll() is not None:
        return
    process.terminate()
    try:
        process.wait(timeout=5)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def _local_worker_inputs(db: Session, row: TranscriptionTask, audio_path: Path) -> tuple[list[dict[str, Any]], list[TranscriptionChunk]]:
    if not row.duration_ms or row.duration_ms <= LOCAL_CHUNK_THRESHOLD_MS:
        return [{"audio_path": str(audio_path), "start_ms": 0, "end_ms": row.duration_ms or 0}], []

    chunks_dir = config.get_derived_audio_dir() / f"{row.id}_chunks"
    chunk_files = split_audio_chunks(
        audio_path,
        chunks_dir,
        row.duration_ms,
        window_ms=LOCAL_CHUNK_WINDOW_MS,
        overlap_ms=LOCAL_CHUNK_OVERLAP_MS,
    )
    db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id).delete()
    rows: list[TranscriptionChunk] = []
    inputs: list[dict[str, Any]] = []
    for index, (path, start_ms, end_ms) in enumerate(chunk_files, 1):
        chunk = TranscriptionChunk(
            task_id=row.id,
            idx=index,
            audio_path=config.to_storage_path(path),
            start_ms=start_ms,
            end_ms=end_ms,
            status="transcribing" if index == 1 else "queued",
            progress=20 if index == 1 else 0,
        )
        db.add(chunk)
        rows.append(chunk)
        inputs.append({"audio_path": str(path), "start_ms": start_ms, "end_ms": end_ms})
    db.commit()
    for chunk in rows:
        db.refresh(chunk)
    first_chunk = rows[0]
    task_logs.add_log(db, row.id, "chunk", "info", "Chunk 1 started", {"chunk_id": first_chunk.id})
    event_bus.publish(
        "chunk.updated",
        {"task_id": row.id, "chunk_id": first_chunk.id, "status": first_chunk.status, "progress": first_chunk.progress},
    )
    return inputs, rows


def _publish_local_worker_progress(
    db: Session,
    row: TranscriptionTask,
    chunks: list[TranscriptionChunk],
    results: list[dict[str, Any]],
    published: int,
) -> int:
    completed = len(results)
    if completed <= published:
        return published
    if not chunks:
        return completed
    if completed > len(chunks):
        raise ASRboxError("LOCAL_WORKER_PROTOCOL_ERROR", "Local transcription worker returned too many chunk results", stage="transcribing")
    for result_index in range(published, completed):
        chunk = chunks[result_index]
        chunk.status = "completed"
        chunk.progress = 100
        chunk.text = str(results[result_index].get("text") or "")
        chunk.error = None
        chunk.error_code = None
        task_logs.add_log(db, row.id, "chunk", "info", f"Chunk {chunk.idx} completed", {"chunk_id": chunk.id})
        event_bus.publish("chunk.updated", {"task_id": row.id, "chunk_id": chunk.id, "status": chunk.status, "progress": chunk.progress})
        if result_index + 1 < len(chunks):
            next_chunk = chunks[result_index + 1]
            next_chunk.status = "transcribing"
            next_chunk.progress = 20
            task_logs.add_log(db, row.id, "chunk", "info", f"Chunk {next_chunk.idx} started", {"chunk_id": next_chunk.id})
        row.progress = 60 + int((result_index + 1) / len(chunks) * 28)
    db.commit()
    return completed


def _combine_local_worker_results(
    row: TranscriptionTask,
    inputs: list[dict[str, Any]],
    payloads: list[dict[str, Any]],
):
    from backend.models import TranscriptionResult

    if len(payloads) != len(inputs):
        raise ASRboxError(
            "LOCAL_WORKER_PROTOCOL_ERROR",
            f"Local transcription worker returned {len(payloads)} of {len(inputs)} expected results",
            stage="transcribing",
        )
    segments: list[TranscriptSegment] = []
    parsed = [TranscriptionResult.model_validate(payload) for payload in payloads]
    previous_end = 0.0
    for index, (item, result) in enumerate(zip(inputs, parsed, strict=True)):
        offset = float(item["start_ms"]) / 1000
        for segment in result.segments:
            start = segment.start + offset
            end = segment.end + offset
            if segment.end <= segment.start:
                # Backends without timestamps (Qwen3-ASR, SenseVoice) emit one
                # zero-length segment per chunk; treat it as covering the chunk window.
                start = offset
                end = float(item["end_ms"]) / 1000
            if index > 0 and ((start + end) / 2) <= previous_end:
                continue
            segments.append(
                TranscriptSegment(
                    id=len(segments) + 1,
                    start=start,
                    end=end,
                    text=segment.text,
                    speaker=segment.speaker,
                    confidence=segment.confidence,
                )
            )
        previous_end = float(item["end_ms"]) / 1000

    return TranscriptionResult(
        text=transcript_text_from_segments(segments) or "\n".join(result.text for result in parsed if result.text),
        language=next((result.language for result in parsed if result.language), row.language),
        duration=row.duration_ms / 1000 if row.duration_ms else (segments[-1].end if segments else None),
        segments=segments,
        model_name=row.model_name,
    )


def _transcribe_local_subprocess(db: Session, row: TranscriptionTask, audio_path: Path):
    model_name = row.model_name or "whisper-base"
    settings = settings_service.get_settings(db)
    options = _read_options(row)
    transcribe_options = {
        "language": row.language,
        "vad": options.get("vad", settings.vad),
        "word_timestamps": options.get("word_timestamps", settings.word_timestamps),
    }
    inputs, chunks = _local_worker_inputs(db, row, audio_path)
    worker_dir = config.get_cache_dir() / "task-workers" / row.id
    shutil.rmtree(worker_dir, ignore_errors=True)
    worker_dir.mkdir(parents=True, exist_ok=True)
    request_path = worker_dir / "request.json"
    result_path = worker_dir / "result.json"
    stderr_path = worker_dir / "stderr.log"
    request_path.write_text(
        json.dumps({"model_name": model_name, "options": transcribe_options, "inputs": inputs}, ensure_ascii=False),
        encoding="utf-8",
    )
    published = 0
    process: subprocess.Popen | None = None
    stderr_file = stderr_path.open("w", encoding="utf-8")
    stall_limit = _local_worker_stall_seconds()
    last_progress_at = time.monotonic()

    def stderr_excerpt() -> str:
        stderr_file.flush()
        try:
            return stderr_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        except OSError:
            return ""

    try:
        process = subprocess.Popen(
            _local_worker_command(request_path, result_path),
            stdout=subprocess.DEVNULL,
            stderr=stderr_file,
            text=True,
            env=_local_worker_environment(settings.max_concurrent_local_tasks),
            **no_window_kwargs(),
        )
        while True:
            if task_runtime.is_cancelled(row.id):
                _terminate_worker(process)
                for chunk in chunks:
                    if chunk.status != "completed":
                        chunk.status = "cancelled"
                        chunk.error = "Task was cancelled"
                        chunk.error_code = "TASK_CANCELLED"
                        chunk.progress = 100
                if chunks:
                    db.commit()
                raise ASRboxError("TASK_CANCELLED", "Task was cancelled", stage="cancel")
            state = _read_worker_state(result_path)
            if state:
                results = state.get("results") if isinstance(state.get("results"), list) else []
                published_before = published
                published = _publish_local_worker_progress(db, row, chunks, results, published)
                if published != published_before or state.get("status") in {"completed", "failed"}:
                    last_progress_at = time.monotonic()
                if state.get("status") == "completed":
                    process.wait(timeout=5)
                    return _combine_local_worker_results(row, inputs, results)
                if state.get("status") == "failed":
                    raise ASRboxError(
                        "MODEL_LOAD_FAILED",
                        str(state.get("error") or "Local transcription worker failed"),
                        stage="transcribing",
                        stderr_excerpt=stderr_excerpt(),
                    )
            return_code = process.poll()
            if return_code is not None:
                state = _read_worker_state(result_path)
                detail = str((state or {}).get("error") or f"Local transcription worker exited with code {return_code}")
                raise ASRboxError("MODEL_LOAD_FAILED", detail, stage="transcribing", stderr_excerpt=stderr_excerpt())
            if time.monotonic() - last_progress_at > stall_limit:
                # A hung worker (e.g. a device-level inference deadlock) must not
                # pin the task in transcribing and block the whole local queue.
                _terminate_worker(process)
                raise ASRboxError(
                    "LOCAL_WORKER_STALLED",
                    f"Local transcription worker produced no progress for {stall_limit} seconds and was terminated",
                    stage="transcribing",
                    stderr_excerpt=stderr_excerpt(),
                )
            time.sleep(LOCAL_WORKER_POLL_SECONDS)
    finally:
        if process is not None:
            _terminate_worker(process)
        stderr_file.close()
        shutil.rmtree(worker_dir, ignore_errors=True)


def _transcribe_path_for_row(db: Session, row: TranscriptionTask, audio_path: Path):
    if row.source == "provider" or row.provider_id:
        return _transcribe_provider_path(db, row, audio_path)
    if row.source == "local" and row.model_name:
        return _transcribe_local_path(db, row, audio_path)
    raise ASRboxError("INVALID_TRANSCRIPTION_BACKEND", f"Invalid transcription backend: {row.source}", stage="transcribing")


def _transcribe_chunks(db: Session, row: TranscriptionTask, normalized_path: Path):
    if row.duration_ms is None or row.duration_ms <= LONG_AUDIO_THRESHOLD_MS:
        return _transcribe_path_for_row(db, row, normalized_path)

    chunks_dir = config.get_derived_audio_dir() / f"{row.id}_chunks"
    chunk_files = split_audio_chunks(
        normalized_path,
        chunks_dir,
        row.duration_ms,
        window_ms=CHUNK_WINDOW_MS,
        overlap_ms=CHUNK_OVERLAP_MS,
    )
    db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id).delete()
    for index, (path, start_ms, end_ms) in enumerate(chunk_files, 1):
        db.add(
            TranscriptionChunk(
                task_id=row.id,
                idx=index,
                audio_path=config.to_storage_path(path),
                start_ms=start_ms,
                end_ms=end_ms,
                status="queued",
                progress=0,
            )
        )
    db.commit()

    all_segments: list[TranscriptSegment] = []
    texts: list[str] = []
    for index, (path, start_ms, _end_ms) in enumerate(chunk_files, 1):
        chunk = (
            db.query(TranscriptionChunk)
            .filter(TranscriptionChunk.task_id == row.id, TranscriptionChunk.idx == index)
            .first()
        )
        if chunk is None:
            raise RuntimeError(f"Missing chunk {index}")
        chunk.status = "transcribing"
        chunk.progress = 20
        db.commit()
        task_logs.add_log(db, row.id, "chunk", "info", f"Chunk {index} started", {"chunk_id": chunk.id})
        try:
            result = _transcribe_path_for_row(db, row, path)
            offset = start_ms / 1000
            for segment in result.segments:
                all_segments.append(
                    TranscriptSegment(
                        id=len(all_segments) + 1,
                        start=segment.start + offset,
                        end=segment.end + offset,
                        text=segment.text,
                        speaker=segment.speaker,
                        confidence=segment.confidence,
                    )
                )
            texts.append(result.text)
            chunk.status = "completed"
            chunk.error = None
            chunk.error_code = None
            chunk.progress = 100
            chunk.text = result.text
            row.progress = 60 + int(index / len(chunk_files) * 25)
            db.commit()
            task_logs.add_log(db, row.id, "chunk", "info", f"Chunk {index} completed", {"chunk_id": chunk.id})
            event_bus.publish("chunk.updated", {"task_id": row.id, "chunk_id": chunk.id, "status": chunk.status, "progress": chunk.progress})
        except Exception as exc:
            code, message, stage, command, stderr_excerpt, audio_metadata = _error_from_exception(exc)
            chunk.status = "failed"
            chunk.error = message
            chunk.error_code = code or "CHUNK_FAILED"
            db.commit()
            diagnostics.record_task_diagnostic(
                db,
                task_id=row.id,
                stage=stage or "chunk",
                error_code=chunk.error_code,
                message=message,
                command=command,
                stderr_excerpt=stderr_excerpt,
                model_name=row.model_name,
                provider_id=row.provider_id,
                audio_metadata=audio_metadata,
            )
            task_logs.add_log(db, row.id, "chunk", "error", message, {"chunk_id": chunk.id, "error_code": chunk.error_code})
            event_bus.publish("chunk.updated", {"task_id": row.id, "chunk_id": chunk.id, "status": chunk.status, "progress": chunk.progress, "error_code": chunk.error_code})
            raise

    from backend.models import TranscriptionResult

    return TranscriptionResult(
        text=transcript_text_from_segments(all_segments) or "\n".join(text for text in texts if text),
        language=row.language,
        duration=row.duration_ms / 1000 if row.duration_ms else (all_segments[-1].end if all_segments else None),
        segments=all_segments,
        model_name=row.model_name,
        provider_id=row.provider_id,
    )


def _store_segments(db: Session, row: TranscriptionTask, segments: list[TranscriptSegment]) -> None:
    db.query(DBSegment).filter(DBSegment.task_id == row.id).delete()
    for index, segment in enumerate(segments, 1):
        db.add(
            DBSegment(
                task_id=row.id,
                idx=index,
                start_ms=int(segment.start * 1000),
                end_ms=int(segment.end * 1000),
                text=segment.text,
                speaker=segment.speaker,
                confidence=segment.confidence,
            )
        )


def run_task(db: Session, row: TranscriptionTask) -> None:
    try:
        if row.status == "cancelled" or task_runtime.is_cancelled(row.id):
            return
        row.error = None
        _set_error_code(row, None)
        task_logs.add_log(db, row.id, "queued", "info", "Task picked by worker")
        _import_task_media(db, row)
        _set_task_state(db, row, "preprocessing", 10)
        _raise_if_cancelled(row.id)
        normalized_path = _prepare_task_media(db, row)
        _set_task_state(db, row, "waiting_model" if row.model_name else "transcribing", 20)
        _raise_if_cancelled(row.id)
        if row.model_name:
            model_service.ensure_model_ready(row.model_name)
        _set_task_state(db, row, "transcribing", 60)
        _raise_if_cancelled(row.id)
        if row.source == "local" and row.model_name:
            result = _transcribe_with_local_model(db, row)
        elif row.duration_ms and row.duration_ms > LONG_AUDIO_THRESHOLD_MS:
            result = _transcribe_chunks(db, row, normalized_path)
        elif row.source == "provider" or row.provider_id:
            result = _transcribe_with_provider(db, row)
        else:
            raise ASRboxError("INVALID_TRANSCRIPTION_BACKEND", f"Invalid transcription backend: {row.source}", stage="transcribing")
        db.refresh(row)
        if row.status == "cancelled" or task_runtime.is_cancelled(row.id):
            return
        _set_task_state(db, row, "postprocessing", 90)
        options = _read_options(row)
        if result.raw_result_summary:
            options["raw_result_summary"] = result.raw_result_summary
        settings = settings_service.get_settings(db)
        segments = result.segments
        if (
            len(segments) == 1
            and row.duration_ms
            and segments[0].end <= segments[0].start
        ):
            segments = [segments[0].model_copy(update={"end": row.duration_ms / 1000})]
        native_speaker_labels = any(segment.speaker for segment in segments)
        diarization_requested = bool(options.get("diarization", settings.diarization))
        _raise_if_cancelled(row.id)
        if diarization_requested and not native_speaker_labels:
            token = options.get("diarization_token")
            if not token:
                raise ASRboxError("DIARIZATION_TOKEN_MISSING", "Speaker diarization requires HF_TOKEN or diarization_token", stage="diarization")
            segments = apply_diarization(str(normalized_path), segments, token=token)
        mode = options.get("postprocess_mode", "safe")
        segments = postprocess.process_segments(
            segments,
            max_chars_per_line=int(options.get("max_chars_per_line", 42)),
            max_lines=int(options.get("max_lines", 2)),
            min_duration_ms=int(options.get("min_duration_ms", 800)),
            merge_short_segments=bool(options.get("merge_short_segments", mode == "aggressive")),
            traditional_to_simplified=bool(options.get("traditional_to_simplified", False)),
        )
        _write_options(row, options)
        text_from_segments = transcript_text_from_segments(segments)
        segment_altering_options = (
            mode == "aggressive"
            or bool(options.get("merge_short_segments", False))
            or bool(options.get("traditional_to_simplified", False))
            or (diarization_requested and not native_speaker_labels)
        )
        row.text = text_from_segments if segment_altering_options else (normalize_transcript_text(result.text) or text_from_segments)
        if row.duration_ms is None:
            row.duration_ms = int((result.duration or 0) * 1000)
        _store_segments(db, row, segments)
        report = quality.store_quality_report(db, row, segments, options)
        if report["warnings"]:
            task_logs.add_log(db, row.id, "quality", "warning", "Quality warnings detected", report)
        _write_options(row, options)
        _raise_if_cancelled(row.id)
        row.status = "completed"
        row.progress = 100
        row.completed_at = _utc_now()
        version_type = options.pop("pending_version_type", None) or "transcribe"
        _write_options(row, options)
        db.flush()
        version_service.create_version(db, row, version_type, commit=False)
        db.commit()
        if config.delete_derived_audio_on_complete():
            try:
                with _task_transition_lock:
                    db.expire_all()
                    completed = get_task_row(db, row.id)
                    if completed is not None and completed.status == "completed":
                        _cleanup_task_artifacts_for_row(db, completed)
                        db.commit()
            except Exception as exc:  # cleanup must not fail a completed task
                task_logs.add_log(db, row.id, "cleanup", "warning", f"Derived-audio cleanup failed: {exc}", None)
        event_bus.publish("task.completed", {"id": row.id, "status": row.status, "progress": row.progress})
    except Exception as exc:
        db.rollback()
        fresh = get_task_row(db, row.id)
        if fresh is None:
            logger.warning("Task %s row was deleted during execution; skipping failure persistence", row.id)
            return
        if fresh.status == "cancelled":
            return
        code, message, stage, command, stderr_excerpt, audio_metadata = _error_from_exception(exc)
        fresh.status = "cancelled" if code == "TASK_CANCELLED" else "failed"
        fresh.error = message
        _set_error_code(fresh, code)
        fresh.progress = 100
        db.commit()
        diagnostics.record_task_diagnostic(
            db,
            task_id=fresh.id,
            stage=stage or fresh.status,
            error_code=code,
            message=message,
            command=command,
            stderr_excerpt=stderr_excerpt,
            model_name=fresh.model_name,
            provider_id=fresh.provider_id,
            audio_metadata=audio_metadata,
        )
        task_logs.add_log(db, fresh.id, stage or "failed", "error", message, {"error_code": code})
        event_bus.publish("task.failed", {"id": fresh.id, "status": fresh.status, "error": fresh.error, "error_code": fresh.error_code})
    finally:
        task_runtime.mark_finished(row.id)


def list_tasks(db: Session) -> tuple[list[TranscriptionTaskResponse], int]:
    rows = db.query(TranscriptionTask).order_by(TranscriptionTask.created_at.desc()).all()
    return [to_response(db, row) for row in rows], len(rows)


def active_tasks(db: Session) -> dict[str, Any]:
    settings = settings_service.get_settings(db)
    orphans = reconcile_orphan_tasks(db)
    queued_statuses = {"queued"}
    running_statuses = ACTIVE_TASK_STATUSES - queued_statuses
    queued = db.query(TranscriptionTask).filter(TranscriptionTask.status.in_(queued_statuses)).all()
    running = db.query(TranscriptionTask).filter(TranscriptionTask.status.in_(running_statuses)).all()
    recent_error_row = (
        db.query(TranscriptionTask)
        .filter(TranscriptionTask.error.isnot(None))
        .order_by(TranscriptionTask.updated_at.desc())
        .first()
    )

    def summarize(row: TranscriptionTask) -> dict[str, Any]:
        return {
            "id": row.id,
            "filename": row.filename,
            "status": row.status,
            "progress": row.progress,
            "source": row.source,
            "model_name": row.model_name,
            "provider_id": row.provider_id,
            "error_code": row.error_code,
            "batch_id": row.batch_id,
        }

    return {
        "downloads": model_service.active_downloads(),
        "queued_tasks": [summarize(row) for row in queued],
        "running_tasks": [summarize(row) for row in running],
        "orphan_tasks": [summarize(row) for row in orphans],
        "failed_resumable_tasks": [summarize(row) for row in db.query(TranscriptionTask).filter(TranscriptionTask.status == "failed_resumable").all()],
        "running_chunks": [
            {
                "id": chunk.id,
                "task_id": chunk.task_id,
                "idx": chunk.idx,
                "status": chunk.status,
                "progress": chunk.progress,
                "error_code": chunk.error_code,
            }
            for chunk in db.query(TranscriptionChunk).filter(TranscriptionChunk.status.in_(("queued", "transcribing", "failed"))).all()
        ],
        "local_queue_length": _task_queues[LOCAL_QUEUE].qsize(),
        "provider_queue_length": _task_queues[PROVIDER_QUEUE].qsize(),
        "local_worker_count": _worker_counts[LOCAL_QUEUE],
        "provider_worker_count": _worker_counts[PROVIDER_QUEUE],
        "max_concurrent_local_tasks": settings.max_concurrent_local_tasks,
        "max_concurrent_provider_tasks": settings.max_concurrent_provider_tasks,
        "recent_error": recent_error_row.error if recent_error_row else None,
        "worker_state": task_runtime.snapshot(),
        "cancelled_task_ids": task_runtime.snapshot()["cancelled_task_ids"],
    }


def get_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    row = db.query(TranscriptionTask).filter(TranscriptionTask.id == task_id).first()
    return to_response(db, row) if row else None


def get_task_row(db: Session, task_id: str) -> TranscriptionTask | None:
    return db.query(TranscriptionTask).filter(TranscriptionTask.id == task_id).first()


class TaskStateConflictError(Exception):
    """Raised when a task mutation conflicts with its current lifecycle state."""


class TaskActiveError(TaskStateConflictError):
    """Raised when retry/retranscribe/delete targets a task that is still active."""


class ChunkRetryConflictError(TaskStateConflictError):
    """Raised when a chunk is not eligible for a failed-chunk retry."""


def _require_not_active(row: TranscriptionTask, action: str) -> None:
    if row.status in ACTIVE_TASK_STATUSES or row.id in task_runtime.active_ids():
        raise TaskActiveError(f"Cannot {action} task while it is {row.status}; cancel it first")


def retry_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        _require_not_active(row, "retry")
        row.status = "queued"
        row.error = None
        _set_error_code(row, None)
        row.progress = 0
        row.completed_at = None
        db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id).delete()
        db.commit()
        db.refresh(row)
        response = to_response(db, row)
        start_task_in_background(row.id)
        return response


def retranscribe_task(
    db: Session,
    task_id: str,
    *,
    backend: str | None = None,
    model_name: str | None = None,
    provider_id: str | None = None,
    language: str | None = None,
    output_formats: list[str] | None = None,
) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        _require_not_active(row, "retranscribe")
        row.source = backend or row.source
        if model_name is not None:
            row.model_name = model_name
        if provider_id is not None:
            row.provider_id = provider_id
        if language is not None:
            row.language = language
        options = _read_options(row)
        if output_formats is not None:
            options["output_formats"] = output_formats
        options.pop("audio_metadata", None)
        options.pop("audio_quality", None)
        options["pending_version_type"] = "retranscribe"
        _write_options(row, options)
        row.normalized_audio_path = None
        row.status = "queued"
        row.progress = 0
        row.duration_ms = None
        row.text = None
        row.error = None
        _set_error_code(row, None)
        row.completed_at = None
        db.query(DBSegment).filter(DBSegment.task_id == task_id).delete()
        db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id).delete()
        db.commit()
        db.refresh(row)
        response = to_response(db, row)
        start_task_in_background(row.id)
        return response


def cancel_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        if row.status != "completed":
            task_runtime.request_cancel(task_id)
            row.status = "cancelled"
            _set_error_code(row, "TASK_CANCELLED")
            row.progress = 100
            row.updated_at = _utc_now()
            db.commit()
            db.refresh(row)
        return to_response(db, row)


def delete_task(db: Session, task_id: str) -> bool:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return False
        _require_not_active(row, "delete")
        task_runtime.request_cancel(task_id)
        # Externally referenced media belongs to the user; only managed copies are unlinked.
        if _read_options(row).get("_source_kind", "managed") == "managed":
            audio_path = config.resolve_storage_path(row.audio_path)
            if audio_path:
                audio_path.unlink(missing_ok=True)
        normalized_audio_path = config.resolve_storage_path(row.normalized_audio_path)
        if normalized_audio_path:
            normalized_audio_path.unlink(missing_ok=True)
        chunks = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id).all()
        for chunk in chunks:
            chunk_path = config.resolve_storage_path(chunk.audio_path)
            if chunk_path:
                chunk_path.unlink(missing_ok=True)
        db.query(DBSegment).filter(DBSegment.task_id == task_id).delete()
        db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id).delete()
        db.query(TaskDiagnostic).filter(TaskDiagnostic.task_id == task_id).delete()
        run_ids = db.query(ProofreadingRun.id).filter(ProofreadingRun.task_id == task_id)
        db.query(ProofreadingSuggestion).filter(ProofreadingSuggestion.run_id.in_(run_ids)).delete(
            synchronize_session=False
        )
        db.query(ProofreadingRun).filter(ProofreadingRun.task_id == task_id).delete()
        from backend.services.translation import delete_for_task

        delete_for_task(db, task_id)
        db.query(TranscriptVersion).filter(TranscriptVersion.task_id == task_id).delete()
        db.query(TaskLog).filter(TaskLog.task_id == task_id).delete()
        db.delete(row)
        db.commit()
        return True


def delete_all_tasks(db: Session) -> int:
    task_ids = [row.id for row in db.query(TranscriptionTask.id).all()]
    deleted = 0
    for task_id in task_ids:
        try:
            if delete_task(db, task_id):
                deleted += 1
        except TaskActiveError:
            # Active tasks are cancelled first by their owners; batch delete skips them.
            continue
    return deleted


def postprocess_task(
    db: Session,
    task_id: str,
    *,
    max_chars_per_line: int,
    max_lines: int,
    min_duration_ms: int,
    merge_short_segments: bool,
    traditional_to_simplified: bool,
    mode: str = "safe",
) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "postprocess")
        if row is None:
            return None
        segments = _segments_for_task(db, task_id)
        if mode == "safe":
            merge_short_segments = False
            traditional_to_simplified = False
        processed = postprocess.process_segments(
            segments,
            max_chars_per_line=max_chars_per_line,
            max_lines=max_lines,
            min_duration_ms=min_duration_ms,
            merge_short_segments=merge_short_segments,
            traditional_to_simplified=traditional_to_simplified,
        )
        _store_segments(db, row, processed)
        row.text = transcript_text_from_segments(processed)
        row.updated_at = _utc_now()
        try:
            db.flush()
            version_service.create_version(db, row, "postprocess", commit=False)
            db.commit()
            db.refresh(row)
        except Exception:
            db.rollback()
            raise
        return to_response(db, row)


def _reindex_segments(db: Session, task_id: str) -> None:
    rows = (
        db.query(DBSegment)
        .filter(DBSegment.task_id == task_id)
        .order_by(DBSegment.start_ms.asc(), DBSegment.id.asc())
        .all()
    )
    for index, segment in enumerate(rows, 1):
        segment.idx = index


def _save_edit_version(db: Session, row: TranscriptionTask) -> TranscriptionTaskResponse:
    try:
        _reindex_segments(db, row.id)
        db.flush()
        row.text = transcript_text_from_segments(_segments_for_task(db, row.id))
        row.updated_at = _utc_now()
        db.flush()
        version_service.create_version(db, row, "edit", commit=False)
        db.commit()
        db.refresh(row)
        return to_response(db, row)
    except Exception:
        db.rollback()
        raise


def list_task_diagnostics(db: Session, task_id: str):
    return diagnostics.list_task_diagnostics(db, task_id)


def list_task_logs(db: Session, task_id: str):
    return task_logs.list_logs(db, task_id)


def get_quality(db: Session, task_id: str):
    row = get_task_row(db, task_id)
    if row is None:
        return None
    return quality.get_quality_report(task_id, _read_options(row))


def diagnostics_summary(db: Session, task_id: str):
    return diagnostics.diagnostics_summary(db, task_id)


def list_versions(db: Session, task_id: str):
    return version_service.list_versions(db, task_id)


def get_version(db: Session, task_id: str, version_id: int):
    return version_service.get_version(db, task_id, version_id)


def latest_version_id(db: Session, task_id: str) -> int | None:
    return version_service.latest_version_id(db, task_id)


def restore_version(db: Session, task_id: str, version_id: int) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "restore")
        if row is None:
            return None
        if not version_service.restore_version(db, row, version_id):
            return None
        db.refresh(row)
        return to_response(db, row)


def _get_mutable_transcript_task(
    db: Session,
    task_id: str,
    action: str,
) -> TranscriptionTask | None:
    db.expire_all()
    row = get_task_row(db, task_id)
    if row is not None:
        _require_not_active(row, action)
    return row


def _validate_segment_timing(start: float, end: float, segment_id: int | str) -> None:
    if start < 0 or end <= start:
        raise ValueError(f"Segment {segment_id} must have finite timing with start >= 0 and end > start")


def update_segment(db: Session, task_id: str, segment_id: int, request: SegmentUpdateRequest) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        segment = db.query(DBSegment).filter(DBSegment.task_id == task_id, DBSegment.idx == segment_id).first()
        if row is None or segment is None:
            return None
        data = request.model_dump(exclude_unset=True)
        start = data.get("start")
        end = data.get("end")
        start = segment.start_ms / 1000 if start is None else start
        end = segment.end_ms / 1000 if end is None else end
        _validate_segment_timing(start, end, segment_id)
        if "start" in data and data["start"] is not None:
            segment.start_ms = int(data["start"] * 1000)
        if "end" in data and data["end"] is not None:
            segment.end_ms = int(data["end"] * 1000)
        if "text" in data and data["text"] is not None:
            segment.text = data["text"]
        if "speaker" in data:
            segment.speaker = data["speaker"]
        if "confidence" in data:
            segment.confidence = data["confidence"]
        return _save_edit_version(db, row)


def update_segments_bulk(db: Session, task_id: str, request: SegmentsBulkUpdateRequest) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        if row is None:
            return None
        current = {segment.idx: segment for segment in db.query(DBSegment).filter(DBSegment.task_id == task_id).all()}
        incoming_ids = {item.id for item in request.segments}
        if len(incoming_ids) != len(request.segments) or incoming_ids != set(current):
            raise ValueError("Segment id set must match the task's current segments exactly; use the structural endpoints for create/delete/split/merge")
        for item in request.segments:
            _validate_segment_timing(item.start, item.end, item.id)
        for item in request.segments:
            segment = current[item.id]
            segment.start_ms = int(item.start * 1000)
            segment.end_ms = int(item.end * 1000)
            segment.text = item.text
            segment.speaker = item.speaker
        return _save_edit_version(db, row)


def create_segment(db: Session, task_id: str, request: SegmentCreateRequest) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        if row is None:
            return None
        _validate_segment_timing(request.start, request.end, "new")
        db.add(
            DBSegment(
                task_id=task_id,
                idx=999999,
                start_ms=int(request.start * 1000),
                end_ms=int(request.end * 1000),
                text=request.text,
                speaker=request.speaker,
                confidence=request.confidence,
            )
        )
        return _save_edit_version(db, row)


def delete_segment(db: Session, task_id: str, segment_id: int) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        segment = db.query(DBSegment).filter(DBSegment.task_id == task_id, DBSegment.idx == segment_id).first()
        if row is None or segment is None:
            return None
        db.delete(segment)
        return _save_edit_version(db, row)


def split_segment(db: Session, task_id: str, segment_id: int, request: SegmentSplitRequest) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        segment = db.query(DBSegment).filter(DBSegment.task_id == task_id, DBSegment.idx == segment_id).first()
        if row is None or segment is None:
            return None
        split_ms = int(request.split_at * 1000)
        if split_ms <= segment.start_ms or split_ms >= segment.end_ms:
            split_ms = segment.start_ms + max(1, (segment.end_ms - segment.start_ms) // 2)
        original_end_ms = segment.end_ms
        text = segment.text
        midpoint = max(1, len(text) // 2)
        left_text = request.left_text if request.left_text is not None else text[:midpoint].strip()
        right_text = request.right_text if request.right_text is not None else text[midpoint:].strip()
        segment.end_ms = split_ms
        segment.text = left_text or text
        db.add(
            DBSegment(
                task_id=task_id,
                idx=999999,
                start_ms=split_ms,
                end_ms=max(split_ms + 1, original_end_ms),
                text=right_text or text,
                speaker=segment.speaker,
                confidence=segment.confidence,
            )
        )
        return _save_edit_version(db, row)


def merge_segments(db: Session, task_id: str, request: SegmentMergeRequest) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        row = _get_mutable_transcript_task(db, task_id, "edit")
        rows = (
            db.query(DBSegment)
            .filter(DBSegment.task_id == task_id, DBSegment.idx.in_(request.segment_ids))
            .order_by(DBSegment.start_ms.asc())
            .all()
        )
        if row is None or len(rows) < 2:
            return None
        first = rows[0]
        first.start_ms = min(segment.start_ms for segment in rows)
        first.end_ms = max(segment.end_ms for segment in rows)
        first.text = " ".join(segment.text for segment in rows if segment.text).strip()
        for segment in rows[1:]:
            db.delete(segment)
        return _save_edit_version(db, row)


def list_chunks(db: Session, task_id: str) -> list[ChunkResponse]:
    rows = (
        db.query(TranscriptionChunk)
        .filter(TranscriptionChunk.task_id == task_id)
        .order_by(TranscriptionChunk.idx.asc())
        .all()
    )
    return [
        ChunkResponse(
            id=row.id,
            task_id=row.task_id,
            idx=row.idx,
            audio_path=row.audio_path,
            start_ms=row.start_ms,
            end_ms=row.end_ms,
            status=row.status,
            progress=row.progress,
            text=row.text,
            error=row.error,
            error_code=row.error_code,
        )
        for row in rows
    ]


def _merge_completed_chunks(db: Session, row: TranscriptionTask) -> None:
    chunks = (
        db.query(TranscriptionChunk)
        .filter(TranscriptionChunk.task_id == row.id)
        .order_by(TranscriptionChunk.idx.asc())
        .all()
    )
    if not chunks or any(chunk.status != "completed" for chunk in chunks):
        return
    segments = [
        TranscriptSegment(id=index, start=chunk.start_ms / 1000, end=chunk.end_ms / 1000, text=chunk.text or "")
        for index, chunk in enumerate(chunks, 1)
        if chunk.text
    ]
    try:
        _store_segments(db, row, segments)
        row.text = transcript_text_from_segments(segments)
        row.status = "completed"
        row.progress = 100
        row.error = None
        _set_error_code(row, None)
        row.completed_at = _utc_now()
        db.flush()
        version_service.create_version(db, row, "retranscribe", commit=False)
        db.commit()
        db.refresh(row)
    except Exception:
        db.rollback()
        raise


def _claim_failed_chunks(
    db: Session,
    task_id: str,
    *,
    chunk_id: int | None,
) -> tuple[TranscriptionTask, list[int], tuple[str, float, str | None, str | None, datetime | None]] | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        _require_not_active(row, "retry chunks for")
        query = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id)
        if chunk_id is not None:
            chunk = query.filter(TranscriptionChunk.id == chunk_id).first()
            if chunk is None:
                return None
            if chunk.status != "failed":
                raise ChunkRetryConflictError(
                    f"Cannot retry chunk {chunk_id} while it is {chunk.status}; only failed chunks can be retried"
                )
            failed_chunk_ids = [chunk.id]
        else:
            failed_chunk_ids = [
                chunk.id
                for chunk in query.filter(TranscriptionChunk.status == "failed")
                .order_by(TranscriptionChunk.idx.asc())
                .all()
            ]
            if not failed_chunk_ids:
                return row, [], (
                    row.status,
                    row.progress,
                    row.error,
                    row.error_code,
                    row.completed_at,
                )

        previous_state = (
            row.status,
            row.progress,
            row.error,
            row.error_code,
            row.completed_at,
        )
        row.status = "transcribing"
        row.completed_at = None
        row.updated_at = _utc_now()
        db.commit()
        db.refresh(row)
        task_runtime.mark_running(task_id)
        return row, failed_chunk_ids, previous_state


def _retry_claimed_chunk(
    db: Session,
    row: TranscriptionTask,
    chunk_id: int,
) -> bool:
    chunk = (
        db.query(TranscriptionChunk)
        .filter(
            TranscriptionChunk.task_id == row.id,
            TranscriptionChunk.id == chunk_id,
        )
        .first()
    )
    if chunk is None:
        row.status = "failed"
        row.error = "Chunk row disappeared during retry"
        _set_error_code(row, "CHUNK_FAILED")
        db.commit()
        return False
    path = config.resolve_storage_path(chunk.audio_path)
    if path is None or not path.exists():
        chunk.status = "failed"
        chunk.error = "Chunk audio file not found"
        chunk.error_code = "CHUNK_FAILED"
        row.status = "failed"
        row.error = chunk.error
        _set_error_code(row, chunk.error_code)
        db.commit()
        return False
    chunk.status = "transcribing"
    chunk.progress = 20
    chunk.error = None
    chunk.error_code = None
    db.commit()
    try:
        _raise_if_cancelled(row.id)
        result = _transcribe_path_for_row(db, row, path)
        _raise_if_cancelled(row.id)
        chunk.text = result.text or transcript_text_from_segments(result.segments)
        chunk.status = "completed"
        chunk.progress = 100
        db.commit()
        return True
    except Exception as exc:
        code, message, stage, command, stderr_excerpt, audio_metadata = _error_from_exception(exc)
        chunk.status = "failed"
        chunk.error = message
        chunk.error_code = code or "CHUNK_FAILED"
        row.status = "cancelled" if code == "TASK_CANCELLED" else "failed"
        row.error = message
        _set_error_code(row, chunk.error_code)
        if row.status == "cancelled":
            row.progress = 100
            row.completed_at = _utc_now()
        db.commit()
        diagnostics.record_task_diagnostic(
            db,
            task_id=row.id,
            stage=stage or "chunk",
            error_code=chunk.error_code,
            message=message,
            command=command,
            stderr_excerpt=stderr_excerpt,
            model_name=row.model_name,
            provider_id=row.provider_id,
            audio_metadata=audio_metadata,
        )
        return False


def _retry_failed_chunk_ids(
    db: Session,
    row: TranscriptionTask,
    chunk_ids: list[int],
    previous_state: tuple[str, float, str | None, str | None, datetime | None],
) -> TranscriptionTaskResponse:
    task_id = row.id
    try:
        all_retried = True
        for chunk_id in chunk_ids:
            if not _retry_claimed_chunk(db, row, chunk_id):
                all_retried = False
        with _task_transition_lock:
            db.expire_all()
            row = get_task_row(db, task_id)
            if row is None:
                raise RuntimeError("Task disappeared while retrying failed chunks")
            chunks = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == task_id).all()
            if row.status == "cancelled" or task_runtime.is_cancelled(task_id):
                row.status = "cancelled"
                row.progress = 100
                _set_error_code(row, "TASK_CANCELLED")
                row.completed_at = _utc_now()
                db.commit()
                db.refresh(row)
            elif chunks and all(chunk.status == "completed" for chunk in chunks):
                _merge_completed_chunks(db, row)
                db.refresh(row)
            elif all_retried:
                status, progress, error, error_code, completed_at = previous_state
                row.status = status
                row.progress = progress
                row.error = error
                _set_error_code(row, error_code)
                row.completed_at = completed_at
                row.updated_at = _utc_now()
                db.commit()
                db.refresh(row)
            return to_response(db, row)
    except BaseException:
        db.rollback()
        try:
            failed = get_task_row(db, task_id)
            if failed is not None and failed.status == "transcribing":
                failed.status = "failed"
                failed.error = "Chunk retry was interrupted"
                _set_error_code(failed, "CHUNK_FAILED")
                failed.completed_at = _utc_now()
                db.commit()
        except Exception:
            db.rollback()
            logger.exception("Failed to persist interrupted chunk retry for task %s", task_id)
        raise
    finally:
        task_runtime.mark_finished(task_id)


def retry_chunk(db: Session, task_id: str, chunk_id: int) -> TranscriptionTaskResponse | None:
    claim = _claim_failed_chunks(db, task_id, chunk_id=chunk_id)
    if claim is None:
        return None
    row, chunk_ids, previous_state = claim
    return _retry_failed_chunk_ids(db, row, chunk_ids, previous_state)


def retry_failed_chunks(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    claim = _claim_failed_chunks(db, task_id, chunk_id=None)
    if claim is None:
        return None
    row, chunk_ids, previous_state = claim
    if not chunk_ids:
        return to_response(db, row)
    return _retry_failed_chunk_ids(db, row, chunk_ids, previous_state)


def _cleanup_task_artifacts_for_row(db: Session, row: TranscriptionTask) -> dict[str, Any]:
    removed: list[str] = []
    errors: list[str] = []
    normalized = config.resolve_storage_path(row.normalized_audio_path)
    source = config.resolve_storage_path(row.audio_path)
    for path in [normalized]:
        if path and path != source and path.exists():
            try:
                path.unlink()
                removed.append(str(path))
            except OSError as exc:
                errors.append(f"{path}: {exc}")
    chunks = db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id).all()
    for chunk in chunks:
        path = config.resolve_storage_path(chunk.audio_path)
        if path and path.exists():
            try:
                path.unlink()
                removed.append(str(path))
            except OSError as exc:
                errors.append(f"{path}: {exc}")
    db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == row.id).delete()
    row.normalized_audio_path = None
    return {"removed": removed, "errors": errors}


def cleanup_task_artifacts(db: Session, task_id: str) -> dict[str, Any] | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        _require_not_active(row, "clean up artifacts for")
        result = _cleanup_task_artifacts_for_row(db, row)
        db.commit()
        return result


def relink_task_media(db: Session, task_id: str, *, path: Path) -> TranscriptionTaskResponse | None:
    with _task_transition_lock:
        db.expire_all()
        row = get_task_row(db, task_id)
        if row is None:
            return None
        _require_not_active(row, "relink media for")
        source_path = Path(path).expanduser()
        if not source_path.is_file():
            raise FileNotFoundError(f"Audio file not found: {path}")
        source_path = source_path.resolve(strict=True)
        # Stale derived audio was generated from the previous source; invalidate it.
        _cleanup_task_artifacts_for_row(db, row)
        row.audio_path = config.to_storage_path(source_path)
        options = _read_options(row)
        options["_source_kind"] = "external"
        _write_options(row, options)
        row.updated_at = _utc_now()
        task_logs.add_log(
            db,
            row.id,
            "relink",
            "info",
            f"Task media relinked to {source_path}",
            {},
            commit=False,
        )
        db.commit()
        db.refresh(row)
    return to_response(db, row)


def create_batch_tasks(
    db: Session,
    *,
    files: list[tuple[str, BinaryIO]],
    backend: str,
    model_name: str | None,
    provider_id: str | None,
    language: str | None,
    output_formats: list[str],
    options: dict[str, Any] | None = None,
) -> tuple[str, list[TranscriptionTaskResponse], list[dict[str, str]]]:
    batch = TranscriptionBatch(
        id=str(uuid.uuid4()),
        options_json=json.dumps(
            {
                "backend": backend,
                "model_name": model_name,
                "provider_id": provider_id,
                "language": language,
                "output_formats": output_formats,
                **(options or {}),
            },
            ensure_ascii=False,
        ),
    )
    db.add(batch)
    db.commit()
    items: list[TranscriptionTaskResponse] = []
    failures: list[dict[str, str]] = []
    for filename, file_obj in files:
        try:
            items.append(
                create_task_from_file(
                    db,
                    filename=filename,
                    file_obj=file_obj,
                    backend=backend,
                    model_name=model_name,
                    provider_id=provider_id,
                    language=language,
                    output_formats=output_formats,
                    options=options,
                    batch_id=batch.id,
                )
            )
        except Exception as exc:
            failures.append({"filename": filename, "error": str(exc)})
    return batch.id, items, failures


def batch_status(db: Session, batch_id: str):
    batch = db.query(TranscriptionBatch).filter(TranscriptionBatch.id == batch_id).first()
    if batch is None:
        return None
    rows = db.query(TranscriptionTask).filter(TranscriptionTask.batch_id == batch_id).order_by(TranscriptionTask.created_at.asc()).all()
    total = len(rows)
    completed = sum(1 for row in rows if row.status == "completed")
    failed = sum(1 for row in rows if row.status in ("failed", "failed_resumable", "interrupted"))
    queued = sum(1 for row in rows if row.status == "queued")
    running = sum(1 for row in rows if row.status in ACTIVE_TASK_STATUSES and row.status != "queued")
    progress = round(sum(row.progress or 0 for row in rows) / total, 2) if total else 0
    return {
        "id": batch.id,
        "name": batch.name,
        "total": total,
        "completed": completed,
        "failed": failed,
        "queued": queued,
        "running": running,
        "retryable": failed,
        "progress": progress,
        "items": [to_response(db, row) for row in rows],
    }


def retry_failed_batch(db: Session, batch_id: str):
    status = batch_status(db, batch_id)
    if status is None:
        return None
    for task in status["items"]:
        if task.status in ("failed", "failed_resumable", "interrupted", "cancelled"):
            retry_task(db, task.id)
    return batch_status(db, batch_id)


def task_as_dict(task: TranscriptionTaskResponse) -> dict[str, Any]:
    return task.model_dump()
