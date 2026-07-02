from __future__ import annotations

from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ASRSettingsResponse, ASRSettingsUpdate
from backend.services import settings as settings_service

router = APIRouter(prefix="/settings", tags=["settings"])


@router.get("/asr", response_model=ASRSettingsResponse)
async def get_asr_settings(db: Session = Depends(get_db)):
    return settings_service.get_settings(db)


@router.put("/asr", response_model=ASRSettingsResponse)
async def update_asr_settings(payload: ASRSettingsUpdate, db: Session = Depends(get_db)):
    return settings_service.update_settings(db, payload.model_dump(exclude_unset=True))

