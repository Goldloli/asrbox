from __future__ import annotations

import shutil
from pathlib import Path

from backend import config
from backend.backends import get_all_model_configs, get_model_config
from backend.models import ASRModelStatus
from backend.utils.progress import get_progress_manager

_loaded_models: set[str] = set()
_active_downloads: set[str] = set()


def _model_dir(model_name: str) -> Path:
    return config.get_models_dir() / model_name


def is_model_downloaded(model_name: str) -> bool:
    return (_model_dir(model_name) / "model.json").exists()


def list_model_statuses() -> list[ASRModelStatus]:
    statuses: list[ASRModelStatus] = []
    for item in get_all_model_configs():
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
                loaded=item.model_name in _loaded_models,
            )
        )
    return statuses


def download_model(model_name: str) -> None:
    model_config = get_model_config(model_name)
    if model_config is None:
        raise ValueError(f"Unknown model: {model_name}")
    _active_downloads.add(model_name)
    progress = get_progress_manager()
    progress.update_progress(model_name, 0, 100, filename="Preparing metadata")
    model_dir = _model_dir(model_name)
    model_dir.mkdir(parents=True, exist_ok=True)
    progress.update_progress(model_name, 70, 100, filename="Writing local marker")
    (model_dir / "model.json").write_text(
        (
            "{\n"
            f'  "model_name": "{model_config.model_name}",\n'
            f'  "repo_id": "{model_config.repo_id or ""}",\n'
            f'  "engine": "{model_config.engine}"\n'
            "}\n"
        ),
        encoding="utf-8",
    )
    _active_downloads.discard(model_name)
    progress.mark_complete(model_name)


def unload_model(model_name: str) -> bool:
    if model_name in _loaded_models:
        _loaded_models.remove(model_name)
        return True
    return False


def delete_model(model_name: str) -> None:
    unload_model(model_name)
    shutil.rmtree(_model_dir(model_name), ignore_errors=True)


def ensure_model_ready(model_name: str) -> None:
    if not is_model_downloaded(model_name):
        download_model(model_name)
    _loaded_models.add(model_name)

