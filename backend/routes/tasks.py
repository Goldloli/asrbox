from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from backend import config
from backend.database import get_db
from backend.models import TaskListResponse, TaskRetranscribeRequest
from backend.services import exports as export_service
from backend.services import tasks as task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(db: Session = Depends(get_db)):
    items, total = task_service.list_tasks(db)
    return TaskListResponse(items=items, total=total)


@router.get("/{task_id}")
async def get_task(task_id: str, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/events")
async def task_events(task_id: str, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    payload = {
        "task_id": task.id,
        "status": task.status,
        "progress": task.progress,
        "error": task.error,
    }
    return PlainTextResponse(f"data: {json.dumps(payload)}\n\n", media_type="text/event-stream")


@router.post("/{task_id}/cancel")
async def cancel_task(task_id: str, db: Session = Depends(get_db)):
    task = task_service.cancel_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/retry")
async def retry_task(task_id: str, db: Session = Depends(get_db)):
    task = task_service.retry_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/retranscribe")
async def retranscribe_task(task_id: str, request: TaskRetranscribeRequest, db: Session = Depends(get_db)):
    task = task_service.retranscribe_task(
        db,
        task_id,
        backend=request.backend,
        model_name=request.model_name,
        provider_id=request.provider_id,
        language=request.language,
        output_formats=request.output_formats,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}")
async def delete_task(task_id: str, db: Session = Depends(get_db)):
    if not task_service.delete_task(db, task_id):
        raise HTTPException(status_code=404, detail="Task not found")
    return {"message": f"Task {task_id} deleted"}


@router.get("/{task_id}/audio")
async def task_audio(task_id: str, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    path = config.resolve_storage_path(task.audio_path)
    if path is None or not path.exists():
        raise HTTPException(status_code=404, detail="Audio not found")
    return FileResponse(path)


@router.get("/{task_id}/export/{fmt}")
async def export_task(task_id: str, fmt: str, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    fmt = fmt.lower()
    if fmt == "txt":
        return PlainTextResponse(export_service.render_txt(task.filename, task.segments))
    if fmt == "srt":
        return PlainTextResponse(export_service.render_srt(task.segments))
    if fmt == "vtt":
        return PlainTextResponse(export_service.render_vtt(task.segments))
    if fmt == "ass":
        return PlainTextResponse(export_service.render_ass(task.segments))
    if fmt == "md" or fmt == "markdown":
        return PlainTextResponse(export_service.render_markdown(task.filename, task.segments))
    if fmt == "json":
        return Response(
            export_service.render_json(task_service.task_as_dict(task), task.segments),
            media_type="application/json",
        )
    raise HTTPException(status_code=400, detail=f"Unsupported export format: {fmt}")
