from __future__ import annotations

import shutil
from pathlib import Path

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse

from backend import config
from backend.models import ModelDownloadRequest, ModelMigrateRequest, ModelStatusListResponse
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


@router.delete("/{model_name}")
async def delete_model(model_name: str):
    model_service.delete_model(model_name)
    return {"message": f"Model {model_name} deleted"}


@router.post("/migrate")
async def migrate_models(request: ModelMigrateRequest):
    destination = Path(request.destination)
    destination.mkdir(parents=True, exist_ok=True)
    moved = 0
    for item in config.get_models_dir().iterdir():
        target = destination / item.name
        if target.exists():
            shutil.rmtree(target)
        shutil.move(str(item), str(target))
        moved += 1
    return {"source": str(config.get_models_dir()), "destination": str(destination), "moved": moved, "errors": []}
