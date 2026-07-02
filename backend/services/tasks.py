from __future__ import annotations

import json
import queue
import shutil
import threading
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any, BinaryIO

from sqlalchemy.orm import Session

from backend import config
from backend.database import session as db_session
from backend.database.models import TranscriptSegment as DBSegment
from backend.database.models import TranscriptionTask
from backend.models import TranscriptSegment, TranscriptionTaskResponse
from backend.providers import BcutProvider
from backend.services import models as model_service
from backend.services import settings as settings_service
from backend.services.media import prepare_media_for_asr
from backend.services.transcribe import transcribe_placeholder, transcribe_with_local_model

CHUNK_SIZE = 1024 * 1024
LOCAL_PROGRESS_INTERVAL_SECONDS = 5.0
LOCAL_QUEUE = "local"
PROVIDER_QUEUE = "provider"
ACTIVE_TASK_STATUSES = {
    "queued",
    "preprocessing",
    "waiting_model",
    "downloading_model",
    "transcribing",
    "postprocessing",
    "exporting",
}
_task_queues = {LOCAL_QUEUE: queue.Queue(), PROVIDER_QUEUE: queue.Queue()}
_worker_counts = {LOCAL_QUEUE: 0, PROVIDER_QUEUE: 0}
_queue_lock = threading.Lock()


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
        row.status = "interrupted"
        row.progress = 100
        row.error = "Task was interrupted before the server restarted"
        row.updated_at = datetime.utcnow()
    if rows:
        db.commit()
    return len(rows)


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
        options=options,
        segments=_segments_for_task(db, row.id),
        created_at=row.created_at,
        updated_at=row.updated_at,
        completed_at=row.completed_at,
    )


def _read_options(row: TranscriptionTask) -> dict:
    try:
        return json.loads(row.options_json or "{}")
    except json.JSONDecodeError:
        return {}


