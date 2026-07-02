from __future__ import annotations

import json
import shutil
import threading
from pathlib import Path

from backend import config
from backend.backends.local_asr import is_model_loaded, unload_model as unload_local_model
from backend.backends import ASRModelConfig, get_all_model_configs, get_model_config
from backend.models import ASRModelStatus
from backend.utils.hf_progress import track_hf_download
from backend.utils.progress import get_progress_manager

_active_downloads: set[str] = set()
_download_errors: dict[str, str] = {}
_state_lock = threading.Lock()

WEIGHT_EXTENSIONS = (
    ".safetensors",
    ".bin",
    ".pt",
    ".pth",
    ".npz",
    ".model",
    ".onnx",
    ".mvn",
)


def _model_dir(model_name: str) -> Path:
    return config.get_models_dir() / model_name


def _has_incomplete_files(model_dir: Path) -> bool:
    return model_dir.exists() and any(model_dir.rglob("*.incomplete"))


def _has_weight_files(model_dir: Path) -> bool:
    if not model_dir.exists():
        return False
    return any(path.is_file() and path.suffix.lower() in WEIGHT_EXTENSIONS for path in model_dir.rglob("*"))


def is_model_downloaded(model_name: str) -> bool:
    model_dir = _model_dir(model_name)
    return (model_dir / "model.json").exists() and _has_weight_files(model_dir) and not _has_incomplete_files(model_dir)


def list_model_statuses() -> list[ASRModelStatus]:
    statuses: list[ASRModelStatus] = []
    progress = get_progress_manager()
    for item in get_all_model_configs():
        progress_state = progress.get_progress(item.model_name)
        error = _download_errors.get(item.model_name)
        if progress_state and progress_state.get("status") == "error":
            error = progress_state.get("error") or error
        statuses.append(
            ASRModelStatus(
                model_name=item.model_name,
                display_name=item.display_name,
                engine=item.engine,
                source=item.source,
                repo_id=item.repo_id,
                model_size=item.model_size,
                size_mb=item.size_mb,
                languages=item.languages,
                runtime=item.runtime,
                supports_timestamps=item.supports_timestamps,
                supports_word_timestamps=item.supports_word_timestamps,
                supports_diarization=item.supports_diarization,
                supports_streaming=item.supports_streaming,
                downloaded=is_model_downloaded(item.model_name),
                downloading=item.model_name in _active_downloads,
                loaded=is_model_loaded(item.model_name, item.engine),
                error=error,
            )
        )
    return statuses


def _write_model_marker(model_config: ASRModelConfig, snapshot_path: str) -> None:
    marker = {
        "model_name": model_config.model_name,
        "repo_id": model_config.repo_id,
        "source": model_config.source,
        "engine": model_config.engine,
        "snapshot_path": snapshot_path,
    }
    (_model_dir(model_config.model_name) / "model.json").write_text(
        json.dumps(marker, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _download_huggingface_snapshot(model_config: ASRModelConfig, model_dir: Path) -> str:
    if not model_config.repo_id:
        raise ValueError(f"Model {model_config.model_name} does not define a Hugging Face repo")

    from huggingface_hub import snapshot_download

    with track_hf_download(model_config.model_name, get_progress_manager()):
        return snapshot_download(
            repo_id=model_config.repo_id,
            local_dir=str(model_dir),
            allow_patterns=model_config.allow_patterns,
        )


def _download_modelscope_snapshot(model_config: ASRModelConfig, model_dir: Path) -> str:
    if not model_config.repo_id:
        raise ValueError(f"Model {model_config.model_name} does not define a ModelScope model id")

    from modelscope import snapshot_download

    get_progress_manager().update_progress(
        model_config.model_name,
        0,
        0,
        filename="Connecting to ModelScope...",
        status="downloading",
    )
    return snapshot_download(model_id=model_config.repo_id, cache_dir=str(model_dir))


def _run_download(model_config: ASRModelConfig) -> None:
    model_name = model_config.model_name
    model_dir = _model_dir(model_name)
    progress = get_progress_manager()
    try:
        model_dir.mkdir(parents=True, exist_ok=True)
        if model_config.source == "modelscope":
            snapshot_path = _download_modelscope_snapshot(model_config, model_dir)
        else:
            snapshot_path = _download_huggingface_snapshot(model_config, model_dir)

        if not _has_weight_files(model_dir):
            raise RuntimeError("Model download finished but no model weight files were found")
        if _has_incomplete_files(model_dir):
            raise RuntimeError("Model download has incomplete files")

        _write_model_marker(model_config, snapshot_path)
        progress.mark_complete(model_name)
    except Exception as exc:
        error = str(exc)
        with _state_lock:
            _download_errors[model_name] = error
        progress.mark_error(model_name, error)
    finally:
        with _state_lock:
            _active_downloads.discard(model_name)


def download_model(model_name: str) -> str:
    model_config = get_model_config(model_name)
    if model_config is None:
        raise ValueError(f"Unknown model: {model_name}")

    if is_model_downloaded(model_name):
        return f"Model {model_name} is already downloaded"

    with _state_lock:
        if model_name in _active_downloads:
            return f"Model {model_name} download already running"
        _active_downloads.add(model_name)
        _download_errors.pop(model_name, None)

    progress = get_progress_manager()
    progress.update_progress(
        model_name,
        0,
        0,
        filename="Connecting to model hub...",
        status="downloading",
    )

    thread = threading.Thread(target=_run_download, args=(model_config,), daemon=True)
    thread.start()
    return f"Model {model_name} download started"


def unload_model(model_name: str) -> bool:
    model_config = get_model_config(model_name)
    if model_config is None:
        return False
    return unload_local_model(model_name, model_config.engine)


def delete_model(model_name: str) -> None:
    unload_model(model_name)
    shutil.rmtree(_model_dir(model_name), ignore_errors=True)
    with _state_lock:
        _active_downloads.discard(model_name)
        _download_errors.pop(model_name, None)
    get_progress_manager().clear_progress(model_name)


def ensure_model_ready(model_name: str) -> None:
    if get_model_config(model_name) is None:
        raise ValueError(f"Unknown model: {model_name}")
    if not is_model_downloaded(model_name):
        raise RuntimeError(f"Model {model_name} is not downloaded")
