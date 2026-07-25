from __future__ import annotations

import asyncio
import os
import shutil
import signal

from fastapi import APIRouter

from backend import __version__, config
from backend.models import DirectoryCheck, FilesystemHealthResponse, HealthResponse
from backend.services.tasks import list_tasks
from backend.services import model_storage
from backend.database.session import SessionLocal

router = APIRouter()


@router.get("/api-info")
async def api_info():
    return {"message": "ASRbox API", "version": __version__}


@router.get("/health", response_model=HealthResponse)
async def health():
    active_tasks = 0
    if SessionLocal is not None:
        db = SessionLocal()
        try:
            tasks, _total = list_tasks(db)
            active_tasks = len([task for task in tasks if task.status not in {"completed", "failed", "cancelled"}])
        finally:
            db.close()
    return HealthResponse(
        status="healthy",
        version=__version__,
        port=config.DEFAULT_PORT,
        backend_type="web-first",
        gpu_available=False,
        active_tasks=active_tasks,
        data_dir=str(config.get_data_dir()),
        models_dir=str(config.get_models_dir()),
    )


@router.get("/health/filesystem", response_model=FilesystemHealthResponse)
async def filesystem_health():
    directories = {
        "data": config.get_data_dir(),
        "uploads": config.get_uploads_dir(),
        "audio": config.get_audio_dir(),
        "exports": config.get_exports_dir(),
        "cache": config.get_cache_dir(),
        "models": config.get_models_dir(),
    }
    checks: list[DirectoryCheck] = []
    healthy = True
    for label, path in directories.items():
        error = None
        writable = False
        if label == "models" and not model_storage.inspect_storage()["available"]:
            healthy = False
            checks.append(DirectoryCheck(label=label, path=str(path), exists=False, writable=False, error="MODEL_STORAGE_UNAVAILABLE"))
            continue
        try:
            path.mkdir(parents=True, exist_ok=True)
            probe = path / ".asrbox_probe"
            probe.write_text("ok", encoding="utf-8")
            probe.unlink(missing_ok=True)
            writable = True
        except OSError as exc:
            error = str(exc)
            healthy = False
        checks.append(
            DirectoryCheck(
                label=label,
                path=str(path),
                exists=path.exists(),
                writable=writable,
                error=error,
            )
        )
    disk_free_mb = None
    disk_total_mb = None
    try:
        usage = shutil.disk_usage(config.get_data_dir())
        disk_free_mb = round(usage.free / 1024 / 1024, 1)
        disk_total_mb = round(usage.total / 1024 / 1024, 1)
    except OSError:
        healthy = False
    return FilesystemHealthResponse(
        healthy=healthy,
        disk_free_mb=disk_free_mb,
        disk_total_mb=disk_total_mb,
        directories=checks,
    )


@router.post("/shutdown")
async def shutdown():
    async def _shutdown():
        await asyncio.sleep(0.1)
        os.kill(os.getpid(), signal.SIGTERM)

    asyncio.create_task(_shutdown())
    return {"message": "Shutting down..."}
