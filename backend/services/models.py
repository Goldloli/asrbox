from __future__ import annotations

import json
import os
import platform
import queue
import shutil
import threading
import uuid
from dataclasses import asdict, replace
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from backend import config
from backend.backends.local_asr import is_model_loaded, unload_model as unload_local_model
from backend.backends import ASRModelConfig, ModelSourceCandidate, get_all_model_configs, get_model_config
from backend.models import ASRModelStatus, ModelRecommendationRequest, ModelRecommendationResponse
from backend.services.errors import ASRboxError
from backend.services import model_storage
from backend.services.platform import (
    funasr_available,
    moss_transcribe_diarize_available,
    qwen3_asr_available,
    runtime_mlx_import_error as mlx_runtime_import_error,
    torchaudio_available,
)
from backend.utils.hf_progress import track_hf_download
from backend.utils.progress import get_progress_manager

_active_downloads: set[str] = set()
_cancelled_downloads: set[str] = set()
_paused_downloads: set[str] = set()
_download_errors: dict[str, str] = {}
_state_lock = threading.Lock()
_download_queue: queue.Queue[ASRModelConfig] = queue.Queue()
_download_worker_started = False
_migration_progress: dict[str, Any] = {"status": "idle", "progress": 0, "current": 0, "total": 0, "message": None, "errors": []}
DOWNLOAD_PROGRESS_POLL_SECONDS = 0.5
HF_DUPLICATE_WEIGHT_IGNORE_PATTERNS = ["pytorch_model*.bin", "*.fp32.*", "*.fp32-*"]


class DownloadStopped(RuntimeError):
    pass


def _download_checkpoint(model_name: str) -> None:
    while True:
        with _state_lock:
            if model_name in _cancelled_downloads:
                raise DownloadStopped("Download stopped")
            paused = model_name in _paused_downloads
        if not paused:
            return
        state = get_progress_manager().get_progress(model_name) or {}
        get_progress_manager().update_progress(
            model_name,
            int(state.get("current") or 0),
            int(state.get("total") or 0),
            filename=state.get("filename"),
            status="paused",
            source=state.get("source"),
            repo_id=state.get("repo_id"),
            fallback_from=state.get("fallback_from"),
        )
        threading.Event().wait(0.05)

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
    return model_dir.exists() and any(
        ".cache" not in path.relative_to(model_dir).parts
        for path in model_dir.rglob("*.incomplete")
    )


def _has_weight_files(model_dir: Path) -> bool:
    if not model_dir.exists():
        return False
    return any(path.is_file() and path.suffix.lower() in WEIGHT_EXTENSIONS for path in model_dir.rglob("*"))


def _has_any(model_dir: Path, names: tuple[str, ...]) -> bool:
    return any((model_dir / name).exists() for name in names) or any(path.name in names for path in model_dir.rglob("*"))


def _has_glob(model_dir: Path, patterns: tuple[str, ...]) -> bool:
    return any(any(model_dir.rglob(pattern)) for pattern in patterns)


def _directory_size(path: Path) -> int:
    total = 0
    if not path.exists():
        return total
    for item in path.rglob("*"):
        try:
            if item.is_file():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def _utc_iso() -> str:
    return datetime.now(UTC).isoformat()


def _source_candidates(model_config: ASRModelConfig) -> list[ModelSourceCandidate]:
    candidates = model_config.source_candidates or []
    if not candidates and model_config.source and model_config.repo_id:
        candidates = [ModelSourceCandidate(model_config.source, model_config.repo_id, priority=100, verified=True)]
    return sorted(candidates, key=lambda item: item.priority)


def _candidate_dicts(model_config: ASRModelConfig) -> list[dict[str, Any]]:
    return [asdict(candidate) for candidate in _source_candidates(model_config)]


def _preferred_source(model_config: ASRModelConfig) -> str | None:
    candidates = _source_candidates(model_config)
    return candidates[0].source if candidates else model_config.source


