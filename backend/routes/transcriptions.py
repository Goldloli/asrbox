from __future__ import annotations

import json
import shutil
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.database.models import ASRProvider
from backend import config
from backend.models import BatchFailure, BatchTranscriptionResponse, ModelRecommendationRequest, TranscriptionPreflightResponse, TranscriptionReadinessResponse
from backend.services.errors import ASRboxError
from backend.services.media import preflight_media
from backend.services import models as model_service
from backend.services import providers as provider_service
from backend.services import settings as settings_service
from backend.services import tasks as task_service
from backend.services.platform import detect_runtime

router = APIRouter(prefix="/transcriptions", tags=["transcriptions"])


def _parse_output_formats(output_formats: str | None) -> list[str]:
    parsed_formats = ["txt", "srt"]
    if output_formats:
        try:
            parsed = json.loads(output_formats)
            if isinstance(parsed, list) and parsed:
                parsed_formats = [str(item) for item in parsed]
        except json.JSONDecodeError:
            parsed_formats = [item.strip() for item in output_formats.split(",") if item.strip()]
    return parsed_formats


def _check(key: str, ok: bool, message: str, action: str | None = None, warning: bool = False) -> dict:
    return {
        "key": key,
        "status": "ok" if ok else ("warning" if warning else "error"),
        "message": message,
        "action": action,
    }


def _writable(path: Path) -> bool:
    try:
        path.mkdir(parents=True, exist_ok=True)
        probe = path / ".asrbox-write-test"
        probe.write_text("ok", encoding="utf-8")
        probe.unlink(missing_ok=True)
        return True
    except OSError:
        return False


@router.get("/readiness", response_model=TranscriptionReadinessResponse)
def transcription_readiness(db: Session = Depends(get_db)):
    settings = settings_service.get_settings(db)
    runtime = detect_runtime()
    checks = [
        _check("ffmpeg", bool(runtime.get("ffmpeg_available")), "ffmpeg is available" if runtime.get("ffmpeg_available") else "ffmpeg is not available", "Install ffmpeg and make sure it is in PATH"),
        _check("ffprobe", bool(runtime.get("ffprobe_available")), "ffprobe is available" if runtime.get("ffprobe_available") else "ffprobe is not available", "Install ffmpeg/ffprobe and make sure it is in PATH"),
        _check("uploads_writable", _writable(config.get_uploads_dir()), "Uploads directory is writable", "Check ASRBOX_DATA_DIR permissions"),
        _check("exports_writable", _writable(config.get_exports_dir()), "Exports directory is writable", "Check ASRBOX_DATA_DIR permissions"),
    ]
    try:
        free_disk = shutil.disk_usage(config.get_data_dir()).free
        checks.append(_check("disk_space", free_disk > 1024 * 1024 * 1024, "Free disk space is sufficient" if free_disk > 1024 * 1024 * 1024 else "Free disk space is below 1GB", "Free disk space before large transcriptions"))
    except OSError:
        checks.append(_check("disk_space", False, "Could not inspect free disk space", "Check data directory permissions", warning=True))
    recommendation = model_service.recommend_model(
        ModelRecommendationRequest(language=settings.default_language, local_only=True)
    ).model_dump()
    if settings.default_backend == "provider":
        provider_id = settings.default_provider_id or "bcut"
        row = db.query(ASRProvider).filter(ASRProvider.id == provider_id).first()
        if row is None:
            checks.append(_check("provider", False, f"Provider {provider_id} is not configured", "Configure a provider or switch to local ASR"))
            return TranscriptionReadinessResponse(
                backend="provider",
                ready=False,
                message=f"Provider {provider_id} is not configured",
                provider={"id": provider_id},
                recommended_model=recommendation,
                checks=checks,
            )
        response = provider_service.to_response(row)
        health = provider_service.test_provider(db, row.id)
        provider_ready = bool(row.enabled and health and health.ok)
        checks.append(
            _check(
                "provider",
                provider_ready,
                health.message if health else "Provider is not available",
                "Enable provider and complete credentials",
            )
        )
        return TranscriptionReadinessResponse(
            backend="provider",
            ready=bool(provider_ready and all(item["status"] != "error" for item in checks)),
            message=health.message if health else "Provider is not available",
            provider=response.model_dump(),
            recommended_model=recommendation,
            checks=checks,
        )

    model_name = settings.default_model_name or "whisper-base"
    model_config = model_service.get_model_config(model_name)
    downloaded = model_service.is_model_downloaded(model_name) if model_config else False
    status = next((item for item in model_service.list_model_statuses() if item.model_name == model_name), None)
    compatible = model_service.check_model_compatibility(model_name) if model_config else {"compatible": False}
    checks.append(
        _check(
            "default_model",
            bool(model_config and downloaded and compatible["compatible"]),
            "Default local model is ready" if model_config and downloaded and compatible["compatible"] else (compatible.get("message") or f"Model {model_name} is not downloaded"),
            "Download or repair the default model",
        )
    )
    if status and status.downloading:
        checks.append(_check("model_download", False, f"Model {model_name} is currently downloading", "Wait for download to complete", warning=True))
    ready = bool(model_config and downloaded and compatible["compatible"] and all(item["status"] != "error" for item in checks))
    return TranscriptionReadinessResponse(
        backend="local",
        ready=ready,
        message="Ready" if downloaded and compatible["compatible"] else (compatible.get("message") or f"Model {model_name} is not downloaded"),
        model={
            "model_name": model_name,
            "display_name": model_config.display_name if model_config else model_name,
            "downloaded": downloaded,
            "compatible": compatible.get("compatible"),
            "downloading": bool(status.downloading) if status else False,
            "error": status.error if status else None,
        },
        recommended_model=recommendation,
        checks=checks,
    )


