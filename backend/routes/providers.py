from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import ProviderCreate, ProviderListResponse, ProviderResponse, ProviderUpdate
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


@router.get("/{provider_id}/models")
async def provider_models(provider_id: str, db: Session = Depends(get_db)):
    health = provider_service.test_provider(db, provider_id)
    if health is None:
        raise HTTPException(status_code=404, detail="Provider not found")
    return {"items": health.models}

