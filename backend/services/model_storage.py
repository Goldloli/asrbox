from __future__ import annotations

import json
import hashlib
import os
from pathlib import Path
import shutil
import threading
import uuid
from typing import Any
from contextlib import contextmanager

from backend import config

NETWORK_FILESYSTEMS = {
    "9p",
    "afpfs",
    "cifs",
    "davfs",
    "fuse.sshfs",
    "nfs",
    "nfs4",
    "smbfs",
}
RELOCATION_STATE_FILENAME = "model-storage-relocation.json"
MIN_RELOCATION_HEADROOM_BYTES = 64 * 1024 * 1024
_job_lock = threading.Lock()
_cancel_event = threading.Event()
_job: dict[str, Any] = {"status": "idle", "phase": "idle", "progress": 0}
_operation_lock = threading.Lock()
_active_operations: set[str] = set()


class RelocationCancelled(RuntimeError):
    pass


@contextmanager
def model_operation(label: str):
    require_storage()
    with _operation_lock:
        _active_operations.add(label)
    try:
        yield
    finally:
        with _operation_lock:
            _active_operations.discard(label)


def directory_size(path: Path) -> int:
    if not path.exists():
        return 0
    total = 0
    for item in path.rglob("*"):
        try:
            if item.is_file() and not item.is_symlink():
                total += item.stat().st_size
        except OSError:
            continue
    return total


def _filesystem_type(path: Path) -> str | None:
    mounts = Path("/proc/mounts")
    if not mounts.is_file():
        return None
    best: tuple[int, str] | None = None
    try:
        lines = mounts.read_text(encoding="utf-8").splitlines()
    except OSError:
        return None
    for line in lines:
        fields = line.split()
        if len(fields) < 3:
            continue
        mount = Path(fields[1].replace("\\040", " "))
        try:
            path.relative_to(mount)
        except ValueError:
            continue
        candidate = (len(mount.parts), fields[2].lower())
        if best is None or candidate[0] > best[0]:
            best = candidate
    return best[1] if best else None


def _has_symlink_component(path: Path) -> bool:
    current = Path(path.anchor) if path.is_absolute() else Path()
    for part in path.parts[1:] if path.is_absolute() else path.parts:
        current /= part
        try:
            if current.is_symlink():
                return True
        except OSError:
            return True
    return False


def _has_managed_symlink(path: Path) -> bool:
    try:
        for root in (path / "models", path / "cache"):
            if root.is_symlink():
                return True
            if root.is_dir() and any(item.is_symlink() for item in root.rglob("*")):
                return True
    except OSError:
        return True
    return False


def inspect_storage() -> dict[str, Any]:
    root = config.get_model_storage_root()
    models_dir = root / "models"
    cache_dirs = config.get_model_cache_dirs()
    status = "available"
    reason: str | None = None
    detail: str | None = None
    writable = False
    total_bytes: int | None = None
    free_bytes: int | None = None

    try:
        if not root.exists():
            status, reason = "unavailable", "path_missing"
        elif not root.is_dir():
            status, reason = "unavailable", "not_a_directory"
        else:
            writable = os.access(root, os.W_OK | os.X_OK)
            if not writable:
                status, reason = "read_only", "not_writable"
            usage = shutil.disk_usage(root)
            total_bytes, free_bytes = usage.total, usage.free
    except OSError as exc:
        status, reason, detail = "unavailable", "io_error", str(exc)

    cache_usage = {name: directory_size(path) if status != "unavailable" else 0 for name, path in cache_dirs.items()}
    model_bytes = directory_size(models_dir) if status != "unavailable" else 0
    filesystem_type = _filesystem_type(root) if status != "unavailable" else None
    return {
        "root": str(root),
        "models_dir": str(models_dir),
        "cache_dirs": {name: str(path) for name, path in cache_dirs.items()},
        "status": status,
        "reason": reason,
        "detail": detail,
        "available": status != "unavailable",
        "writable": writable,
        "model_bytes": model_bytes,
        "cache_bytes": sum(cache_usage.values()),
        "cache_usage": cache_usage,
        "used_bytes": model_bytes + sum(cache_usage.values()),
        "total_bytes": total_bytes,
        "free_bytes": free_bytes,
        "filesystem_type": filesystem_type,
        "network_filesystem": filesystem_type in NETWORK_FILESYSTEMS if filesystem_type else False,
        "allowed_roots": [str(path) for path in config.get_allowed_model_storage_roots()],
        "root_locked": config.model_storage_root_is_locked(),
        "runtime": "container" if os.environ.get("ASRBOX_CONTAINER") == "1" else "desktop",
    }


