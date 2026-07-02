from __future__ import annotations

import json

from fastapi import APIRouter, Depends, File, Form, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.database.models import ASRProvider
from backend.models import TranscriptionReadinessResponse
from backend.services import models as model_service
from backend.services import providers as provider_service
from backend.services import settings as settings_service
from backend.services import tasks as task_service

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


@router.get("/readiness", response_model=TranscriptionReadinessResponse)
def transcription_readiness(db: Session = Depends(get_db)):
    settings = settings_service.get_settings(db)
    if settings.default_backend == "provider":
        provider_id = settings.default_provider_id or "bcut"
        row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
        if row is None:
            return TranscriptionReadinessResponse(
                backend="provider",
                ready=False,
                message=f"Provider {provider_id} is not configured",
                provider={"id": provider_id},
            )
        response = provider_service.to_response(row)
        health = provider_service.test_provider(db, row.id)
        return TranscriptionReadinessResponse(
            backend="provider",
            ready=bool(row.enabled and health and health.ok),
            message=health.message if health else "Provider is not available",
            provider=response.model_dump(),
        )

    model_name = settings.default_model_name or "whisper-base"
    model_config = model_service.get_model_config(model_name)
    downloaded = model_service.is_model_downloaded(model_name) if model_config else False
    status = next((item for item in model_service.list_model_statuses() if item.model_name == model_name), None)
    return TranscriptionReadinessResponse(
        backend="local",
        ready=bool(model_config and downloaded),
        message="Ready" if downloaded else f"Model {model_name} is not downloaded",
        model={
            "model_name": model_name,
            "display_name": model_config.display_name if model_config else model_name,
            "downloaded": downloaded,
            "downloading": bool(status.downloading) if status else False,
            "error": status.error if status else None,
        },
    )


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
