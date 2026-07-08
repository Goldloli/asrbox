from __future__ import annotations

import json

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse, PlainTextResponse, Response
from sqlalchemy.orm import Session

from backend import config
from backend.database import get_db
from backend.models import ActiveTasksResponse, TaskListResponse, TaskLogResponse, TaskPostprocessRequest, TaskQualityResponse, TaskRetranscribeRequest
from backend.models import SegmentCreateRequest, SegmentMergeRequest, SegmentSplitRequest, SegmentUpdateRequest
from backend.services import exports as export_service
from backend.services import tasks as task_service

router = APIRouter(prefix="/tasks", tags=["tasks"])


@router.get("", response_model=TaskListResponse)
async def list_tasks(db: Session = Depends(get_db)):
    items, total = task_service.list_tasks(db)
    return TaskListResponse(items=items, total=total)


@router.get("/active", response_model=ActiveTasksResponse)
async def active_tasks(db: Session = Depends(get_db)):
    return ActiveTasksResponse(**task_service.active_tasks(db))


@router.delete("")
async def delete_all_tasks(db: Session = Depends(get_db)):
    deleted = task_service.delete_all_tasks(db)
    return {"deleted": deleted}


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


@router.post("/{task_id}/postprocess")
async def postprocess_task(task_id: str, request: TaskPostprocessRequest, db: Session = Depends(get_db)):
    task = task_service.postprocess_task(
        db,
        task_id,
        max_chars_per_line=request.max_chars_per_line,
        max_lines=request.max_lines,
        min_duration_ms=request.min_duration_ms,
        merge_short_segments=request.merge_short_segments,
        traditional_to_simplified=request.traditional_to_simplified,
        mode=request.mode,
    )
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.get("/{task_id}/diagnostics")
async def task_diagnostics(task_id: str, db: Session = Depends(get_db)):
    if task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_service.list_task_diagnostics(db, task_id)


@router.get("/{task_id}/logs", response_model=list[TaskLogResponse])
async def task_logs(task_id: str, db: Session = Depends(get_db)):
    if task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_service.list_task_logs(db, task_id)


@router.get("/{task_id}/quality", response_model=TaskQualityResponse)
async def task_quality(task_id: str, db: Session = Depends(get_db)):
    report = task_service.get_quality(db, task_id)
    if report is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return report


@router.get("/{task_id}/versions")
async def task_versions(task_id: str, db: Session = Depends(get_db)):
    if task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_service.list_versions(db, task_id)


@router.post("/{task_id}/versions/{version_id}/restore")
async def restore_task_version(task_id: str, version_id: int, db: Session = Depends(get_db)):
    task = task_service.restore_version(db, task_id, version_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or version not found")
    return task


@router.get("/{task_id}/versions/{version_id}/export/{fmt}")
async def export_task_version(task_id: str, version_id: int, fmt: str, db: Session = Depends(get_db)):
    task = task_service.get_task(db, task_id)
    version = task_service.get_version(db, task_id, version_id)
    if task is None or version is None:
        raise HTTPException(status_code=404, detail="Task or version not found")
    fmt = fmt.lower()
    if fmt == "txt":
        return PlainTextResponse(export_service.render_txt(task.filename, version.segments))
    if fmt == "srt":
        return PlainTextResponse(export_service.render_srt(version.segments))
    if fmt == "vtt":
        return PlainTextResponse(export_service.render_vtt(version.segments))
    if fmt == "ass":
        return PlainTextResponse(export_service.render_ass(version.segments))
    if fmt == "md" or fmt == "markdown":
        return PlainTextResponse(export_service.render_markdown(task.filename, version.segments))
    if fmt == "json":
        payload = task_service.task_as_dict(task)
        payload["version_id"] = version.id
        payload["version_type"] = version.version_type
        payload["diagnostics"] = task_service.diagnostics_summary(db, task_id)
        return Response(export_service.render_json(payload, version.segments), media_type="application/json")
    raise HTTPException(status_code=400, detail=f"Unsupported export format: {fmt}")


@router.patch("/{task_id}/segments/{segment_id}")
async def update_segment(task_id: str, segment_id: int, request: SegmentUpdateRequest, db: Session = Depends(get_db)):
    task = task_service.update_segment(db, task_id, segment_id, request)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or segment not found")
    return task


@router.post("/{task_id}/segments")
async def create_segment(task_id: str, request: SegmentCreateRequest, db: Session = Depends(get_db)):
    task = task_service.create_segment(db, task_id, request)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.delete("/{task_id}/segments/{segment_id}")
async def delete_segment(task_id: str, segment_id: int, db: Session = Depends(get_db)):
    task = task_service.delete_segment(db, task_id, segment_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or segment not found")
    return task


@router.post("/{task_id}/segments/{segment_id}/split")
async def split_segment(task_id: str, segment_id: int, request: SegmentSplitRequest, db: Session = Depends(get_db)):
    task = task_service.split_segment(db, task_id, segment_id, request)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or segment not found")
    return task


@router.post("/{task_id}/segments/merge")
async def merge_segments(task_id: str, request: SegmentMergeRequest, db: Session = Depends(get_db)):
    task = task_service.merge_segments(db, task_id, request)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or segments not found")
    return task


@router.get("/{task_id}/chunks")
async def task_chunks(task_id: str, db: Session = Depends(get_db)):
    if task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task_service.list_chunks(db, task_id)


@router.post("/{task_id}/chunks/{chunk_id}/retry")
async def retry_chunk(task_id: str, chunk_id: int, db: Session = Depends(get_db)):
    task = task_service.retry_chunk(db, task_id, chunk_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task or chunk not found")
    return task


@router.post("/{task_id}/chunks/retry-failed")
async def retry_failed_chunks(task_id: str, db: Session = Depends(get_db)):
    task = task_service.retry_failed_chunks(db, task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return task


@router.post("/{task_id}/cleanup-artifacts")
async def cleanup_task_artifacts(task_id: str, db: Session = Depends(get_db)):
    result = task_service.cleanup_task_artifacts(db, task_id)
    if result is None:
        raise HTTPException(status_code=404, detail="Task not found")
    return result


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
        payload = task_service.task_as_dict(task)
        payload["version_id"] = task_service.latest_version_id(db, task_id)
        payload["diagnostics"] = task_service.diagnostics_summary(db, task_id)
        return Response(
            export_service.render_json(payload, task.segments),
            media_type="application/json",
        )
    raise HTTPException(status_code=400, detail=f"Unsupported export format: {fmt}")
