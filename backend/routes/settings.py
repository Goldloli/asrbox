from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ASRSettingsResponse, ASRSettingsUpdate, MediaStorageSettingsResponse, MediaStorageSettingsUpdate
from backend.services import media_storage as media_storage_service
from backend.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/asr", response_model=ASRSettingsResponse)
async def get_asr_settings(db: Session = Depends(get_db)):
    return settings_service.get_settings(db)


@router.put("/asr", response_model=ASRSettingsResponse)
async def update_asr_settings(payload: ASRSettingsUpdate, db: Session = Depends(get_db)):
    return settings_service.update_settings(db, payload.model_dump(exclude_unset=True))


@router.get("/media-storage", response_model=MediaStorageSettingsResponse)
async def get_media_storage_settings():
    return media_storage_service.inspect_media_storage()


@router.put("/media-storage", response_model=MediaStorageSettingsResponse)
async def update_media_storage_settings(payload: MediaStorageSettingsUpdate):
    try:
        return media_storage_service.update_media_storage_settings(payload.model_dump(exclude_unset=True))
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

