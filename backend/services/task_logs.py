from __future__ import annotations

import json
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import TaskLog
from backend.models import TaskLogResponse

SECRET_TOKENS = ("secret", "token", "key", "password", "authorization")


def _mask(value: Any):
    if isinstance(value, dict):
        masked = {}
        for key, item in value.items():
            if any(token in key.lower() for token in SECRET_TOKENS):
                masked[key] = "***"
            else:
                masked[key] = _mask(item)
        return masked
    if isinstance(value, list):
        return [_mask(item) for item in value]
    return value


def add_log(db: Session, task_id: str, stage: str, level: str, message: str, data: dict[str, Any] | None = None) -> TaskLog:
    row = TaskLog(
        task_id=task_id,
        stage=stage,
        level=level,
        message=message,
        data_json=json.dumps(_mask(data or {}), ensure_ascii=False),
    )
    db.add(row)
    db.commit()
    db.refresh(row)
    return row


def to_response(row: TaskLog) -> TaskLogResponse:
    try:
        data = json.loads(row.data_json or "{}")
    except json.JSONDecodeError:
        data = {}
    return TaskLogResponse(
        id=row.id,
        task_id=row.task_id,
        stage=row.stage,
        level=row.level,
        message=row.message,
        data=data,
        created_at=row.created_at,
    )


def list_logs(db: Session, task_id: str) -> list[TaskLogResponse]:
    rows = db.query(TaskLog).filter(TaskLog.task_id == task_id).order_by(TaskLog.created_at.asc(), TaskLog.id.asc()).all()
    return [to_response(row) for row in rows]
