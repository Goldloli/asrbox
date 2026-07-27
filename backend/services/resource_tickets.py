from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
import secrets
import threading
import time

DEFAULT_TTL_SECONDS = 30 * 60
DEFAULT_ABSOLUTE_TTL_SECONDS = 24 * 60 * 60
MAX_TICKETS = 256


@dataclass(frozen=True)
class ResourceTicketGrant:
    ticket: str
    path: str
    expires_at: datetime


@dataclass
class _Ticket:
    path: str
    idle_ttl_seconds: int
    idle_expires_monotonic: float
    absolute_expires_monotonic: float


_lock = threading.Lock()
_tickets: dict[str, _Ticket] = {}


def _purge_expired_locked(now: float) -> None:
    expired = [
        token
        for token, item in _tickets.items()
        if min(item.idle_expires_monotonic, item.absolute_expires_monotonic) <= now
    ]
    for token in expired:
        _tickets.pop(token, None)


def issue(
    path: str,
    *,
    ttl_seconds: int = DEFAULT_TTL_SECONDS,
    absolute_ttl_seconds: int = DEFAULT_ABSOLUTE_TTL_SECONDS,
) -> ResourceTicketGrant:
    if not path.startswith("/tasks/") or not path.endswith("/audio"):
        raise ValueError("Resource tickets are limited to task audio paths")
    middle = path.removeprefix("/tasks/").removesuffix("/audio")
    if not middle or "/" in middle or any(character in middle for character in "?#"):
        raise ValueError("Resource ticket path is invalid")
    idle_ttl = max(0, min(int(ttl_seconds), DEFAULT_ABSOLUTE_TTL_SECONDS))
    absolute_ttl = max(
        0,
        min(int(absolute_ttl_seconds), DEFAULT_ABSOLUTE_TTL_SECONDS),
    )
    token = secrets.token_urlsafe(32)
    now = time.monotonic()
    absolute_expires = now + absolute_ttl
    with _lock:
        _purge_expired_locked(now)
        if len(_tickets) >= MAX_TICKETS:
            oldest = min(
                _tickets,
                key=lambda item: min(
                    _tickets[item].idle_expires_monotonic,
                    _tickets[item].absolute_expires_monotonic,
                ),
            )
            _tickets.pop(oldest, None)
        _tickets[token] = _Ticket(
            path=path,
            idle_ttl_seconds=idle_ttl,
            idle_expires_monotonic=min(now + idle_ttl, absolute_expires),
            absolute_expires_monotonic=absolute_expires,
        )
    return ResourceTicketGrant(
        ticket=token,
        path=path,
        expires_at=datetime.now(UTC) + timedelta(seconds=absolute_ttl),
    )


def validate(ticket: str, path: str, method: str) -> bool:
    if method != "GET" or not ticket:
        return False
    now = time.monotonic()
    with _lock:
        _purge_expired_locked(now)
        item = _tickets.get(ticket)
        if item is None or not secrets.compare_digest(item.path, path):
            return False
        # Keep active Range playback alive without extending its absolute lifetime.
        item.idle_expires_monotonic = min(
            now + item.idle_ttl_seconds,
            item.absolute_expires_monotonic,
        )
        return True


def clear() -> None:
    with _lock:
        _tickets.clear()
