from __future__ import annotations

import asyncio
import json
import threading
from datetime import datetime
from typing import Any


class ProgressManager:
    def __init__(self) -> None:
        self._progress: dict[str, dict[str, Any]] = {}
        self._listeners: dict[str, list[tuple[asyncio.Queue, asyncio.AbstractEventLoop]]] = {}
        self._lock = threading.Lock()

    @staticmethod
    def _put_nowait(queue: asyncio.Queue, data: dict[str, Any]) -> None:
        try:
            queue.put_nowait(data)
        except asyncio.QueueFull:
            pass

    def update_progress(
        self,
        key: str,
        current: int,
        total: int,
        status: str = "downloading",
        filename: str | None = None,
        error: str | None = None,
    ) -> None:
        progress = 0.0 if total <= 0 else min(100.0, max(0.0, current / total * 100))
        data = {
            "model_name": key,
            "current": current,
            "total": total,
            "progress": progress,
            "filename": filename,
            "status": status,
            "error": error,
            "timestamp": datetime.utcnow().isoformat(),
        }
        with self._lock:
            self._progress[key] = data
            listeners = list(self._listeners.get(key, []))
        for queue, loop in listeners:
            if loop.is_running():
                loop.call_soon_threadsafe(self._put_nowait, queue, data.copy())

    def mark_complete(self, key: str) -> None:
        self.update_progress(key, 1, 1, status="complete")

    def mark_error(self, key: str, error: str) -> None:
        self.update_progress(key, 0, 0, status="error", error=error)

    def get_progress(self, key: str) -> dict[str, Any] | None:
        with self._lock:
            data = self._progress.get(key)
            return data.copy() if data else None

    def clear_progress(self, key: str) -> None:
        with self._lock:
            self._progress.pop(key, None)

    async def subscribe(self, key: str):
        queue: asyncio.Queue = asyncio.Queue(maxsize=10)
        loop = asyncio.get_running_loop()
        with self._lock:
            self._listeners.setdefault(key, []).append((queue, loop))
            initial = self._progress.get(key)
        try:
            if initial:
                yield f"data: {json.dumps(initial)}\n\n"
                if initial.get("status") in {"complete", "error"}:
                    return
            while True:
                try:
                    event = await asyncio.wait_for(queue.get(), timeout=1.0)
                    yield f"data: {json.dumps(event)}\n\n"
                    if event.get("status") in {"complete", "error"}:
                        return
                except asyncio.TimeoutError:
                    yield ": heartbeat\n\n"
        finally:
            with self._lock:
                listeners = self._listeners.get(key, [])
                for listener in list(listeners):
                    if listener[0] is queue:
                        listeners.remove(listener)
                        break
                if not listeners and key in self._listeners:
                    del self._listeners[key]


_progress_manager: ProgressManager | None = None


def get_progress_manager() -> ProgressManager:
    global _progress_manager
    if _progress_manager is None:
        _progress_manager = ProgressManager()
    return _progress_manager
