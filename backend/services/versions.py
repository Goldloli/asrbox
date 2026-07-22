from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import TranscriptSegment as DBSegment
from backend.database.models import TranscriptVersion, TranscriptionTask
from backend.models import TranscriptSegment, TranscriptVersionResponse


def _segments_for_task(db: Session, task_id: str) -> list[dict[str, Any]]:
    rows = (
        db.query(DBSegment)
        .filter(DBSegment.task_id == task_id)
        .order_by(DBSegment.idx.asc())
        .all()
    )
    return [
        {
            "id": row.idx,
            "start": row.start_ms / 1000,
            "end": row.end_ms / 1000,
            "text": row.text,
            "speaker": row.speaker,
            "confidence": row.confidence,
        }
        for row in rows
    ]


def _loads_dict(value: str | None) -> dict[str, Any]:
    if not value:
        return {}
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return {}
    return parsed if isinstance(parsed, dict) else {}


def create_version(
    db: Session,
    task: TranscriptionTask,
    version_type: str,
    *,
    commit: bool = True,
) -> TranscriptVersion:
    row = TranscriptVersion(
        task_id=task.id,
        version_type=version_type,
        text=task.text,
        segments_json=json.dumps(_segments_for_task(db, task.id), ensure_ascii=False),
        options_json=task.options_json or "{}",
        model_name=task.model_name,
        provider_id=task.provider_id,
    )
    db.add(row)
    if commit:
        db.commit()
        db.refresh(row)
    else:
        db.flush()
    return row


def to_response(row: TranscriptVersion) -> TranscriptVersionResponse:
    try:
        raw_segments = json.loads(row.segments_json or "[]")
    except json.JSONDecodeError:
        raw_segments = []
    segments = [TranscriptSegment(**item) for item in raw_segments if isinstance(item, dict)]
    return TranscriptVersionResponse(
        id=row.id,
        task_id=row.task_id,
        version_type=row.version_type,
        text=row.text,
        segments=segments,
        options=_loads_dict(row.options_json),
        model_name=row.model_name,
        provider_id=row.provider_id,
        created_at=row.created_at,
        summary={
            "text_length": len(row.text or ""),
            "segment_count": len(segments),
        },
    )


def list_versions(db: Session, task_id: str) -> list[TranscriptVersionResponse]:
    rows = (
        db.query(TranscriptVersion)
        .filter(TranscriptVersion.task_id == task_id)
        .order_by(TranscriptVersion.created_at.desc(), TranscriptVersion.id.desc())
        .all()
    )
    return [to_response(row) for row in rows]


def get_version(db: Session, task_id: str, version_id: int) -> TranscriptVersionResponse | None:
    row = (
        db.query(TranscriptVersion)
        .filter(TranscriptVersion.task_id == task_id, TranscriptVersion.id == version_id)
        .first()
    )
    return to_response(row) if row else None


def restore_version(db: Session, task: TranscriptionTask, version_id: int) -> bool:
    version = (
        db.query(TranscriptVersion)
        .filter(TranscriptVersion.task_id == task.id, TranscriptVersion.id == version_id)
        .first()
    )
    if version is None:
        return False
    restored = to_response(version)
    db.query(DBSegment).filter(DBSegment.task_id == task.id).delete()
    for index, segment in enumerate(restored.segments, 1):
        db.add(
            DBSegment(
                task_id=task.id,
                idx=index,
                start_ms=int(segment.start * 1000),
                end_ms=int(segment.end * 1000),
                text=segment.text,
                speaker=segment.speaker,
                confidence=segment.confidence,
            )
        )
    task.text = restored.text
    task.options_json = version.options_json or "{}"
    task.model_name = version.model_name
    task.provider_id = version.provider_id
    db.commit()
    create_version(db, task, "restore")
    return True


def latest_version_id(db: Session, task_id: str) -> int | None:
    row = (
        db.query(TranscriptVersion)
        .filter(TranscriptVersion.task_id == task_id)
        .order_by(TranscriptVersion.created_at.desc(), TranscriptVersion.id.desc())
        .first()
    )
    return row.id if row else None
