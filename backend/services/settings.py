from __future__ import annotations

import json
from datetime import UTC, datetime
from typing import Any

from sqlalchemy.orm import Session

from backend.database.models import ASRSettings
from backend.models import ASRSettingsResponse

SINGLETON_ID = 1


def _get_or_create(db: Session) -> ASRSettings:
    row = db.query(ASRSettings).filter(ASRSettings.id == SINGLETON_ID).first()
    if row is None:
        row = ASRSettings(id=SINGLETON_ID)
        db.add(row)
        db.commit()
        db.refresh(row)
    return row


def to_response(row: ASRSettings) -> ASRSettingsResponse:
    try:
        output_formats = json.loads(row.output_formats_json or "[]")
    except json.JSONDecodeError:
        output_formats = ["txt", "srt"]
    return ASRSettingsResponse(
        id=row.id,
        default_backend=row.default_backend,
        default_model_name=row.default_model_name,
        default_provider_id=row.default_provider_id,
        default_language=row.default_language,
        timestamps=bool(row.timestamps),
        word_timestamps=bool(row.word_timestamps),
        diarization=bool(row.diarization),
        vad=bool(row.vad),
        output_formats=output_formats,
        max_concurrent_local_tasks=row.max_concurrent_local_tasks,
        max_concurrent_provider_tasks=row.max_concurrent_provider_tasks,
        updated_at=row.updated_at,
    )


def get_settings(db: Session) -> ASRSettingsResponse:
    return to_response(_get_or_create(db))


def update_settings(db: Session, patch: dict[str, Any]) -> ASRSettingsResponse:
    row = _get_or_create(db)
    for key, value in patch.items():
        if key == "output_formats":
            row.output_formats_json = json.dumps(value, ensure_ascii=False)
        elif hasattr(row, key) and value is not None:
            setattr(row, key, value)
    row.updated_at = datetime.now(UTC)
    db.commit()
    db.refresh(row)
    return to_response(row)
