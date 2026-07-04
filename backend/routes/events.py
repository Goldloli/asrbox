from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.utils.events import event_bus

router = APIRouter(tags=["events"])


@router.get("/events")
async def events(task_id: str | None = None, model_name: str | None = None, type: str | None = None):
    stream = event_bus.subscribe(task_id=task_id, model_name=model_name, event_type=type)
    try:
        from sse_starlette.sse import EventSourceResponse

        return EventSourceResponse(stream, ping=15)
    except Exception:
        async def fallback():
            async for event in stream:
                yield f"event: {event['event']}\ndata: {event['data']}\n\n"

        return StreamingResponse(
            fallback(),
            media_type="text/event-stream",
            headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
        )
