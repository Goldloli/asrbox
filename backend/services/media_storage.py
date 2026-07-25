from __future__ import annotations

import os
from pathlib import Path
from typing import Any

from backend import config


def _location_status(path: Path) -> dict[str, Any]:
    status = "available"
    reason: str | None = None
    writable = False
    try:
        if not path.exists():
            status, reason = "unavailable", "path_missing"
        elif not path.is_dir():
            status, reason = "unavailable", "not_a_directory"
        else:
            writable = os.access(path, os.W_OK | os.X_OK)
            if not writable:
                status, reason = "read_only", "not_writable"
    except OSError:
        status, reason = "unavailable", "io_error"
    return {"path": str(path), "status": status, "reason": reason, "available": status != "unavailable", "writable": writable}


def inspect_media_storage() -> dict[str, Any]:
    return {
        "ingest_mode": config.get_media_ingest_mode(),
        "uploads_dir": str(config.resolve_uploads_dir()),
        "derived_audio_dir": str(config.resolve_derived_audio_dir()),
        "delete_derived_on_complete": config.delete_derived_audio_on_complete(),
        "uploads_dir_locked": config.uploads_dir_is_locked(),
        "derived_audio_dir_locked": config.derived_audio_dir_is_locked(),
        "uploads": _location_status(config.resolve_uploads_dir()),
        "derived_audio": _location_status(config.resolve_derived_audio_dir()),
        "runtime": "container" if os.environ.get("ASRBOX_CONTAINER") == "1" else "desktop",
    }


def _validate_location(candidate: str, *, label: str) -> Path:
    path = Path(candidate).expanduser().absolute()
    if path.exists() and not path.is_dir():
        raise ValueError(f"{label} is not a directory: {path}")
    try:
        path.mkdir(parents=True, exist_ok=True)
    except OSError as exc:
        raise ValueError(f"{label} cannot be created: {exc}") from exc
    if not os.access(path, os.W_OK | os.X_OK):
        raise ValueError(f"{label} is not writable: {path}")
    return path


def update_media_storage_settings(payload: dict[str, Any]) -> dict[str, Any]:
    updates: dict[str, Any] = {}
    ingest_mode = payload.get("ingest_mode")
    if ingest_mode is not None:
        updates["ingest_mode"] = ingest_mode
    uploads_dir = payload.get("uploads_dir")
    if uploads_dir is not None:
        updates["uploads_dir"] = _validate_location(str(uploads_dir), label="Uploads directory")
    derived_audio_dir = payload.get("derived_audio_dir")
    if derived_audio_dir is not None:
        updates["derived_audio_dir"] = _validate_location(str(derived_audio_dir), label="Derived-audio directory")
    delete_derived = payload.get("delete_derived_on_complete")
    if delete_derived is not None:
        updates["delete_derived_on_complete"] = bool(delete_derived)
    config.update_media_storage_config(**updates)
    return inspect_media_storage()
