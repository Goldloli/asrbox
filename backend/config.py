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