def _read_model_marker(model_name: str) -> dict[str, Any]:
    marker_path = _model_dir(model_name) / "model.json"
    if not marker_path.exists():
        return {}
    try:
        parsed = json.loads(marker_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {}
    return parsed if isinstance(parsed, dict) else {}


def _cache_info(model_config: ASRModelConfig) -> dict[str, Any]:
    candidates = _source_candidates(model_config)
    if candidates:
        for candidate in candidates:
            candidate_config = replace(model_config, source=candidate.source, repo_id=candidate.repo_id)
            cache = _cache_info_for_source(candidate_config)
            if cache["detected"]:
                return cache
        return {"detected": False, "size_mb": None, "path": None}
    return _cache_info_for_source(model_config)


def _cache_info_for_source(model_config: ASRModelConfig) -> dict[str, Any]:
    if not model_config.repo_id:
        return {"detected": False, "size_mb": None, "path": None}
    if model_config.source == "modelscope":
        return _modelscope_cache_info(model_config)
    return _huggingface_cache_info(model_config)


def _huggingface_cache_info(model_config: ASRModelConfig) -> dict[str, Any]:
    try:
        from huggingface_hub import scan_cache_dir

        cache_info = scan_cache_dir(config.get_model_cache_dir("huggingface") / "hub")
    except Exception:
        return {"detected": False, "size_mb": None, "path": None}
    for repo in cache_info.repos:
        if repo.repo_id != model_config.repo_id:
            continue
        has_weight = False
        has_incomplete = False
        for revision in repo.revisions:
            for file_info in revision.files:
                name = file_info.file_name.lower()
                if name.endswith(".incomplete"):
                    has_incomplete = True
                if name.endswith(WEIGHT_EXTENSIONS):
                    has_weight = True
        if has_weight and not has_incomplete:
            try:
                size_mb = sum(revision.size_on_disk for revision in repo.revisions) / (1024 * 1024)
            except Exception:
                size_mb = None
            path = None
            try:
                path = str(next(iter(repo.revisions)).snapshot_path)
            except Exception:
                pass
            return {"detected": True, "size_mb": size_mb, "path": path}
    return {"detected": False, "size_mb": None, "path": None}


def _modelscope_cache_info(model_config: ASRModelConfig) -> dict[str, Any]:
    candidates: list[Path] = []
    repo_id = model_config.repo_id or ""
    safe_parts = repo_id.split("/")
    env_cache = Path(str(Path.home() / ".cache" / "modelscope"))
    if "MODELSCOPE_CACHE" in os.environ:
        env_cache = Path(os.environ["MODELSCOPE_CACHE"]).expanduser()
    for root in (env_cache, Path.home() / ".cache" / "modelscope" / "hub"):
        if len(safe_parts) == 2:
            candidates.append(root / safe_parts[0] / safe_parts[1])
            candidates.append(root / safe_parts[1])
        candidates.append(root / repo_id.replace("/", "___"))
    for path in candidates:
        if path.exists() and _has_weight_files(path) and not _has_incomplete_files(path):
            return {"detected": True, "size_mb": _directory_size(path) / (1024 * 1024), "path": str(path)}
    return {"detected": False, "size_mb": None, "path": None}


def _start_directory_progress_tracker(model_config: ASRModelConfig, model_dir: Path, stop_event: threading.Event) -> threading.Thread:
    progress = get_progress_manager()
    estimated_total = max(model_config.size_mb * 1024 * 1024, 1)

    def poll() -> None:
        while not stop_event.wait(DOWNLOAD_PROGRESS_POLL_SECONDS):
            with _state_lock:
                if model_config.model_name in _cancelled_downloads:
                    return
                paused = model_config.model_name in _paused_downloads
            current = _directory_size(model_dir)
            if current <= 0:
                continue
            progress.update_progress(
                model_config.model_name,
                min(current, estimated_total - 1),
                estimated_total,
                filename="Downloading files...",
                status="paused" if paused else "downloading",
            )

    thread = threading.Thread(target=poll, daemon=True)
    thread.start()
    return thread


def is_model_downloaded(model_name: str) -> bool:
    if _has_incomplete_files(_model_dir(model_name)):
        return False
    if _is_local_model_downloaded(model_name):
        return True
    with _state_lock:
        if model_name in _download_errors:
            return False
    return False


def _is_local_model_downloaded(model_name: str) -> bool:
    model_dir = _model_dir(model_name)
    return (model_dir / "model.json").exists() and _has_weight_files(model_dir) and not _has_incomplete_files(model_dir)


def is_model_directory_valid(model_name: str, model_dir: Path) -> bool:
    return get_model_config(model_name) is not None and (model_dir / "model.json").exists() and _has_weight_files(model_dir) and not _has_incomplete_files(model_dir)


def check_model_compatibility(model_name: str) -> dict[str, Any]:
    model_config = get_model_config(model_name)
    model_dir = _model_dir(model_name)
    downloaded = is_model_downloaded(model_name)
    if model_config is None:
        return {"model_name": model_name, "downloaded": False, "compatible": False, "missing": ["model registry entry"], "message": f"Unknown model: {model_name}", "code": "unknown_model"}
    runtime_error = _model_runtime_error(model_config)
    if runtime_error:
        return {"model_name": model_name, "downloaded": downloaded, "compatible": False, "missing": ["compatible runtime"], "message": runtime_error, "code": "runtime_incompatible"}
    if not downloaded:
        return {"model_name": model_name, "downloaded": False, "compatible": False, "missing": ["model.json", "weights"], "message": f"Model {model_name} is not downloaded", "code": "model_not_downloaded"}

    missing: list[str] = []
    engine = model_config.engine
    if engine == "whisper_transformers":
        if not _has_any(model_dir, ("config.json",)):
            missing.append("config.json")
        if not _has_any(model_dir, ("tokenizer.json", "vocab.json", "merges.txt")):
            missing.append("tokenizer")
        if not _has_any(model_dir, ("preprocessor_config.json", "feature_extractor_config.json")):
            missing.append("preprocessor")
        if not _has_weight_files(model_dir):
            missing.append("weights")
    elif engine == "faster_whisper":
        if not _has_any(model_dir, ("model.bin",)) and not _has_glob(model_dir, ("*.safetensors", "*.bin")):
            missing.append("model.bin")
        if not _has_any(model_dir, ("tokenizer.json", "vocabulary.json")):
            missing.append("tokenizer")
        if not _has_any(model_dir, ("config.json",)):
            missing.append("config.json")
    elif engine == "funasr":
        for required in ("config.yaml", "model.pt", "am.mvn"):
            if not _has_any(model_dir, (required,)):
                missing.append(required)
        if not torchaudio_available():
            missing.append("torchaudio runtime")
        if not funasr_available():
            missing.append("funasr runtime")
    elif engine == "mlx_whisper":
        if not _has_weight_files(model_dir):
            missing.append("mlx weights")
        if not _has_any(model_dir, ("config.json", "tokenizer.json")):
            missing.append("config/tokenizer")
    elif engine == "qwen3_asr":
        if not _has_any(model_dir, ("config.json",)):
            missing.append("config.json")
        if not _has_any(model_dir, ("tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt")):
            missing.append("tokenizer")
        if not _has_any(model_dir, ("processor_config.json", "preprocessor_config.json", "chat_template.json")):
            missing.append("processor/chat_template")
        if not _has_weight_files(model_dir):
            missing.append("weights")
        if not qwen3_asr_available():
            missing.append("transformers Qwen3-ASR support")
    elif engine == "moss_transcribe_diarize":
        if not _has_any(model_dir, ("config.json",)):
            missing.append("config.json")
        if not _has_any(model_dir, ("tokenizer.json", "tokenizer_config.json", "vocab.json", "merges.txt")):
            missing.append("tokenizer")
        if not _has_any(model_dir, ("processor_config.json", "preprocessor_config.json", "chat_template.json", "chat_template.jinja")):
            missing.append("processor/chat_template")
        if not _has_glob(model_dir, ("*.py",)):
            missing.append("remote code")
        if not _has_weight_files(model_dir):
            missing.append("weights")
        if not moss_transcribe_diarize_available():
            missing.append("moss-transcribe-diarize runtime")
    else:
        missing.append(f"unsupported engine: {engine}")

    compatible = not missing
    return {
        "model_name": model_name,
        "downloaded": downloaded,
        "compatible": compatible,
        "missing": missing,
        "message": "Compatible" if compatible else f"Missing required files: {', '.join(missing)}",
        "code": None if compatible else "missing_files",
    }


def _model_runtime_error(model_config: ASRModelConfig) -> str | None:
    if model_config.engine != "mlx_whisper":
        return None
    if platform.system() != "Darwin" or platform.machine().lower() not in {"arm64", "aarch64"}:
        return "MLX Whisper requires the macOS Apple Silicon desktop runtime and is unavailable in Linux containers"
    return mlx_runtime_import_error()


def list_model_statuses() -> list[ASRModelStatus]:
    statuses: list[ASRModelStatus] = []
    storage = model_storage.inspect_storage()
    storage_available = bool(storage["available"])
    progress = get_progress_manager()
    for item in get_all_model_configs():
        progress_state = progress.get_progress(item.model_name)
        downloaded = is_model_downloaded(item.model_name) if storage_available else None
        error = None if downloaded else _download_errors.get(item.model_name)
        if progress_state and progress_state.get("status") == "error":
            error = None if downloaded else progress_state.get("error") or error
        size_on_disk_mb = round(_directory_size(_model_dir(item.model_name)) / (1024 * 1024), 2) if storage_available else 0
        marker = _read_model_marker(item.model_name) if storage_available else {}
        cache = _cache_info(item) if storage_available else {"detected": False, "size_mb": 0, "path": None}
        compatibility = check_model_compatibility(item.model_name) if storage_available else {"downloaded": False, "compatible": False, "message": "模型存储位置不可用"}
        runtime_error = _model_runtime_error(item)
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
                supported_devices=item.supported_devices,
                supports_timestamps=item.supports_timestamps,
                supports_word_timestamps=item.supports_word_timestamps,
                supports_diarization=item.supports_diarization,
                supports_streaming=item.supports_streaming,
                downloaded=downloaded,
                downloading=item.model_name in _active_downloads,
                loaded=is_model_loaded(item.model_name, item.engine),
                error=error,
                size_on_disk_mb=size_on_disk_mb,
                download_error=error,
                compatible=False if runtime_error else compatibility["compatible"] if compatibility["downloaded"] else None,
                compatibility_error=runtime_error or (None if compatibility["compatible"] else compatibility["message"]),
                compatibility_error_code="runtime_incompatible" if runtime_error else (None if compatibility["compatible"] else compatibility.get("code")),
                cache_detected=bool(cache["detected"]),
                cache_size_mb=round(cache["size_mb"], 2) if cache["size_mb"] else None,
                cache_path=cache["path"],
                preferred_source=_preferred_source(item),
                source_candidates=_candidate_dicts(item),
                installed_source=marker.get("source"),
                installed_repo_id=marker.get("repo_id"),
                last_verified_at=marker.get("last_verified_at") or marker.get("installed_at"),
                storage_status="migrating" if model_storage.relocation_active() else storage["status"],
                storage_error="模型存储位置不可用" if not storage_available else None,
            )
        )
    return statuses


