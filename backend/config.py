from __future__ import annotations

import json
import os
from pathlib import Path
import tempfile
import sys
from typing import Any

DEFAULT_PORT = 17494
MODEL_STORAGE_CONFIG_VERSION = 1
MODEL_STORAGE_CONFIG_FILENAME = "model-storage.json"
MODEL_CACHE_NAMES = ("huggingface", "modelscope", "torch", "xdg")
MEDIA_STORAGE_CONFIG_VERSION = 1
MEDIA_STORAGE_CONFIG_FILENAME = "media-storage.json"
INGEST_MODE_REFERENCE = "reference"
INGEST_MODE_COPY = "copy"
INGEST_MODES = (INGEST_MODE_REFERENCE, INGEST_MODE_COPY)
DEFAULT_INGEST_MODE = INGEST_MODE_REFERENCE


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


def get_media_storage_config_path() -> Path:
    return get_data_dir() / MEDIA_STORAGE_CONFIG_FILENAME


def _read_media_storage_config() -> dict[str, Any]:
    path = get_media_storage_config_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict) or payload.get("version") != MEDIA_STORAGE_CONFIG_VERSION:
        return {}
    return payload


def _write_media_storage_config(payload: dict[str, Any]) -> None:
    path = get_media_storage_config_path()
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)


def _optional_configured_path(value: Any) -> Path | None:
    if isinstance(value, str) and value.strip():
        return Path(value).expanduser().absolute()
    return None


def get_media_ingest_mode() -> str:
    mode = _read_media_storage_config().get("ingest_mode")
    return mode if mode in INGEST_MODES else DEFAULT_INGEST_MODE


def uploads_dir_is_locked() -> bool:
    return bool(os.environ.get("ASRBOX_UPLOADS_DIR", "").strip())


def derived_audio_dir_is_locked() -> bool:
    return bool(os.environ.get("ASRBOX_DERIVED_AUDIO_DIR", "").strip())


def resolve_uploads_dir() -> Path:
    """Return the effective managed-uploads directory without creating it."""
    enforced = os.environ.get("ASRBOX_UPLOADS_DIR", "").strip()
    if enforced:
        return Path(enforced).expanduser().absolute()
    configured = _optional_configured_path(_read_media_storage_config().get("uploads_dir"))
    if configured is not None:
        return configured
    return get_data_dir() / "uploads"


def resolve_derived_audio_dir() -> Path:
    """Return the effective derived-audio directory without creating it."""
    enforced = os.environ.get("ASRBOX_DERIVED_AUDIO_DIR", "").strip()
    if enforced:
        return Path(enforced).expanduser().absolute()
    configured = _optional_configured_path(_read_media_storage_config().get("derived_audio_dir"))
    if configured is not None:
        return configured
    return get_data_dir() / "derived-audio"


def delete_derived_audio_on_complete() -> bool:
    return bool(_read_media_storage_config().get("delete_derived_on_complete"))


def update_media_storage_config(
    *,
    ingest_mode: str | None = None,
    uploads_dir: str | Path | None = None,
    derived_audio_dir: str | Path | None = None,
    delete_derived_on_complete: bool | None = None,
) -> None:
    payload = _read_media_storage_config()
    payload["version"] = MEDIA_STORAGE_CONFIG_VERSION
    if ingest_mode is not None:
        if ingest_mode not in INGEST_MODES:
            raise ValueError(f"Unsupported ingest mode: {ingest_mode}")
        payload["ingest_mode"] = ingest_mode
    if uploads_dir is not None:
        if uploads_dir_is_locked():
            raise ValueError("Uploads directory is locked by ASRBOX_UPLOADS_DIR")
        payload["uploads_dir"] = str(Path(uploads_dir).expanduser().absolute())
    if derived_audio_dir is not None:
        if derived_audio_dir_is_locked():
            raise ValueError("Derived-audio directory is locked by ASRBOX_DERIVED_AUDIO_DIR")
        payload["derived_audio_dir"] = str(Path(derived_audio_dir).expanduser().absolute())
    if delete_derived_on_complete is not None:
        payload["delete_derived_on_complete"] = bool(delete_derived_on_complete)
    _write_media_storage_config(payload)


def get_uploads_dir() -> Path:
    path = resolve_uploads_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_derived_audio_dir() -> Path:
    path = resolve_derived_audio_dir()
    path.mkdir(parents=True, exist_ok=True)
    return path


def get_audio_dir() -> Path:
    return _ensure_dir("audio")


def get_exports_dir() -> Path:
    return _ensure_dir("exports")


def get_cache_dir() -> Path:
    return _ensure_dir("cache")


def get_model_storage_config_path() -> Path:
    return get_data_dir() / MODEL_STORAGE_CONFIG_FILENAME


def _read_model_storage_config() -> dict[str, Any]:
    path = get_model_storage_config_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    if not isinstance(payload, dict) or payload.get("version") != MODEL_STORAGE_CONFIG_VERSION:
        return {}
    return payload


def get_model_storage_root() -> Path:
    enforced = os.environ.get("ASRBOX_MODEL_STORAGE_ROOT", "").strip()
    if enforced:
        return Path(enforced).expanduser().absolute()
    configured = _read_model_storage_config().get("root")
    if isinstance(configured, str) and configured.strip():
        return Path(configured).expanduser().absolute()
    return get_data_dir()


def set_model_storage_root(root: str | Path) -> Path:
    resolved = Path(root).expanduser().absolute()
    path = get_model_storage_config_path()
    payload = {"version": MODEL_STORAGE_CONFIG_VERSION, "root": str(resolved)}
    fd, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            json.dump(payload, handle, ensure_ascii=False, indent=2)
            handle.write("\n")
            handle.flush()
            os.fsync(handle.fileno())
        os.replace(temporary, path)
    finally:
        temporary.unlink(missing_ok=True)
    return resolved


def model_storage_root_is_locked() -> bool:
    return bool(os.environ.get("ASRBOX_MODEL_STORAGE_ROOT", "").strip())


def get_allowed_model_storage_roots() -> list[Path]:
    configured = os.environ.get("ASRBOX_MODEL_STORAGE_ROOTS", "")
    roots = [Path(value.strip()).expanduser().absolute() for value in configured.split(",") if value.strip()]
    if os.environ.get("ASRBOX_CONTAINER") == "1":
        default = get_data_dir()
        if default not in roots:
            roots.insert(0, default)
    return roots


def get_models_dir() -> Path:
    return get_model_storage_root() / "models"


def get_model_cache_dir(name: str) -> Path:
    if name not in MODEL_CACHE_NAMES:
        raise ValueError(f"Unsupported model cache: {name}")
    return get_model_storage_root() / "cache" / name


def get_model_cache_dirs() -> dict[str, Path]:
    return {name: get_model_cache_dir(name) for name in MODEL_CACHE_NAMES}


def configure_model_cache_environment() -> None:
    cache_dirs = get_model_cache_dirs()
    os.environ["HF_HOME"] = str(cache_dirs["huggingface"])
    os.environ["HUGGINGFACE_HUB_CACHE"] = str(cache_dirs["huggingface"] / "hub")
    os.environ["MODELSCOPE_CACHE"] = str(cache_dirs["modelscope"])
    os.environ["TORCH_HOME"] = str(cache_dirs["torch"])
    os.environ["XDG_CACHE_HOME"] = str(cache_dirs["xdg"])
    torch = sys.modules.get("torch")
    if torch is not None and hasattr(torch, "hub"):
        torch.hub.set_dir(str(cache_dirs["torch"] / "hub"))


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
