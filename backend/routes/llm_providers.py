from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.database import get_db
from backend.models import (
    LLMProviderCreate,
    LLMCapabilityTestResponse,
    LLMProviderListResponse,
    LLMProviderPresetListResponse,
    LLMProviderResponse,
    LLMProviderTestResponse,
    LLMProviderUpdate,
)
from backend.services import llm_providers

router = APIRouter(prefix="/llm-providers", tags=["llm-providers"])


@router.get("/presets", response_model=LLMProviderPresetListResponse)
async def list_presets():
    return LLMProviderPresetListResponse(items=llm_providers.list_presets())


@router.get("", response_model=LLMProviderListResponse)
async def list_providers(db: Session = Depends(get_db)):
    return LLMProviderListResponse(items=llm_providers.list_providers(db))


@router.post("", response_model=LLMProviderResponse)
async def create_provider(payload: LLMProviderCreate, db: Session = Depends(get_db)):
    try:
        return llm_providers.create_provider(db, payload)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.put("/{provider_id}", response_model=LLMProviderResponse)
async def update_provider(
    provider_id: str,
    payload: LLMProviderUpdate,
    db: Session = Depends(get_db),
):
    try:
        provider = llm_providers.update_provider(db, provider_id, payload)
    except llm_providers.LLMProviderError as exc:
        raise HTTPException(status_code=409, detail={"code": exc.code, "message": exc.message}) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    if provider is None:
        raise HTTPException(status_code=404, detail="LLM provider not found")
    return provider


@router.delete("/{provider_id}")
async def delete_provider(provider_id: str, db: Session = Depends(get_db)):
    if not llm_providers.delete_provider(db, provider_id):
        raise HTTPException(status_code=404, detail="LLM provider not found")
    return {"message": f"LLM provider {provider_id} deleted"}


@router.post("/{provider_id}/test", response_model=LLMProviderTestResponse)
async def test_provider(provider_id: str, db: Session = Depends(get_db)):
    result = await run_in_threadpool(llm_providers.test_provider, db, provider_id)
    if result is None:
        raise HTTPException(status_code=404, detail="LLM provider not found")
    return result


@router.post("/{provider_id}/test-capabilities", response_model=LLMCapabilityTestResponse)
async def test_capabilities(provider_id: str, db: Session = Depends(get_db)):
    from backend.services.llm_capabilities import test_capabilities as check
    result = await run_in_threadpool(check, db, provider_id)
    if result is None:
        raise HTTPException(status_code=404, detail="LLM provider not found")
    return result
