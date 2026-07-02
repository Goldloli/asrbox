from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.services import tasks as task_service

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


@router.post("")
def create_transcription(
    file: UploadFile = File(...),
    backend: str = Form("local"),
    model_name: str | None = Form(None),
    provider_id: str | None = Form(None),
    language: str | None = Form(None),
    output_formats: str | None = Form(None),
    db: Session = Depends(get_db),
):
    parsed_formats = ["txt", "srt"]
    if output_formats:
        try:
            parsed = json.loads(output_formats)
            if isinstance(parsed, list) and parsed:
                parsed_formats = [str(item) for item in parsed]
        except json.JSONDecodeError:
            parsed_formats = [item.strip() for item in output_formats.split(",") if item.strip()]
    return task_service.create_task_from_file(
        db,
        filename=file.filename or "audio",
        file_obj=file.file,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=parsed_formats,
    )
