from __future__ import annotations

import json
import uuid
from datetime import datetime
from pathlib import Path
from typing import Any

from sqlalchemy.orm import Session

from backend import config
from backend.database.models import TranscriptSegment as DBSegment
from backend.database.models import TranscriptionTask
from backend.models import TranscriptSegment, TranscriptionTaskResponse
from backend.services import models as model_service
from backend.services.transcribe import transcribe_placeholder


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

    row = TranscriptionTask(
        id=task_id,
        filename=filename,
        source=backend,
        audio_path=config.to_storage_path(audio_path),
        status="preprocessing",
        progress=5,
        language=language,
        model_name=model_name,
        provider_id=provider_id,
        options_json=json.dumps({"output_formats": output_formats}, ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)

    run_task(db, row)
    db.refresh(row)
    return to_response(db, row)


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
    run_task(db, row)
    db.refresh(row)
    return to_response(db, row)


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

