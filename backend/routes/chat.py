from __future__ import annotations

import asyncio
import json
import queue
import threading

from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from backend.database import get_db
from backend.models import (
    ChatMessageRequest,
    ChatSessionCreate,
    ChatSessionListResponse,
    ChatSessionResponse,
    ChatSessionUpdate,
)
from backend.services import chat, llm_providers
from backend.services import tasks as task_service

router = APIRouter(prefix="/chat", tags=["chat"])


def _get_session_or_404(db: Session, session_id: str):
    session = chat.get_session(db, session_id)
    if session is None:
        raise HTTPException(status_code=404, detail={"code": "CHAT_SESSION_NOT_FOUND", "message": "Chat session not found"})
    return session


def _validate_binding(db: Session, task_id: str | None, provider_id: str | None) -> None:
    if task_id is not None and task_service.get_task_row(db, task_id) is None:
        raise HTTPException(status_code=404, detail={"code": "TASK_NOT_FOUND", "message": "Task not found"})
    if provider_id is not None and llm_providers.get_provider_row(db, provider_id) is None:
        raise HTTPException(status_code=404, detail={"code": "LLM_PROVIDER_NOT_FOUND", "message": "LLM provider not found"})


@router.post("/sessions", response_model=ChatSessionResponse)
async def create_session(payload: ChatSessionCreate, db: Session = Depends(get_db)):
    _validate_binding(db, payload.task_id, payload.provider_id)
    session = chat.create_session(
        db, task_id=payload.task_id, provider_id=payload.provider_id, title=payload.title,
    )
    return chat.session_to_response(session)


@router.get("/sessions", response_model=ChatSessionListResponse)
async def list_sessions(db: Session = Depends(get_db)):
    return ChatSessionListResponse(items=[chat.session_summary(row) for row in chat.list_sessions(db)])


@router.get("/sessions/{session_id}", response_model=ChatSessionResponse)
async def get_session(session_id: str, db: Session = Depends(get_db)):
    return chat.session_to_response(_get_session_or_404(db, session_id))


@router.patch("/sessions/{session_id}", response_model=ChatSessionResponse)
async def update_session(session_id: str, payload: ChatSessionUpdate, db: Session = Depends(get_db)):
    _get_session_or_404(db, session_id)
    fields = payload.model_fields_set
    if "task_id" in fields and payload.task_id is not None:
        _validate_binding(db, payload.task_id, None)
    if "provider_id" in fields and payload.provider_id is not None:
        _validate_binding(db, None, payload.provider_id)
    session = chat.update_session(
        db, session_id, task_id=payload.task_id, provider_id=payload.provider_id, fields=fields,
    )
    return chat.session_to_response(session)


@router.delete("/sessions/{session_id}")
async def delete_session(session_id: str, db: Session = Depends(get_db)):
    if not chat.delete_session(db, session_id):
        raise HTTPException(status_code=404, detail={"code": "CHAT_SESSION_NOT_FOUND", "message": "Chat session not found"})
    return {"message": f"Chat session {session_id} deleted"}


@router.post(
    "/sessions/{session_id}/messages",
    responses={200: {"content": {"text/event-stream": {}}, "description": "delta/done/error SSE stream"}},
)
async def post_message(session_id: str, payload: ChatMessageRequest, request: Request, db: Session = Depends(get_db)):
    session = _get_session_or_404(db, session_id)
    provider = llm_providers.get_provider_row(db, session.provider_id) if session.provider_id else None
    if provider is None:
        raise HTTPException(status_code=400, detail={
            "code": "CHAT_PROVIDER_REQUIRED",
            "message": "Configure an LLM provider in Settings before chatting",
        })
    try:
        llm_providers.validate_usable(provider)
    except llm_providers.LLMProviderError as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message}) from exc
    await run_in_threadpool(chat.add_message, db, session_id, role="user", content=payload.content)
    try:
        messages = await run_in_threadpool(chat.build_context_messages, db, session, payload.content)
    except llm_providers.LLMProviderError as exc:
        raise HTTPException(status_code=400, detail={"code": exc.code, "message": exc.message}) from exc

    updates: queue.Queue = queue.Queue(maxsize=chat.STREAM_QUEUE_MAXSIZE)
    cancel = threading.Event()
    worker = threading.Thread(
        target=chat.run_reply,
        args=(session_id, provider.id, messages, updates, cancel),
        daemon=True,
    )

    async def stream():
        worker.start()
        try:
            while True:
                try:
                    kind, data = await asyncio.to_thread(updates.get, True, 0.5)
                except queue.Empty:
                    if await request.is_disconnected():
                        break
                    continue
                yield {"event": kind, "data": json.dumps(data, ensure_ascii=False)}
                if kind in {chat.EVENT_DONE, chat.EVENT_ERROR}:
                    break
        finally:
            cancel.set()

    try:
        from sse_starlette.sse import EventSourceResponse

        return EventSourceResponse(stream(), ping=15)
    except Exception:
        async def fallback():
            async for event in stream():
                yield f"event: {event['event']}\ndata: {event['data']}\n\n"

        from fastapi.responses import StreamingResponse

        return StreamingResponse(
            fallback(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