def validate_candidate(candidate: str | Path, *, probe_write: bool = True) -> dict[str, Any]:
    path = Path(candidate).expanduser().absolute()
    errors: list[str] = []
    warnings: list[str] = []
    if _has_symlink_component(path) or (path.is_dir() and _has_managed_symlink(path)):
        errors.append("symbolic_links_not_allowed")
    if not path.exists():
        errors.append("path_missing")
    elif not path.is_dir():
        errors.append("not_a_directory")

    allowed = config.get_allowed_model_storage_roots()
    if os.environ.get("ASRBOX_CONTAINER") == "1" and path not in allowed:
        errors.append("path_not_allowed")

    filesystem_type = _filesystem_type(path) if path.exists() else None
    network = filesystem_type in NETWORK_FILESYSTEMS if filesystem_type else False
    if network:
        warnings.append("network_filesystem")

    writable = False
    if not errors and probe_write:
        probe = path / f".asrbox-write-probe-{uuid.uuid4().hex}"
        try:
            probe.write_text("ok", encoding="utf-8")
            writable = True
        except OSError:
            errors.append("not_writable")
        finally:
            probe.unlink(missing_ok=True)
    elif not errors:
        writable = os.access(path, os.W_OK | os.X_OK)

    total_bytes = free_bytes = None
    if path.exists() and path.is_dir():
        try:
            usage = shutil.disk_usage(path)
            total_bytes, free_bytes = usage.total, usage.free
        except OSError:
            errors.append("disk_usage_unavailable")

    return {
        "path": str(path),
        "valid": not errors,
        "writable": writable,
        "errors": errors,
        "warnings": warnings,
        "filesystem_type": filesystem_type,
        "network_filesystem": network,
        "total_bytes": total_bytes,
        "free_bytes": free_bytes,
    }


def relocation_state_path() -> Path:
    return config.get_data_dir() / RELOCATION_STATE_FILENAME