@router.post("/preflight", response_model=TranscriptionPreflightResponse)
def transcription_preflight(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    suffix = Path(file.filename or "audio").suffix or ".audio"
    path = config.get_uploads_dir() / f"preflight-{uuid.uuid4()}{suffix}"
    try:
        with path.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                output.write(chunk)
        result = preflight_media(path)
    except ASRboxError as exc:
        raise HTTPException(status_code=400, detail={"error_code": exc.code, "message": exc.message}) from exc
    finally:
        path.unlink(missing_ok=True)
    settings = settings_service.get_settings(db)
    readiness = transcription_readiness(db).model_dump()
    return TranscriptionPreflightResponse(
        filename=file.filename or "audio",
        supported_format=bool(result.get("supported_format")),
        has_audio_stream=bool(result.get("has_audio_stream")),
        duration_ms=result.get("duration_ms"),
        audio_codec=result.get("audio_codec"),
        sample_rate=result.get("sample_rate"),
        channels=result.get("channels"),
        peak_volume_db=result.get("peak_volume_db"),
        mean_volume_db=result.get("mean_volume_db"),
        near_silence=bool(result.get("near_silence")),
        needs_normalization=bool(result.get("needs_normalization")),
        will_chunk=bool(result.get("will_chunk")),
        chunk_count=int(result.get("chunk_count") or 0),
        warnings=list(result.get("warnings") or []),
        readiness={**readiness, "default_language": settings.default_language},
    )


@router.post("")
def create_transcription(
    file: UploadFile = File(...),
    backend: str = Form("local"),
    model_name: str | None = Form(None),
    provider_id: str | None = Form(None),
    language: str | None = Form(None),
    output_formats: str | None = Form(None),
    vad: bool | None = Form(None),
    word_timestamps: bool | None = Form(None),
    db: Session = Depends(get_db),
):
    options = {}
    if vad is not None:
        options["vad"] = vad
    if word_timestamps is not None:
        options["word_timestamps"] = word_timestamps
    return task_service.create_task_from_file(
        db,
        filename=file.filename or "audio",
        file_obj=file.file,
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=_parse_output_formats(output_formats),
        options=options,
    )


@router.post("/batch", response_model=BatchTranscriptionResponse)
def create_batch_transcriptions(
    files: list[UploadFile] = File(...),
    backend: str = Form("local"),
    model_name: str | None = Form(None),
    provider_id: str | None = Form(None),
    language: str | None = Form(None),
    output_formats: str | None = Form(None),
    vad: bool | None = Form(None),
    word_timestamps: bool | None = Form(None),
    db: Session = Depends(get_db),
):
    options = {}
    if vad is not None:
        options["vad"] = vad
    if word_timestamps is not None:
        options["word_timestamps"] = word_timestamps
    batch_id, items, failures = task_service.create_batch_tasks(
        db,
        files=[(file.filename or "audio", file.file) for file in files],
        backend=backend,
        model_name=model_name,
        provider_id=provider_id,
        language=language,
        output_formats=_parse_output_formats(output_formats),
        options=options,
    )
    return BatchTranscriptionResponse(
        items=items,
        failures=[BatchFailure(**failure) for failure in failures],
        total=len(items),
        batch_id=batch_id,
    )
