from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import TaskDiagnostic
from backend.models import TaskDiagnosticResponse
from backend.services.errors import ERROR_CODES


def _loads(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        parsed = json.loads(value)
    except json.JSONDecodeError:
        return None
    return parsed if isinstance(parsed, dict) else None


def record_task_diagnostic(
    db: Session,
    *,
    task_id: str,
    stage: str,
    message: str,
    error_code: str | None = None,
    command: str | None = None,
    stderr_excerpt: str | None = None,
    model_name: str | None = None,
    provider_id: str | None = None,
    runtime_snapshot: dict[str, Any] | None = None,
    audio_metadata: dict[str, Any] | None = None,
) -> TaskDiagnostic:
    row = TaskDiagnostic(
        task_id=task_id,
        stage=stage,
        error_code=error_code,
        message=message,
        command=command,
        stderr_excerpt=stderr_excerpt[:2000] if stderr_excerpt else None,
        model_name=model_name,
        provider_id=provider_id,
        runtime_snapshot_json=json.dumps(runtime_snapshot, ensure_ascii=False) if runtime_snapshot else None,
        audio_metadata_json=json.dumps(audio_metadata, ensure_ascii=False) if audio_metadata else None,
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def to_response(row: TaskDiagnostic) -> TaskDiagnosticResponse:
    return TaskDiagnosticResponse(
        id=row.id,
        task_id=row.task_id,
        stage=row.stage,
        error_code=row.error_code,
        message=row.message,
        command=row.command,
        stderr_excerpt=row.stderr_excerpt,
        model_name=row.model_name,
        provider_id=row.provider_id,
        runtime_snapshot=_loads(row.runtime_snapshot_json),
        audio_metadata=_loads(row.audio_metadata_json),
        created_at=row.created_at,
    )


def list_task_diagnostics(db: Session, task_id: str) -> list[TaskDiagnosticResponse]:
    rows = (
        db.query(TaskDiagnostic)
        .filter(TaskDiagnostic.task_id == task_id)
        .order_by(TaskDiagnostic.created_at.asc(), TaskDiagnostic.id.asc())
        .all()
    )
    return [to_response(row) for row in rows]


def diagnostics_summary(db: Session, task_id: str) -> list[dict[str, Any]]:
    return [
        {
            "stage": item.stage,
            "error_code": item.error_code,
            "message": item.message,
            "created_at": item.created_at.isoformat() if item.created_at else None,
        }
        for item in list_task_diagnostics(db, task_id)
    ]


def error_code_items() -> list[dict[str, str]]:
    return [{"code": code, "description": description} for code, description in ERROR_CODES.items()]