def _write_model_marker(model_config: ASRModelConfig, snapshot_path: str) -> None:
    size_on_disk_mb = round(_directory_size(_model_dir(model_config.model_name)) / (1024 * 1024), 6)
    marker = {
        "model_name": model_config.model_name,
        "repo_id": model_config.repo_id,
        "source": model_config.source,
        "engine": model_config.engine,
        "snapshot_path": snapshot_path,
        "installed_at": _utc_iso(),
        "last_verified_at": _utc_iso(),
        "size_on_disk_mb": size_on_disk_mb,
    }
    (_model_dir(model_config.model_name) / "model.json").write_text(
        json.dumps(marker, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


def _download_huggingface_snapshot(model_config: ASRModelConfig, model_dir: Path) -> str:
    if not model_config.repo_id:
        raise ValueError(f"Model {model_config.model_name} does not define a Hugging Face repo")

    from huggingface_hub import snapshot_download

    with track_hf_download(
        model_config.model_name,
        get_progress_manager(),
        checkpoint=lambda: _download_checkpoint(model_config.model_name),
    ):
        return snapshot_download(
            repo_id=model_config.repo_id,
            cache_dir=str(config.get_model_cache_dir("huggingface") / "hub"),
            local_dir=str(model_dir),
            allow_patterns=model_config.allow_patterns,
            ignore_patterns=HF_DUPLICATE_WEIGHT_IGNORE_PATTERNS,
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
    with track_hf_download(
        model_config.model_name,
        get_progress_manager(),
        checkpoint=lambda: _download_checkpoint(model_config.model_name),
    ):
        return snapshot_download(
            model_id=model_config.repo_id,
            cache_dir=str(config.get_model_cache_dir("modelscope")),
            local_dir=str(model_dir),
        )


def _run_download(model_config: ASRModelConfig) -> None:
    model_name = model_config.model_name
    model_dir = _model_dir(model_name)
    progress = get_progress_manager()
    stop_progress = threading.Event()
    progress_thread: threading.Thread | None = None
    try:
        model_storage.require_storage(writable=True)
        _download_checkpoint(model_name)
        model_dir.mkdir(parents=True, exist_ok=True)
        progress_thread = _start_directory_progress_tracker(model_config, model_dir, stop_progress)
        candidates = _source_candidates(model_config)
        errors: list[str] = []
        snapshot_path = ""
        installed_config = model_config
        for index, candidate in enumerate(candidates):
            _download_checkpoint(model_name)
            candidate_config = replace(model_config, source=candidate.source, repo_id=candidate.repo_id)
            progress.update_progress(
                model_name,
                0,
                0,
                filename=f"Connecting to {candidate.source}...",
                status="downloading",
                source=candidate.source,
                repo_id=candidate.repo_id,
                fallback_from=candidates[index - 1].source if index else None,
            )
            try:
                if candidate.source == "modelscope":
                    snapshot_path = _download_modelscope_snapshot(candidate_config, model_dir)
                elif candidate.source == "huggingface":
                    snapshot_path = _download_huggingface_snapshot(candidate_config, model_dir)
                else:
                    raise RuntimeError(f"Unsupported model source: {candidate.source}")
                installed_config = candidate_config
                break
            except Exception as exc:
                errors.append(str(exc) if len(candidates) == 1 else f"{candidate.source}:{candidate.repo_id}: {exc}")
                if index < len(candidates) - 1:
                    progress.update_progress(
                        model_name,
                        0,
                        0,
                        filename=f"Falling back from {candidate.source}...",
                        status="downloading",
                        error=str(exc),
                        source=candidate.source,
                        repo_id=candidate.repo_id,
                    )
                    continue
                raise RuntimeError("; ".join(errors)) from exc

        _download_checkpoint(model_name)

        if not _has_weight_files(model_dir):
            raise RuntimeError("Model download finished but no model weight files were found")
        if _has_incomplete_files(model_dir):
            raise RuntimeError("Model download has incomplete files")

        with _state_lock:
            cancelled = model_name in _cancelled_downloads
        if cancelled:
            progress.update_progress(model_name, 0, 0, status="cancelled", error="Download cancelled")
            return

        _write_model_marker(installed_config, snapshot_path)
        stop_progress.set()
        if progress_thread:
            progress_thread.join(timeout=1)
        progress.mark_complete(model_name)
    except DownloadStopped:
        stop_progress.set()
        if progress_thread:
            progress_thread.join(timeout=1)
        progress.update_progress(model_name, 0, 0, status="cancelled", error="Download stopped")
    except Exception as exc:
        stop_progress.set()
        if progress_thread:
            progress_thread.join(timeout=1)
        error = str(exc)
        with _state_lock:
            _download_errors[model_name] = error
        progress.mark_error(model_name, error)
    finally:
        stop_progress.set()
        if progress_thread:
            progress_thread.join(timeout=1)
        with _state_lock:
            _active_downloads.discard(model_name)
            _cancelled_downloads.discard(model_name)
            _paused_downloads.discard(model_name)


def _download_worker() -> None:
    while True:
        model_config = _download_queue.get()
        try:
            _run_download(model_config)
        finally:
            _download_queue.task_done()


def _ensure_download_worker() -> None:
    global _download_worker_started
    with _state_lock:
        if _download_worker_started:
            return
        thread = threading.Thread(target=_download_worker, daemon=True)
        thread.start()
        _download_worker_started = True


def download_model(model_name: str) -> str:
    model_storage.require_storage(writable=True)
    model_config = get_model_config(model_name)
    if model_config is None:
        raise ValueError(f"Unknown model: {model_name}")
    runtime_error = _model_runtime_error(model_config)
    if runtime_error:
        raise ValueError(runtime_error)

    if _is_local_model_downloaded(model_name):
        return f"Model {model_name} is already downloaded"

    with _state_lock:
        if model_name in _active_downloads:
            return f"Model {model_name} download already running"
        _active_downloads.add(model_name)
        _cancelled_downloads.discard(model_name)
        _paused_downloads.discard(model_name)
        _download_errors.pop(model_name, None)

    progress = get_progress_manager()
    progress.update_progress(
        model_name,
        0,
        0,
        filename="Connecting to model hub...",
        status="downloading",
    )

    _ensure_download_worker()
    _download_queue.put(model_config)
    return f"Model {model_name} download started"


def redownload_model(model_name: str) -> str:
    model_storage.require_storage(writable=True)
    model_config = get_model_config(model_name)
    if model_config is None:
        raise ValueError(f"Unknown model: {model_name}")
    delete_model(model_name)
    return download_model(model_name)


def unload_model(model_name: str) -> bool:
    model_config = get_model_config(model_name)
    if model_config is None:
        return False
    return unload_local_model(model_name, model_config.engine)


def delete_model(model_name: str) -> None:
    model_storage.require_storage(writable=True)
    if get_model_config(model_name) is None:
        raise ValueError(f"Unknown model: {model_name}")
    target = _model_dir(model_name).resolve()
    if not target.is_relative_to(config.get_models_dir().resolve()):
        raise ValueError(f"Unknown model: {model_name}")
    unload_model(model_name)
    shutil.rmtree(target, ignore_errors=True)
    with _state_lock:
        _active_downloads.discard(model_name)
        _cancelled_downloads.discard(model_name)
        _paused_downloads.discard(model_name)
        _download_errors.pop(model_name, None)
    get_progress_manager().clear_progress(model_name)


def active_downloads() -> list[dict[str, Any]]:
    progress = get_progress_manager()
    items = []
    with _state_lock:
        names = set(_active_downloads)
    for model_name in names:
        state = progress.get_progress(model_name) or {"model_name": model_name, "status": "downloading"}
        items.append(state)
    return items


def cancel_download(model_name: str) -> bool:
    with _state_lock:
        if model_name not in _active_downloads:
            return False
        _cancelled_downloads.add(model_name)
        _paused_downloads.discard(model_name)
    get_progress_manager().update_progress(
        model_name,
        0,
        0,
        status="cancelled",
        error="Download cancellation requested",
    )
    return True


def pause_download(model_name: str) -> bool:
    with _state_lock:
        if model_name not in _active_downloads or model_name in _cancelled_downloads:
            return False
        _paused_downloads.add(model_name)
    state = get_progress_manager().get_progress(model_name) or {}
    get_progress_manager().update_progress(
        model_name,
        int(state.get("current") or 0),
        int(state.get("total") or 0),
        filename=state.get("filename"),
        status="paused",
        source=state.get("source"),
        repo_id=state.get("repo_id"),
        fallback_from=state.get("fallback_from"),
    )
    return True


def resume_download(model_name: str) -> bool:
    with _state_lock:
        if model_name not in _active_downloads or model_name not in _paused_downloads:
            return False
        _paused_downloads.discard(model_name)
    state = get_progress_manager().get_progress(model_name) or {}
    get_progress_manager().update_progress(
        model_name,
        int(state.get("current") or 0),
        int(state.get("total") or 0),
        filename=state.get("filename"),
        status="downloading",
        source=state.get("source"),
        repo_id=state.get("repo_id"),
        fallback_from=state.get("fallback_from"),
    )
    return True


def retry_download(model_name: str) -> str:
    return download_model(model_name)


def storage_summary() -> dict[str, Any]:
    storage = model_storage.inspect_storage()
    items = []
    total = 0
    for item in get_all_model_configs():
        model_dir = _model_dir(item.model_name)
        size_bytes = _directory_size(model_dir)
        total += size_bytes
        items.append(
            {
                "model_name": item.model_name,
                "path": str(model_dir),
                "exists": model_dir.exists(),
                "size_bytes": size_bytes,
                "size_on_disk_mb": round(size_bytes / (1024 * 1024), 2),
                "downloaded": is_model_downloaded(item.model_name) if storage["available"] else None,
            }
        )
    free_disk_bytes = storage["free_bytes"]
    total_disk_bytes = storage["total_bytes"]
    cache_usage = [
        {
            "name": name,
            "path": storage["cache_dirs"][name],
            "size_bytes": size,
            "shared": False,
            "selected": True,
            "warning": None,
        }
        for name, size in storage["cache_usage"].items()
    ]
    return {
        "root": storage["root"],
        "models_dir": str(config.get_models_dir()),
        "models": items,
        "status": "migrating" if model_storage.relocation_active() else storage["status"],
        "reason": storage["reason"],
        "detail": storage["detail"],
        "available": storage["available"],
        "writable": storage["writable"],
        "cache_dirs": storage["cache_dirs"],
        "cache_usage": cache_usage,
        "cache_bytes": storage["cache_bytes"],
        "allowed_roots": storage["allowed_roots"],
        "root_locked": storage["root_locked"],
        "runtime": storage["runtime"],
        "network_filesystem": storage["network_filesystem"],
        "filesystem_type": storage["filesystem_type"],
        "used_bytes": total + storage["cache_bytes"],
        "free_bytes": free_disk_bytes,
        "total_bytes": total_disk_bytes,
        "total_size_mb": round(total / (1024 * 1024), 2),
        "free_disk_bytes": free_disk_bytes,
    }


def cleanup_incomplete() -> dict[str, Any]:
    model_storage.require_storage(writable=True)
    removed: list[str] = []
    errors: list[str] = []
    models_dir = config.get_models_dir()
    if not models_dir.exists():
        return {"removed": removed, "errors": errors}
    for item in models_dir.iterdir():
        if not item.is_dir():
            continue
        should_remove = _has_incomplete_files(item) or not (item / "model.json").exists() or not _has_weight_files(item)
        if not should_remove:
            continue
        try:
            shutil.rmtree(item)
            removed.append(item.name)
        except OSError as exc:
            errors.append(f"{item.name}: {exc}")
    return {"removed": removed, "errors": errors}


def migrate_models(source: Path | None = None, destination: Path | None = None) -> dict[str, Any]:
    global _migration_progress
    if destination is None:
        model_storage.require_storage(writable=True)
    source_dir = source or config.get_models_dir()
    destination_dir = destination or config.get_models_dir()
    destination_dir.mkdir(parents=True, exist_ok=True)
    moved = 0
    errors: list[str] = []
    if not source_dir.exists():
        return {"source": str(source_dir), "destination": str(destination_dir), "moved": moved, "errors": ["source does not exist"]}
    items = [item for item in source_dir.iterdir() if item.is_dir()]
    _migration_progress = {"status": "running", "progress": 0, "current": 0, "total": len(items), "message": "Migrating models", "errors": []}
    staging = destination_dir / f".asrbox-legacy-migration-{uuid.uuid4().hex}"
    try:
        conflicts = [item.name for item in items if item.resolve() != (destination_dir / item.name).resolve() and (destination_dir / item.name).exists()]
        if conflicts:
            raise FileExistsError(f"target entries exist: {', '.join(conflicts)}")
        staging.mkdir()
        for index, item in enumerate(items, 1):
            target = destination_dir / item.name
            if item.resolve() == target.resolve():
                continue
            staged = staging / item.name
            shutil.copytree(item, staged)
            if _directory_size(item) != _directory_size(staged):
                raise OSError(f"verification failed: {item.name}")
            _migration_progress.update({"current": index, "progress": round(index / max(len(items), 1) * 100, 2), "message": f"Verified {item.name}"})
        for item in items:
            staged = staging / item.name
            if staged.exists():
                os.replace(staged, destination_dir / item.name)
        for item in items:
            if item.resolve() != (destination_dir / item.name).resolve():
                shutil.rmtree(item)
                moved += 1
    except OSError as exc:
        errors.append(str(exc))
        _migration_progress["errors"] = errors
    finally:
        shutil.rmtree(staging, ignore_errors=True)
    _migration_progress.update({"status": "complete" if not errors else "error", "progress": 100, "current": len(items), "message": "Migration complete", "errors": errors, "completed_at": _utc_iso()})
    return {"source": str(source_dir), "destination": str(destination_dir), "moved": moved, "errors": errors, "verification": verify_models()}


def migration_progress() -> dict[str, Any]:
    return dict(_migration_progress)


def ensure_model_ready(model_name: str) -> None:
    model_storage.require_storage()
    if get_model_config(model_name) is None:
        raise ValueError(f"Unknown model: {model_name}")
    if not is_model_downloaded(model_name):
        raise ASRboxError("MODEL_NOT_DOWNLOADED", f"Model {model_name} is not downloaded", stage="waiting_model")
    compatibility = check_model_compatibility(model_name)
    if not compatibility["compatible"]:
        raise ASRboxError("MODEL_COMPATIBILITY_FAILED", compatibility["message"], stage="waiting_model")


def verify_models() -> list[dict[str, Any]]:
    model_storage.require_storage()
    return [check_model_compatibility(item.model_name) for item in get_all_model_configs()]


def recommend_model(request: ModelRecommendationRequest) -> ModelRecommendationResponse:
    language = (request.language or "").lower()
    is_chinese = language in {"zh", "zho", "cmn", "yue", "chinese", "auto"}
    long_audio = bool(request.duration_ms and request.duration_ms > 30 * 60 * 1000)

    candidates: list[str] = []
    if is_chinese:
        candidates.extend(["qwen3-asr-0.6b", "sensevoice-small"])
    if platform.machine().lower() in {"arm64", "aarch64"}:
        candidates.append("mlx-whisper-turbo")
    try:
        import torch

        cuda = bool(torch.cuda.is_available())
    except Exception:
        cuda = False
    if cuda:
        candidates.extend(["faster-whisper-large-v3" if request.allow_large_model else "faster-whisper-medium", "faster-whisper-small"])
    elif long_audio or request.prefer_speed:
        candidates.extend(["faster-whisper-small", "faster-whisper-base"])
    elif request.prefer_accuracy and request.allow_large_model:
        candidates.extend(["qwen3-asr-1.7b", "whisper-large-v3", "faster-whisper-large-v3"])
    candidates.extend(["faster-whisper-small", "whisper-base"])

    seen = set()
    for model_name in candidates:
        if model_name in seen:
            continue
        seen.add(model_name)
        config_item = get_model_config(model_name)
        if config_item is None:
            continue
        compatibility = check_model_compatibility(model_name)
        downloaded = compatibility["downloaded"]
        if compatibility["compatible"] or not downloaded:
            reason = "中文优先推荐 SenseVoice" if model_name == "sensevoice-small" else "根据当前硬件和任务长度推荐"
            return ModelRecommendationResponse(
                model_name=model_name,
                display_name=config_item.display_name,
                reason=reason,
                downloaded=downloaded,
                compatible=compatibility["compatible"],
                download_required=not downloaded,
            )
    fallback = get_model_config("whisper-base")
    compatibility = check_model_compatibility("whisper-base")
    return ModelRecommendationResponse(
        model_name="whisper-base",
        display_name=fallback.display_name if fallback else "Whisper Base",
        reason="默认兜底模型",
        downloaded=compatibility["downloaded"],
        compatible=compatibility["compatible"],
        download_required=not compatibility["downloaded"],
    )
