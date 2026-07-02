from __future__ import annotations

import json
import shutil
import subprocess
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
from backend.services.transcribe import transcribe_placeholder, transcribe_with_local_model

CHUNK_SIZE = 1024 * 1024
LOCAL_PROGRESS_INTERVAL_SECONDS = 5.0
ACTIVE_TASK_STATUSES = {
    "queued",
    "preprocessing",
    "waiting_model",
    "downloading_model",
    "transcribing",
    "postprocessing",
    "exporting",
}


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
    thread = threading.Thread(target=_run_task_in_background, args=(task_id,), daemon=True)
    thread.start()


def _run_task_in_background(task_id: str) -> None:
    if db_session.SessionLocal is None:
        db_session.init_db()
    db = db_session.SessionLocal()
    try:
        row = get_task_row(db, task_id)
        if row is not None:
            run_task(db, row)
    finally:
        db.close()


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


def normalize_media_for_asr(path: Path) -> Path:
    if path.suffix.lower() == ".mp3":
        return path

    target = path.with_suffix(".mp3")
    command = [
        "ffmpeg",
        "-i",
        str(path),
        "-ac",
        "1",
        "-f",
        "mp3",
        "-af",
        "aresample=async=1",
        "-y",
        str(target),
    ]
    try:
        subprocess.run(command, capture_output=True, check=True, encoding="utf-8", errors="replace")
    except FileNotFoundError as exc:
        raise RuntimeError("ffmpeg is required to extract audio from video files") from exc
    except subprocess.CalledProcessError as exc:
        detail = exc.stderr.strip() or exc.stdout.strip() or str(exc)
        raise RuntimeError(f"Failed to extract audio with ffmpeg: {detail}") from exc
    return target


def _transcribe_with_provider(db: Session, row: TranscriptionTask):
    provider_id = row.provider_id or "bcut"
    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise RuntimeError("Task audio file not found")

    normalized_path = normalize_media_for_asr(audio_path)
    if normalized_path != audio_path:
        row.normalized_audio_path = config.to_storage_path(normalized_path)
        db.commit()

    if provider_id == "bcut":
        return BcutProvider().transcribe(
            str(normalized_path),
            {"language": row.language, "provider_id": provider_id},
        )
    raise RuntimeError(f"Provider {provider_id} transcription is not implemented")


def _transcribe_with_local_model(db: Session, row: TranscriptionTask):
    model_name = row.model_name or "whisper-base"
    audio_path = config.resolve_storage_path(row.audio_path)
    if audio_path is None:
        raise RuntimeError("Task audio file not found")

    normalized_path = normalize_media_for_asr(audio_path)
    if normalized_path != audio_path:
        row.normalized_audio_path = config.to_storage_path(normalized_path)
        db.commit()

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
            {"language": row.language},
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
        row.status = "postprocessing"
        row.progress = 90
        row.text = result.text
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
