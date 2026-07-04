from __future__ import annotations

import asyncio
import json
import queue
import threading
from datetime import UTC, datetime
from typing import Any, AsyncIterator

MAX_SUBSCRIBER_QUEUE_SIZE = 64
STABLE_EVENT_TYPES = {
    "task.updated",
    "task.failed",
    "task.completed",
    "chunk.updated",
    "model.download.updated",
    "runtime.warning",
    "storage.warning",
}


class EventBus:
    def __init__(self) -> None:
        self._subscribers: set[queue.Queue] = set()
        self._lock = threading.Lock()
        self.dropped_events = 0

    def publish(self, event_type: str, payload: dict[str, Any]) -> None:
        event = {
            "type": event_type,
            "payload": payload,
            "created_at": datetime.now(UTC).isoformat(),
        }
        with self._lock:
            subscribers = list(self._subscribers)
        for subscriber in subscribers:
            try:
                subscriber.put_nowait(event)
            except queue.Full:
                self.dropped_events += 1

    @property
    def subscriber_count(self) -> int:
        with self._lock:
            return len(self._subscribers)

    async def subscribe(
        self,
        *,
        task_id: str | None = None,
        model_name: str | None = None,
        event_type: str | None = None,
        heartbeat_seconds: float = 15.0,
    ) -> AsyncIterator[dict[str, Any]]:
        subscriber: queue.Queue = queue.Queue(maxsize=MAX_SUBSCRIBER_QUEUE_SIZE)
        with self._lock:
            self._subscribers.add(subscriber)
        try:
            yield {"event": "connected", "data": "{}"}
            while True:
                try:
                    event = await asyncio.to_thread(subscriber.get, True, heartbeat_seconds)
                except queue.Empty:
                    yield {"event": "ping", "data": "{}"}
                    continue
                payload = event.get("payload") or {}
                if event_type and event.get("type") != event_type:
                    continue
                if task_id and payload.get("task_id") != task_id and payload.get("id") != task_id:
                    continue
                if model_name and payload.get("model_name") != model_name:
                    continue
                yield {
                    "event": event["type"],
                    "data": json.dumps(event, ensure_ascii=False),
                }
        finally:
            with self._lock:
                self._subscribers.discard(subscriber)


event_bus = EventBus()
