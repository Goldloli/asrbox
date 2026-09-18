"""Range-aware media responses for the frozen macOS desktop backend."""

from __future__ import annotations

import math
import mimetypes
import subprocess
import sys
from collections.abc import Iterator
from pathlib import Path

from fastapi import HTTPException
from fastapi.responses import FileResponse, StreamingResponse

from backend.services.process_utils import no_window_kwargs

_READ_BLOCK_SIZE = 64 * 1024


def uses_frozen_macos_reader() -> bool:
    """Avoid the FileIO stall observed in the signed/frozen macOS sidecar."""
    return sys.platform == "darwin" and bool(getattr(sys, "frozen", False))


def _range_not_satisfiable(size: int) -> HTTPException:
    return HTTPException(
        status_code=416,
        detail="Requested range not satisfiable",
        headers={"Content-Range": f"bytes */{size}"},
    )


def parse_single_range(value: str, size: int) -> tuple[int, int]:
    """Parse one RFC 7233 byte range and return inclusive bounds."""
    if size <= 0 or not value.startswith("bytes=") or "," in value:
        raise _range_not_satisfiable(size)
    raw = value.removeprefix("bytes=").strip()
    if "-" not in raw:
        raise _range_not_satisfiable(size)
    start_text, end_text = raw.split("-", 1)
    try:
        if not start_text:
            suffix_length = int(end_text)
            if suffix_length <= 0:
                raise ValueError
            start = max(0, size - suffix_length)
            end = size - 1
        else:
            start = int(start_text)
            end = int(end_text) if end_text else size - 1
            if start < 0 or start >= size or end < start:
                raise ValueError
            end = min(end, size - 1)
    except (TypeError, ValueError) as exc:
        raise _range_not_satisfiable(size) from exc
    return start, end


def _dd_command(path: Path, start: int, length: int) -> tuple[list[str], int]:
    block_start = start // _READ_BLOCK_SIZE
    leading_bytes = start - block_start * _READ_BLOCK_SIZE
    block_count = math.ceil((leading_bytes + length) / _READ_BLOCK_SIZE)
    return (
        [
            "/bin/dd",
            f"if={path}",
            f"bs={_READ_BLOCK_SIZE}",
            f"skip={block_start}",
            f"count={block_count}",
        ],
        leading_bytes,
    )


def _stop_reader(process: subprocess.Popen[bytes]) -> None:
    if process.stdout is not None:
        process.stdout.close()
    if process.poll() is not None:
        return
    try:
        process.terminate()
        process.wait(timeout=1)
    except (ProcessLookupError, subprocess.TimeoutExpired):
        try:
            process.kill()
            process.wait(timeout=1)
        except (ProcessLookupError, subprocess.TimeoutExpired):
            pass


def _iter_dd_range(path: Path, start: int, length: int) -> Iterator[bytes]:
    command, leading_bytes = _dd_command(path, start, length)
    process = subprocess.Popen(
        command,
        stdout=subprocess.PIPE,
        stderr=subprocess.DEVNULL,
        **no_window_kwargs(),
    )
    try:
        if process.stdout is None:
            return
        remaining = length
        discard = leading_bytes
        while remaining > 0:
            chunk = process.stdout.read(_READ_BLOCK_SIZE)
            if not chunk:
                break
            if discard:
                if len(chunk) <= discard:
                    discard -= len(chunk)
                    continue
                chunk = chunk[discard:]
                discard = 0
            if len(chunk) > remaining:
                chunk = chunk[:remaining]
            remaining -= len(chunk)
            if chunk:
                yield chunk
    finally:
        _stop_reader(process)


def audio_response(path: Path, range_header: str | None):
    """Return a normal FileResponse, or a frozen-macOS-safe ranged stream."""
    if not uses_frozen_macos_reader():
        return FileResponse(path)

    size = path.stat().st_size
    if range_header:
        start, end = parse_single_range(range_header, size)
        status_code = 206
    else:
        start, end = 0, size - 1
        status_code = 200
    length = max(0, end - start + 1)
    media_type = mimetypes.guess_type(path.name)[0] or "application/octet-stream"
    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(length),
    }
    if status_code == 206:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"
    return StreamingResponse(
        _iter_dd_range(path, start, length),
        status_code=status_code,
        media_type=media_type,
        headers=headers,
    )

