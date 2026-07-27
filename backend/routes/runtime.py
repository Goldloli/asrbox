from __future__ import annotations

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.database import get_db
from backend.models import RuntimeHealthReportResponse, RuntimeStatusResponse
from backend.services.runtime import diagnostic_bundle, get_runtime_status, health_report

router = APIRouter(prefix="/runtime", tags=["runtime"])


@router.get("/status", response_model=RuntimeStatusResponse)
async def runtime_status():
    return await run_in_threadpool(get_runtime_status)


@router.get("/health-report", response_model=RuntimeHealthReportResponse)
async def runtime_health_report(db: Session = Depends(get_db)):
    return await run_in_threadpool(health_report, db)


@router.get("/diagnostic-bundle.zip")
async def runtime_diagnostic_bundle(db: Session = Depends(get_db)):
    path = await run_in_threadpool(diagnostic_bundle, db)
    return FileResponse(path, media_type="application/zip", filename=path.name)
