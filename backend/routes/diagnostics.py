from __future__ import annotations

from fastapi import APIRouter

from backend.models import ErrorCodeItem, ErrorCodeListResponse
from backend.services import diagnostics as diagnostics_service

router = APIRouter(prefix="/diagnostics", tags=["diagnostics"])


@router.get("/error-codes", response_model=ErrorCodeListResponse)
async def error_codes():
    return ErrorCodeListResponse(items=[ErrorCodeItem(**item) for item in diagnostics_service.error_code_items()])
