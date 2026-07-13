from __future__ import annotations

import os
from pathlib import Path
from typing import BinaryIO


DEFAULT_MAX_UPLOAD_BYTES = 20 * 1024 * 1024 * 1024
DEFAULT_MAX_BATCH_FILES = 32
DEFAULT_MAX_BATCH_TOTAL_BYTES = 40 * 1024 * 1024 * 1024
DEFAULT_CHUNK_SIZE = 4 * 1024 * 1024


class UploadLimitExceeded(ValueError):
    pass


def _positive_limit(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, default)))
    except ValueError:
        return default


def max_upload_bytes() -> int:
    return _positive_limit("ASRBOX_MAX_UPLOAD_BYTES", DEFAULT_MAX_UPLOAD_BYTES)


def max_batch_files() -> int:
    return _positive_limit("ASRBOX_MAX_BATCH_FILES", DEFAULT_MAX_BATCH_FILES)


def max_batch_total_bytes() -> int:
    return _positive_limit("ASRBOX_MAX_BATCH_TOTAL_BYTES", DEFAULT_MAX_BATCH_TOTAL_BYTES)


def validate_upload_metadata(files: list[object], *, batch: bool) -> None:
    if batch and len(files) > max_batch_files():
        raise UploadLimitExceeded(f"Batch contains too many files; maximum is {max_batch_files()}")
    known_sizes = [int(size) for item in files if (size := getattr(item, "size", None)) is not None]
    if any(size > max_upload_bytes() for size in known_sizes):
        raise UploadLimitExceeded(f"Upload exceeds the {max_upload_bytes()} byte file limit")
    if batch and sum(known_sizes) > max_batch_total_bytes():
        raise UploadLimitExceeded(f"Batch exceeds the {max_batch_total_bytes()} byte total limit")


def save_upload(
    file_obj: BinaryIO,
    destination: Path,
    *,
    max_bytes: int | None = None,
    chunk_size: int = DEFAULT_CHUNK_SIZE,
) -> int:
    limit = max_bytes if max_bytes is not None else max_upload_bytes()
    written = 0
    try:
        with destination.open("wb") as output:
            while chunk := file_obj.read(chunk_size):
                written += len(chunk)
                if written > limit:
                    raise UploadLimitExceeded(f"Upload exceeds the {limit} byte file limit")
                output.write(chunk)
    except Exception:
        destination.unlink(missing_ok=True)
        raise
    return written
