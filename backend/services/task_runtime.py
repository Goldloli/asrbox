from __future__ import annotations

import threading
from typing import Callable

_lock = threading.Lock()
_queued_task_ids: set[str] = set()
_running_task_ids: set[str] = set()
_cancelled_task_ids: set[str] = set()


def mark_queued(task_id: str) -> None:
    with _lock:
        _queued_task_ids.add(task_id)
        _cancelled_task_ids.discard(task_id)


def mark_running(task_id: str) -> None:
    with _lock:
        _queued_task_ids.discard(task_id)
        _running_task_ids.add(task_id)


def mark_finished(task_id: str) -> None:
    with _lock:
        _queued_task_ids.discard(task_id)
        _running_task_ids.discard(task_id)
        _cancelled_task_ids.discard(task_id)


def request_cancel(task_id: str) -> str | None:
    with _lock:
        if task_id in _queued_task_ids:
            _queued_task_ids.discard(task_id)
            _cancelled_task_ids.add(task_id)
            return "queued"
        if task_id in _running_task_ids:
            _cancelled_task_ids.add(task_id)
            return "running"
        _cancelled_task_ids.add(task_id)
        return None


def is_cancelled(task_id: str) -> bool:
    with _lock:
        return task_id in _cancelled_task_ids


def cancellation_checker(task_id: str) -> Callable[[], bool]:
    return lambda: is_cancelled(task_id)


def snapshot() -> dict:
    with _lock:
        return {
            "queued_task_ids": sorted(_queued_task_ids),
            "running_task_ids": sorted(_running_task_ids),
            "cancelled_task_ids": sorted(_cancelled_task_ids),
        }


def active_ids() -> set[str]:
    with _lock:
        return set(_queued_task_ids) | set(_running_task_ids)