def write_relocation_state(payload: dict[str, Any]) -> None:
    path = relocation_state_path()
    temporary = path.with_name(f".{path.name}.{uuid.uuid4().hex}.tmp")
    temporary.write_text(json.dumps(payload, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    os.replace(temporary, path)


def recover_interrupted_relocation() -> dict[str, Any] | None:
    global _job
    path = relocation_state_path()
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    if payload.get("status") in {"running", "cancelling"}:
        target_root = payload.get("target_root")
        staging = None
        if target_root and payload.get("id"):
            staging = Path(str(target_root)) / f".asrbox-relocation-{payload['id']}.staging"
        cleanup_paths = [str(staging)] if staging is not None and staging.exists() else []
        payload.update(
            {
                "status": "failed",
                "phase": "interrupted",
                "error_code": "RELOCATION_INTERRUPTED",
                "error": "Model storage relocation was interrupted",
                "cleanup_required": bool(cleanup_paths),
                "cleanup_paths": cleanup_paths,
            }
        )
        write_relocation_state(payload)
    with _job_lock:
        _job = payload
    return payload


def _known_shared_caches() -> list[tuple[str, Path]]:
    home = Path.home()
    return [
        ("huggingface", home / ".cache" / "huggingface"),
        ("modelscope", home / ".cache" / "modelscope"),
        ("torch", home / ".cache" / "torch"),
    ]


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _files_equivalent(source: Path, target: Path) -> bool:
    try:
        return source.stat().st_size == target.stat().st_size and _file_hash(source) == _file_hash(target)
    except OSError:
        return False


def _tree_conflicts(source: Path, target: Path, label: str) -> list[str]:
    if not source.exists() or not target.exists():
        return []
    conflicts: list[str] = []
    for source_file in source.rglob("*"):
        if not source_file.is_file() or source_file.is_symlink():
            continue
        relative = source_file.relative_to(source)
        target_file = target / relative
        if target_file.exists() and (not target_file.is_file() or not _files_equivalent(source_file, target_file)):
            conflicts.append(f"{label}/{relative}")
    return conflicts


def _model_names_at(root: Path) -> tuple[list[str], list[str]]:
    from backend.backends import get_all_model_configs
    from backend.services import models as model_service

    valid: list[str] = []
    incomplete: list[str] = []
    for item in get_all_model_configs():
        model_dir = root / "models" / item.model_name
        if not model_dir.exists():
            continue
        if model_service.is_model_directory_valid(item.model_name, model_dir):
            valid.append(item.model_name)
        else:
            incomplete.append(item.model_name)
    return valid, incomplete


def _active_blockers(db=None) -> list[str]:
    from backend.backends import get_all_model_configs
    from backend.backends.local_asr import is_model_loaded
    from backend.services import models as model_service

    blockers = [f"download:{item.get('model_name', 'unknown')}" for item in model_service.active_downloads()]
    with _operation_lock:
        blockers.extend(f"operation:{label}" for label in sorted(_active_operations))
    for item in get_all_model_configs():
        if is_model_loaded(item.model_name, item.engine):
            blockers.append(f"loaded:{item.model_name}")
    if db is not None:
        from backend.database.models import TranscriptionTask

        rows = db.query(TranscriptionTask).filter(
            TranscriptionTask.source == "local",
            TranscriptionTask.status.in_(("created", "queued", "preprocessing", "waiting_model", "downloading_model", "transcribing", "postprocessing")),
        ).all()
        blockers.extend(f"task:{row.id}" for row in rows)
    return blockers


def plan_relocation(
    target_root: str | Path,
    mode: str,
    *,
    include_shared_caches: bool = False,
    acknowledge_network: bool = False,
    db=None,
) -> dict[str, Any]:
    target = Path(target_root).expanduser().absolute()
    source = config.get_model_storage_root()
    candidate = validate_candidate(target)
    errors = list(candidate["errors"])
    warnings = list(candidate["warnings"])
    if mode not in {"move", "adopt"}:
        errors.append("invalid_mode")
    if config.model_storage_root_is_locked():
        errors.append("storage_root_locked")
    try:
        target.relative_to(source)
        if target != source:
            errors.append("nested_storage_root")
    except ValueError:
        try:
            source.relative_to(target)
            if target != source:
                errors.append("nested_storage_root")
        except ValueError:
            pass
    if target == source:
        errors.append("same_storage_root")
    if candidate["network_filesystem"] and not acknowledge_network:
        errors.append("network_acknowledgement_required")

    source_models = source / "models"
    target_models = target / "models"
    conflicts = _tree_conflicts(source_models, target_models, "models") if mode == "move" else []
    cache_items: list[dict[str, Any]] = []
    required_bytes = directory_size(source_models) if mode == "move" else 0
    for name, path in config.get_model_cache_dirs().items():
        size = directory_size(path)
        cache_items.append({"name": name, "path": str(path), "size_bytes": size, "shared": False, "selected": mode == "move", "warning": None})
        if mode == "move":
            required_bytes += size
            conflicts.extend(_tree_conflicts(path, target / "cache" / name, f"cache/{name}"))
    for name, path in _known_shared_caches():
        try:
            path.relative_to(source)
            continue
        except ValueError:
            pass
        if not path.exists():
            continue
        size = directory_size(path)
        selected = mode == "move" and include_shared_caches
        cache_items.append(
            {
                "name": name,
                "path": str(path),
                "size_bytes": size,
                "shared": True,
                "selected": selected,
                "warning": "This cache may be shared by other applications.",
            }
        )
        if selected:
            required_bytes += size
            conflicts.extend(_tree_conflicts(path, target / "cache" / name, f"cache/{name}"))
    valid_models, incomplete_models = _model_names_at(target)
    blockers = _active_blockers(db)
    free_bytes = candidate["free_bytes"]
    required_headroom_bytes = max(MIN_RELOCATION_HEADROOM_BYTES, (required_bytes + 19) // 20) if mode == "move" else 0
    if mode == "move" and free_bytes is not None and free_bytes < required_bytes + required_headroom_bytes:
        errors.append("insufficient_space")
    if conflicts:
        errors.append("target_conflicts")
    if blockers:
        errors.append("active_model_work")
    return {
        "target_root": str(target),
        "mode": mode,
        "valid": not errors,
        "writable": candidate["writable"],
        "errors": list(dict.fromkeys(errors)),
        "warnings": warnings,
        "conflicts": conflicts,
        "blockers": blockers,
        "valid_models": valid_models,
        "incomplete_models": incomplete_models,
        "caches": cache_items,
        "required_bytes": required_bytes,
        "required_headroom_bytes": required_headroom_bytes,
        "free_bytes": free_bytes,
        "network_filesystem": candidate["network_filesystem"],
    }


def _set_job(**updates: Any) -> None:
    with _job_lock:
        _job.update(updates)
        payload = dict(_job)
    write_relocation_state(payload)


def current_relocation() -> dict[str, Any]:
    with _job_lock:
        return dict(_job)


def relocation_active() -> bool:
    return current_relocation().get("status") in {"running", "cancelling"}


def require_storage(*, writable: bool = False) -> dict[str, Any]:
    from backend.services.errors import ASRboxError

    if relocation_active():
        raise ASRboxError("MODEL_STORAGE_MIGRATING", "Model storage relocation is in progress", stage="waiting_model")
    status = inspect_storage()
    if not status["available"]:
        raise ASRboxError("MODEL_STORAGE_UNAVAILABLE", "模型存储位置不可用", stage="waiting_model")
    if writable and not status["writable"]:
        raise ASRboxError("MODEL_STORAGE_READ_ONLY", "Model storage location is read-only", stage="waiting_model")
    return status


def _copy_file(source: Path, target: Path, job_id: str) -> None:
    target.parent.mkdir(parents=True, exist_ok=True)
    if target.exists():
        if not _files_equivalent(source, target):
            raise FileExistsError(f"Target conflict: {target}")
        return
    temporary = target.with_name(f".{target.name}.{job_id}.partial")
    copied = 0
    try:
        with source.open("rb") as reader, temporary.open("xb") as writer:
            while chunk := reader.read(1024 * 1024):
                if _cancel_event.is_set():
                    raise RelocationCancelled("Relocation cancelled")
                writer.write(chunk)
                copied += len(chunk)
                state = current_relocation()
                total = int(state.get("total_bytes") or 0)
                current = int(state.get("copied_bytes") or 0) + len(chunk)
                _set_job(copied_bytes=current, progress=round(current / max(total, 1) * 100, 2), current_item=str(source))
        shutil.copystat(source, temporary, follow_symlinks=False)
        if not _files_equivalent(source, temporary):
            raise OSError(f"Verification failed: {source}")
        os.replace(temporary, target)
    finally:
        temporary.unlink(missing_ok=True)


def _copy_tree(source: Path, target: Path, job_id: str) -> None:
    if not source.exists():
        return
    for item in source.rglob("*"):
        if _cancel_event.is_set():
            raise RelocationCancelled("Relocation cancelled")
        relative = item.relative_to(source)
        destination = target / relative
        if item.is_symlink():
            raise OSError(f"Symbolic link found in source: {item}")
        if item.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        elif item.is_file():
            _copy_file(item, destination, job_id)


def _remove_owned_source(source: Path, shared_paths: list[Path]) -> list[str]:
    failures: list[str] = []
    owned = [source / "models", *(source / "cache" / name for name in config.MODEL_CACHE_NAMES), *shared_paths]
    for path in owned:
        try:
            shutil.rmtree(path) if path.is_dir() else path.unlink(missing_ok=True)
        except OSError:
            failures.append(str(path))
    return failures


def _finalize_tree(staging: Path, target: Path) -> None:
    if not staging.exists():
        return
    for item in sorted(staging.rglob("*"), key=lambda path: len(path.parts)):
        relative = item.relative_to(staging)
        destination = target / relative
        if item.is_dir():
            destination.mkdir(parents=True, exist_ok=True)
        elif item.is_file():
            destination.parent.mkdir(parents=True, exist_ok=True)
            if destination.exists():
                if not _files_equivalent(item, destination):
                    raise FileExistsError(f"Target conflict: {destination}")
                item.unlink()
            else:
                os.replace(item, destination)


def _run_relocation(job_id: str, request: dict[str, Any], db_factory=None) -> None:
    source = config.get_model_storage_root()
    target = Path(request["target_root"])
    mode = request["mode"]
    shared_paths: list[Path] = []
    staging = target / f".asrbox-relocation-{job_id}.staging"
    try:
        _set_job(phase="planning")
        db = db_factory() if db_factory else None
        try:
            plan = plan_relocation(
                target,
                mode,
                include_shared_caches=bool(request.get("include_shared_caches")),
                acknowledge_network=bool(request.get("acknowledge_network")),
                db=db,
            )
        finally:
            if db is not None:
                db.close()
        if not plan["valid"]:
            raise ValueError(", ".join(plan["errors"]))
        if mode == "move":
            _set_job(phase="copying", total_bytes=plan["required_bytes"], copied_bytes=0, progress=0)
            staging.mkdir(parents=True, exist_ok=False)
            _copy_tree(source / "models", staging / "models", job_id)
            for cache in plan["caches"]:
                if not cache["selected"]:
                    continue
                cache_source = Path(cache["path"])
                _copy_tree(cache_source, staging / "cache" / cache["name"], job_id)
                if cache["shared"]:
                    shared_paths.append(cache_source)
            _set_job(phase="finalizing")
            _finalize_tree(staging, target)
            shutil.rmtree(staging, ignore_errors=True)
        if _cancel_event.is_set():
            raise RelocationCancelled("Relocation cancelled")
        _set_job(phase="switching")
        config.set_model_storage_root(target)
        config.configure_model_cache_environment()
        if config.get_model_storage_root() != target:
            raise OSError("Target storage configuration did not become effective")
        target_status = inspect_storage()
        if not target_status["available"] or not target_status["writable"]:
            config.set_model_storage_root(source)
            config.configure_model_cache_environment()
            raise OSError("Target storage became unavailable during activation")
        cleanup_paths: list[str] = []
        if mode == "move":
            _set_job(phase="cleanup")
            cleanup_paths = _remove_owned_source(source, shared_paths)
        _set_job(
            status="complete",
            phase="complete",
            progress=100,
            cleanup_required=bool(cleanup_paths),
            cleanup_paths=cleanup_paths,
            error_code=None,
            error=None,
        )
    except RelocationCancelled as exc:
        shutil.rmtree(staging, ignore_errors=True)
        _set_job(status="cancelled", phase="cancelled", error_code=None, error=str(exc))
    except Exception as exc:
        shutil.rmtree(staging, ignore_errors=True)
        if config.get_model_storage_root() != source and source.exists():
            config.set_model_storage_root(source)
            config.configure_model_cache_environment()
        _set_job(status="failed", phase="failed", error_code="MODEL_STORAGE_RELOCATION_FAILED", error=str(exc))


def start_relocation(request: dict[str, Any], *, db_factory=None) -> dict[str, Any]:
    global _job
    with _job_lock:
        if _job.get("status") in {"running", "cancelling"}:
            raise RuntimeError("A model storage relocation is already running")
        job_id = uuid.uuid4().hex
        _job = {
            "id": job_id,
            "status": "running",
            "phase": "starting",
            "mode": request["mode"],
            "source_root": str(config.get_model_storage_root()),
            "target_root": str(Path(request["target_root"]).expanduser().absolute()),
            "current_item": None,
            "copied_bytes": 0,
            "total_bytes": 0,
            "progress": 0,
            "warnings": [],
            "conflicts": [],
            "cleanup_required": False,
            "cleanup_paths": [],
            "error_code": None,
            "error": None,
        }
    _cancel_event.clear()
    write_relocation_state(_job)
    threading.Thread(target=_run_relocation, args=(job_id, request, db_factory), daemon=True).start()
    return current_relocation()


def cancel_relocation() -> dict[str, Any]:
    if not relocation_active():
        return current_relocation()
    _cancel_event.set()
    _set_job(status="cancelling", phase="cancelling")
    return current_relocation()
