from __future__ import annotations

from pathlib import Path
from typing import Any

from fastapi import APIRouter, FastAPI

from backend import config
from backend.database import session as db_session
from backend.models import MCPTranscribeRequest
from backend.services import exports as export_service
from backend.services import models as model_service
from backend.services import tasks as task_service


def _with_db(fn):
    db_session.init_db()
    db = db_session.SessionLocal()
    try:
        return fn(db)
    finally:
        db.close()


def _transcribe(request: dict[str, Any]) -> dict[str, Any]:
    payload = MCPTranscribeRequest(**request)
    source = Path(payload.path)
    if not config.is_desktop_mode() and not config.path_within_roots(source, config.get_mcp_allowed_roots()):
        raise ValueError(
            "Path is outside the MCP ingestion boundary: only the uploads directory, "
            "the derived-audio directory, and roots listed in ASRBOX_MCP_ALLOWED_ROOTS are allowed"
        )

    def run(db):
        task = task_service.create_task_from_path(
            db,
            path=source,
            backend=payload.backend,
            model_name=payload.model_name,
            provider_id=payload.provider_id,
            language=payload.language,
            output_formats=payload.output_formats,
        )
        return task.model_dump()

    return _with_db(run)


def _list_tasks() -> dict[str, Any]:
    def run(db):
        items, total = task_service.list_tasks(db)
        return {"items": [item.model_dump() for item in items], "total": total}

    return _with_db(run)


def _get_task(task_id: str) -> dict[str, Any] | None:
    def run(db):
        task = task_service.get_task(db, task_id)
        return task.model_dump() if task else None

    return _with_db(run)


def _export_subtitle(task_id: str, fmt: str = "srt") -> str:
    def run(db):
        task = task_service.get_task(db, task_id)
        if task is None:
            raise ValueError("Task not found")
        normalized = fmt.lower()
        if normalized == "txt":
            return export_service.render_txt(task.filename, task.segments)
        if normalized == "srt":
            return export_service.render_srt(task.segments)
        if normalized == "vtt":
            return export_service.render_vtt(task.segments)
        if normalized == "ass":
            return export_service.render_ass(task.segments)
        if normalized in {"md", "markdown"}:
            return export_service.render_markdown(task.filename, task.segments)
        raise ValueError(f"Unsupported export format: {fmt}")

    return _with_db(run)


def _list_models() -> list[dict[str, Any]]:
    return [item.model_dump() for item in model_service.list_model_statuses()]


def _readiness() -> dict[str, Any]:
    from backend.routes.transcriptions import transcription_readiness

    return _with_db(lambda db: transcription_readiness(db).model_dump())


def _fallback_router(reason: str) -> APIRouter:
    router = APIRouter(prefix="/mcp", tags=["mcp"])

    @router.get("")
    async def mcp_status():
        return {"enabled": False, "reason": reason}

    return router


def mount_mcp(app: FastAPI) -> None:
    try:
        from fastmcp import FastMCP

        mcp = FastMCP("ASRbox")
        mcp.tool(name="asrbox.transcribe")(_transcribe)
        mcp.tool(name="asrbox.list_tasks")(_list_tasks)
        mcp.tool(name="asrbox.get_task")(_get_task)
        mcp.tool(name="asrbox.export_subtitle")(_export_subtitle)
        mcp.tool(name="asrbox.list_models")(_list_models)
        mcp.tool(name="asrbox.readiness")(_readiness)
        if hasattr(mcp, "http_app"):
            app.mount("/mcp", mcp.http_app())
            return
        if hasattr(mcp, "streamable_http_app"):
            app.mount("/mcp", mcp.streamable_http_app())
            return
        app.include_router(_fallback_router("fastmcp does not expose an ASGI app"))
    except Exception as exc:  # pragma: no cover - optional dependency surface
        app.include_router(_fallback_router(f"fastmcp is not available: {exc}"))