def _write_options(row: TranscriptionTask, options: dict) -> None:
    row.options_json = json.dumps(options, ensure_ascii=False)


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
) -> TranscriptionTaskResponse:
    row = TranscriptionTask(
        id=audio_path.stem,
        filename=filename,
        source=backend,
        audio_path=config.to_storage_path(audio_path),
        status="queued",
        progress=0,
        language=language,
        model_name=model_name,
        provider_id=provider_id,
        options_json=json.dumps({"output_formats": output_formats}, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    response = to_response(db, row)
    start_task_in_background(row.id)
    return response


def start_task_in_background(task_id: str) -> None:
    if db_session.SessionLocal is None:
        db_session.init_db()
    db = db_session.SessionLocal()
    try:
        row = get_task_row(db, task_id)
        if row is None:
            return
        settings = settings_service.get_settings(db)
        _ensure_task_workers(settings.max_concurrent_local_tasks, settings.max_concurrent_provider_tasks)
        _task_queues[_queue_name_for_row(row)].put(task_id)
    finally:
        db.close()


def _queue_name_for_row(row: TranscriptionTask) -> str:
    return PROVIDER_QUEUE if row.source == "provider" or row.provider_id else LOCAL_QUEUE


def _ensure_task_workers(local_count: int, provider_count: int) -> None:
    desired = {LOCAL_QUEUE: local_count, PROVIDER_QUEUE: provider_count}
    with _queue_lock:
        for queue_name, count in desired.items():
            while _worker_counts[queue_name] < count:
                thread = threading.Thread(target=_task_worker, args=(queue_name,), daemon=True)
                thread.start()
                _worker_counts[queue_name] += 1


def _task_worker(queue_name: str) -> None:
    work_queue = _task_queues[queue_name]
    while True:
        task_id = work_queue.get()
        try:
            db = db_session.SessionLocal()
            try:
                row = get_task_row(db, task_id)
                if row is not None and row.status != "cancelled":
                    run_task(db, row)
            finally:
                db.close()
        finally:
            work_queue.task_done()


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
) -> TranscriptionTaskResponse:
    task_id = str(uuid.uuid4())
    suffix = Path(filename).suffix or ".audio"
    audio_path = config.get_uploads_dir() / f"{task_id}{suffix}"
    with audio_path.open("wb") as output:
        shutil.copyfileobj(file_obj, output, length=CHUNK_SIZE)
    return _create_task_row(
        db,
        filename=filename,
        audio_path=audio_path,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=output_formats,
    )


def _prepare_task_media(db: Session, row: TranscriptionTask) -> Path:
    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise RuntimeError("Task audio file not found")

    normalized_path, metadata = prepare_media_for_asr(audio_path)
    if normalized_path != audio_path:
        row.normalized_audio_path = config.to_storage_path(normalized_path)
    options = _read_options(row)
    options["audio_metadata"] = metadata
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

    if provider_id == "bcut":
        return BcutProvider().transcribe(
            str(normalized_path),
            {"language": row.language, "provider_id": provider_id},
        )
    raise RuntimeError(f"Provider {provider_id} transcription is not implemented")


def _transcribe_with_local_model(db: Session, row: TranscriptionTask):
    model_name = row.model_name or "whisper-base"
    normalized_path = config.resolve_storage_path(row.normalized_audio_path or row.audio_path)
    if normalized_path is None:
        raise RuntimeError("Task audio file not found")
    settings = settings_service.get_settings(db)
    options = _read_options(row)
    transcribe_options = {
        "language": row.language,
        "vad": options.get("vad", settings.vad),
        "word_timestamps": options.get("word_timestamps", settings.word_timestamps),
    }

    stop_progress = threading.Event()
    progress_thread = threading.Thread(
        target=_advance_local_transcription_progress,
        args=(row.id, stop_progress),
        daemon=True,
    )
    progress_thread.start()
    try:
        return transcribe_with_local_model(
            model_name,
            str(normalized_path),
            transcribe_options,
        )
    finally:
        stop_progress.set()
        progress_thread.join(timeout=LOCAL_PROGRESS_INTERVAL_SECONDS)


def _advance_local_transcription_progress(task_id: str, stop_progress: threading.Event) -> None:
    if db_session.SessionLocal is None:
        db_session.init_db()
    while not stop_progress.wait(LOCAL_PROGRESS_INTERVAL_SECONDS):
        db = db_session.SessionLocal()
        try:
            row = get_task_row(db, task_id)
            if row is None or row.status != "transcribing":
                return
            if row.progress < 88:
                row.progress = min(88, row.progress + 1)
                db.commit()
        finally:
            db.close()


def run_task(db: Session, row: TranscriptionTask) -> None:
    try:
        if row.status == "cancelled":
            return
        row.status = "preprocessing"
        row.progress = 10
        db.commit()
        _prepare_task_media(db, row)
        row.status = "waiting_model" if row.model_name else "transcribing"
        row.progress = 20
        db.commit()
        if row.model_name:
            model_service.ensure_model_ready(row.model_name)
        row.status = "transcribing"
        row.progress = 60
        db.commit()
        if row.source == "provider" or row.provider_id:
            result = _transcribe_with_provider(db, row)
        elif row.source == "local" and row.model_name:
            result = _transcribe_with_local_model(db, row)
        else:
            result = transcribe_placeholder(
                row.filename,
                row.model_name,
                row.provider_id,
                row.language,
            )
        db.refresh(row)
        if row.status == "cancelled":
            return
        row.status = "postprocessing"
        row.progress = 90
        row.text = result.text
        if row.duration_ms is None:
            row.duration_ms = int((result.duration or 0) * 1000)
        db.query(DBSegment).filter(DBSegment.task_id == row.id).delete()
        for segment in result.segments:
            db.add(
                DBSegment(
                    task_id=row.id,
                    idx=segment.id,
                    start_ms=int(segment.start * 1000),
                    end_ms=int(segment.end * 1000),
                    text=segment.text,
                    speaker=segment.speaker,
                    confidence=segment.confidence,
                )
            )
        row.status = "completed"
        row.progress = 100
        row.completed_at = datetime.utcnow()
        db.commit()
    except Exception as exc:
        db.refresh(row)
        if row.status == "cancelled":
            return
        row.status = "failed"
        row.error = str(exc)
        row.progress = 100
        db.commit()


def list_tasks(db: Session) -> tuple[list[TranscriptionTaskResponse], int]:
    rows = db.query(TranscriptionTask).order_by(TranscriptionTask.created_at.desc()).all()
    return [to_response(db, row) for row in rows], len(rows)


def get_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    row = db.query(TranscriptionTask).filter(TranscriptionTask.id == task_id).first()
    return to_response(db, row) if row else None


def get_task_row(db: Session, task_id: str) -> TranscriptionTask | None:
    return db.query(TranscriptionTask).filter(TranscriptionTask.id == task_id).first()


def retry_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    row = get_task_row(db, task_id)
    if row is None:
        return None
    row.status = "queued"
    row.error = None
    row.progress = 0
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
    row = get_task_row(db, task_id)
    if row is None:
        return None
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
    _write_options(row, options)
    row.normalized_audio_path = None
    row.status = "queued"
    row.progress = 0
    row.duration_ms = None
    row.text = None
    row.error = None
    row.completed_at = None
    db.query(DBSegment).filter(DBSegment.task_id == task_id).delete()
    db.commit()
    db.refresh(row)
    response = to_response(db, row)
    start_task_in_background(row.id)
    return response


def cancel_task(db: Session, task_id: str) -> TranscriptionTaskResponse | None:
    row = get_task_row(db, task_id)
    if row is None:
        return None
    if row.status != "completed":
        row.status = "cancelled"
        row.progress = 100
        row.updated_at = datetime.utcnow()
        db.commit()
        db.refresh(row)
    return to_response(db, row)


def delete_task(db: Session, task_id: str) -> bool:
    row = get_task_row(db, task_id)
    if row is None:
        return False
    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path:
        audio_path.unlink(missing_ok=True)
    db.query(DBSegment).filter(DBSegment.task_id == task_id).delete()
    db.delete(row)
    db.commit()
    return True


def task_as_dict(task: TranscriptionTaskResponse) -> dict[str, Any]:
    return task.model_dump()
