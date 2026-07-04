from __future__ import annotations

from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend import config
from backend.database import get_db
from backend.models import (
    ActiveDownloadResponse,
    ModelCompatibilityResponse,
    ModelBenchmarkRequest,
    ModelBenchmarkResponse,
    ModelDownloadRequest,
    ModelMigrateRequest,
    ModelRecommendationRequest,
    ModelRecommendationResponse,
    ModelStatusListResponse,
    ModelStorageResponse,
)
from backend.services import benchmarks as benchmark_service
from backend.services import models as model_service
from backend.utils.progress import get_progress_manager

router = APIRouter(prefix="/models", tags=["models"])


@router.get("/status", response_model=ModelStatusListResponse)
async def model_status():
    return ModelStatusListResponse(models=model_service.list_model_statuses())


@router.get("/cache-dir")
async def cache_dir():
    return {"path": str(config.get_models_dir())}


@router.post("/download")
async def download_model(request: ModelDownloadRequest):
    try:
        message = model_service.download_model(request.model_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": message}


@router.get("/migrate/progress")
async def migrate_progress():
    return model_service.migration_progress()


@router.get("/{model_name}/compatibility", response_model=ModelCompatibilityResponse)
async def model_compatibility(model_name: str):
    result = model_service.check_model_compatibility(model_name)
    if result["message"].startswith("Unknown model"):
        raise HTTPException(status_code=404, detail=result["message"])
    return ModelCompatibilityResponse(**result)


@router.post("/verify", response_model=list[ModelCompatibilityResponse])
async def verify_models():
    return [ModelCompatibilityResponse(**item) for item in model_service.verify_models()]


@router.post("/recommend", response_model=ModelRecommendationResponse)
async def recommend_model(request: ModelRecommendationRequest, db: Session = Depends(get_db)):
    return benchmark_service.recommend_with_benchmarks(db, request)


@router.post("/benchmark", response_model=list[ModelBenchmarkResponse])
async def run_benchmark(request: ModelBenchmarkRequest, db: Session = Depends(get_db)):
    try:
        return benchmark_service.run_benchmark(db, request)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/benchmark", response_model=list[ModelBenchmarkResponse])
async def list_benchmarks(db: Session = Depends(get_db)):
    return benchmark_service.list_benchmarks(db)


@router.delete("/benchmark/{benchmark_id}")
async def delete_benchmark(benchmark_id: int, db: Session = Depends(get_db)):
    if not benchmark_service.delete_benchmark(db, benchmark_id):
        raise HTTPException(status_code=404, detail="Benchmark not found")
    return {"message": f"Benchmark {benchmark_id} deleted"}


@router.get("/active-downloads", response_model=list[ActiveDownloadResponse])
async def active_downloads():
    return [ActiveDownloadResponse(**item) for item in model_service.active_downloads()]


@router.get("/storage", response_model=ModelStorageResponse)
async def model_storage():
    return ModelStorageResponse(**model_service.storage_summary())


@router.post("/cleanup-incomplete")
async def cleanup_incomplete():
    return model_service.cleanup_incomplete()


@router.get("/progress/{model_name}")
async def model_progress(model_name: str):
    manager = get_progress_manager()
    return StreamingResponse(
        manager.subscribe(model_name),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


@router.post("/{model_name}/unload")
async def unload_model(model_name: str):
    unloaded = model_service.unload_model(model_name)
    return {"message": f"Model {model_name} unloaded" if unloaded else f"Model {model_name} was not loaded"}


@router.post("/{model_name}/cancel-download")
async def cancel_download(model_name: str):
    cancelled = model_service.cancel_download(model_name)
    return {"message": f"Model {model_name} download cancelled" if cancelled else f"Model {model_name} is not downloading"}


@router.post("/{model_name}/redownload")
async def redownload_model(model_name: str):
    try:
        message = model_service.redownload_model(model_name)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"message": message}


@router.delete("/{model_name}")
async def delete_model(model_name: str):
    model_service.delete_model(model_name)
    return {"message": f"Model {model_name} deleted"}


@router.post("/migrate")
async def migrate_models(request: ModelMigrateRequest):
    source = Path(request.source) if request.source else None
    destination = Path(request.destination) if request.destination else None
    return model_service.migrate_models(source=source, destination=destination)
