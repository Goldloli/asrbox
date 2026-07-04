from __future__ import annotations

import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, File, HTTPException, UploadFile
from sqlalchemy.orm import Session

from backend import config
from backend.database import get_db
from backend.models import ProviderCreate, ProviderListResponse, ProviderResponse, ProviderTranscriptionTestResponse, ProviderUpdate
from backend.providers.base import ProviderError
from backend.services import providers as provider_service

router = APIRouter(prefix="/providers", tags=["providers"])


@router.get("", response_model=ProviderListResponse)
async def list_providers(db: Session = Depends(get_db)):
    return ProviderListResponse(items=provider_service.list_providers(db))


@router.post("", response_model=ProviderResponse)
async def create_provider(payload: ProviderCreate, db: Session = Depends(get_db)):
    return provider_service.create_provider(db, payload)


@router.put("/{provider_id}", response_model=ProviderResponse)
async def update_provider(provider_id: str, payload: ProviderUpdate, db: Session = Depends(get_db)):
    provider = provider_service.update_provider(db, provider_id, payload)
    if provider is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return provider


@router.delete("/{provider_id}")
async def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    if not provider_service.delete_provider(db, provider_id):
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"message": f"Provider {provider_id} deleted"}


@router.post("/{provider_id}/test")
async def test_provider(provider_id: str, db: Session = Depends(get_db)):
    health = provider_service.test_provider(db, provider_id)
    if health is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return health


@router.post("/{provider_id}/test-transcription", response_model=ProviderTranscriptionTestResponse)
async def test_provider_transcription(provider_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)):
    suffix = Path(file.filename or "audio").suffix or ".audio"
    path = config.get_uploads_dir() / f"provider-test-{uuid.uuid4()}{suffix}"
    try:
        with path.open("wb") as output:
            while chunk := file.file.read(1024 * 1024):
                output.write(chunk)
        result = provider_service.transcribe_with_provider(db, provider_id, str(path), {"provider_id": provider_id})
        return ProviderTranscriptionTestResponse(
            ok=True,
            provider_id=provider_id,
            stage="parse",
            message="Provider transcription test completed",
            text_preview=(result.text or "")[:500],
            segments_count=len(result.segments),
            response_preview=result.raw_result_summary,
        )
    except ProviderError as exc:
        return ProviderTranscriptionTestResponse(
            ok=False,
            provider_id=provider_id,
            stage=exc.stage or "provider",
            message=str(exc),
            error_code=exc.code,
        )
    except Exception as exc:
        return ProviderTranscriptionTestResponse(
            ok=False,
            provider_id=provider_id,
            stage="provider",
            message=str(exc),
        )
    finally:
        path.unlink(missing_ok=True)


@router.get("/{provider_id}/models")
async def provider_models(provider_id: str, db: Session = Depends(get_db)):
    health = provider_service.test_provider(db, provider_id)
    if health is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"items": health.models}
