from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import StorageBackupRequest, StorageBackupResponse, StorageCleanupRequest, StorageCleanupResponse, StorageRestoreRequest, StorageUsageResponse
from backend.services import storage as storage_service

router = APIRouter(prefix="/storage", tags=["storage"])


@router.get("/usage", response_model=StorageUsageResponse)
async def storage_usage(db: Session = Depends(get_db)):
    return StorageUsageResponse(**storage_service.usage(db))


@router.post("/cleanup", response_model=StorageCleanupResponse)
async def cleanup_storage(request: StorageCleanupRequest, db: Session = Depends(get_db)):
    return StorageCleanupResponse(**storage_service.cleanup(db, **request.model_dump()))


@router.post("/cleanup/dry-run", response_model=StorageCleanupResponse)
async def cleanup_storage_dry_run(request: StorageCleanupRequest, db: Session = Depends(get_db)):
    return StorageCleanupResponse(**storage_service.cleanup(db, **request.model_dump(), dry_run=True))


@router.post("/backup", response_model=StorageBackupResponse)
async def backup_storage(request: StorageBackupRequest, db: Session = Depends(get_db)):
    return StorageBackupResponse(**storage_service.backup(db, **request.model_dump()))


@router.post("/restore")
async def restore_storage(request: StorageRestoreRequest):
    try:
        return storage_service.restore(request.backup_path)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
