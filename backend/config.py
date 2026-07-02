from __future__ import annotations

import os
from pathlib import Path

DEFAULT_PORT = 17494


def get_data_dir() -> Path:
    path = Path(os.environ.get("ASRBOX_DATA_DIR", "data")).resolve()
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_db_path() -> Path:
    return get_data_dir() / "asrbox.db"


def _ensure_dir(name: str) -> Path:
    path = get_data_dir() / name
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_uploads_dir() -> Path:
    return _ensure_dir("uploads")


def get_audio_dir() -> Path:
    return _ensure_dir("audio")


def get_exports_dir() -> Path:
    return _ensure_dir("exports")


def get_cache_dir() -> Path:
    return _ensure_dir("cache")


def get_models_dir() -> Path:
    return _ensure_dir("models")


def to_storage_path(path: str | Path) -> str:
    resolved = Path(path).resolve()
    try:
        return str(resolved.relative_to(get_data_dir()))
    except ValueError:
        return str(resolved)


def resolve_storage_path(path: str | Path | None) -> Path | None:
    if path is None:
        return None
    stored = Path(path)
    if stored.is_absolute():
        return stored
    return (get_data_dir() / stored).resolve()

