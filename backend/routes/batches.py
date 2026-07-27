from __future__ import annotations

import io
import re
import zipfile

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from backend.database import get_db
from backend.models import BatchStatusResponse
from backend.services import exports as export_service
from backend.services import tasks as task_service

router = APIRouter(prefix="/batches", tags=["batches"])


def _safe_archive_stem(filename: str, fallback: str) -> str:
    leaf = filename.replace("\\", "/").rsplit("/", 1)[-1]
    stem = leaf.rsplit(".", 1)[0]
    stem = re.sub(r"[\x00-\x1f\x7f/:\\]+", "-", stem)
    stem = re.sub(r"\s+", " ", stem).strip(" .-_")
    return (stem or fallback)[:120]


@router.get("/{batch_id}", response_model=BatchStatusResponse)
async def get_batch(batch_id: str, db: Session = Depends(get_db)):
    status = task_service.batch_status(db, batch_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return BatchStatusResponse(**status)


@router.post("/{batch_id}/retry-failed", response_model=BatchStatusResponse)
async def retry_failed(batch_id: str, db: Session = Depends(get_db)):
    status = task_service.retry_failed_batch(db, batch_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    return BatchStatusResponse(**status)


@router.get("/{batch_id}/export.zip")
async def export_batch_zip(batch_id: str, db: Session = Depends(get_db)):
    status = task_service.batch_status(db, batch_id)
    if status is None:
        raise HTTPException(status_code=404, detail="Batch not found")
    buffer = io.BytesIO()
    with zipfile.ZipFile(buffer, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for task in status["items"]:
            if task.status != "completed":
                continue
            stem = _safe_archive_stem(task.filename, task.id)
            archive.writestr(f"{stem}-{task.id}.txt", export_service.render_txt(task.filename, task.segments))
            archive.writestr(f"{stem}-{task.id}.srt", export_service.render_srt(task.segments))
            archive.writestr(f"{stem}-{task.id}.vtt", export_service.render_vtt(task.segments))
            archive.writestr(f"{stem}-{task.id}.json", export_service.render_json(task.model_dump(), task.segments))
    buffer.seek(0)
    return StreamingResponse(
        buffer,
        media_type="application/zip",
        headers={"Content-Disposition": f'attachment; filename="{batch_id}.zip"'},
    )
