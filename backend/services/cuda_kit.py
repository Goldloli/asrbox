"""CUDA acceleration kit lifecycle: download, verify, enable, invalidate.

The kit is a cu128 torch tree distributed as byte-split zip volumes attached
to the GitHub release of the running backend version. Downloads follow the
model-storage relocation pattern (module-level job dict + cancel event +
worker thread); no global event-bus types are added, the frontend polls the
job endpoint. Everything lives under ``<data_dir>/runtime/cuda-kit/``:

- ``config.json``: ``{"enabled": bool}`` switch (read by Tauri before spawn)
- ``kit/``: installed kit (injection target), with ``manifest.json`` inside
- ``downloads/``: staging (manifest, ``*.part`` volumes, concatenated zip)
- ``state.json``: last terminal job state, surfaced after a restart
"""

from __future__ import annotations

from collections.abc import Callable
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import shutil
import sys
import tempfile
import threading
from typing import Any
from urllib.parse import urljoin, urlparse
import uuid
import zipfile

import httpx

from backend import __version__, config
from backend.services import platform as platform_service
from backend.services.errors import ASRboxError
from backend.services.process_utils import no_window_kwargs

CONFIG_FILENAME = "config.json"
STATE_FILENAME = "state.json"
KIT_DIR_NAME = "kit"
DOWNLOADS_DIR_NAME = "downloads"
MANIFEST_FILENAME = "manifest.json"
LOCAL_ZIP_FILENAME = "kit.zip"
EXTRACT_DIR_NAME = "extract"

MANIFEST_ASSET_NAME = "cuda-kit-manifest.json"
PART_NAME_PATTERN = re.compile(r"^asrbox-cuda-kit-windows-x64\.zip\.part\d+$")
RELEASE_PATH_PREFIX = "/Goldloli/asrbox/releases/download/"
GITHUB_HOST = "github.com"
# GitHub release assets 302 to objects.githubusercontent.com, a GitHub-owned
# domain: the initial URL stays pinned to the fixed github.com release path,
# while redirect targets are allowed on any *.githubusercontent.com host.
REDIRECT_HOST_SUFFIX = ".githubusercontent.com"
MAX_REDIRECTS = 5
DOWNLOAD_CHUNK_BYTES = 1024 * 1024

PHASE_MANIFEST = "manifest"
PHASE_PARTS = "parts"
PHASE_VERIFY = "verify"
PHASE_EXTRACT = "extract"
PHASE_VERIFY_FILES = "verify_files"

_IDLE_JOB: dict[str, Any] = {
    "id": None,
    "status": "idle",
    "phase": "idle",
    "current_part": None,
    "parts_total": 0,
    "downloaded_bytes": 0,
    "total_bytes": 0,
    "error": None,
}
_job_lock = threading.Lock()
_cancel_event = threading.Event()
_job: dict[str, Any] = dict(_IDLE_JOB)
_state_recovered = False
_probe_warm_lock = threading.Lock()
_probe_warm_started = False
_probe_warm_failed: str | None = None


class CudaKitDownloadCancelled(RuntimeError):
    pass


class CudaKitFetchError(RuntimeError):
    pass


def _host_platform() -> str:
    return sys.platform


def cuda_kit_supported() -> bool:
    return _host_platform() == "win32"


def kit_root() -> Path:
    return config.get_data_dir() / "runtime" / "cuda-kit"


def kit_dir() -> Path:
    return kit_root() / KIT_DIR_NAME


def downloads_dir() -> Path:
    return kit_root() / DOWNLOADS_DIR_NAME


def _config_path() -> Path:
    return kit_root() / CONFIG_FILENAME


def _state_path() -> Path:
    return kit_root() / STATE_FILENAME


def _write_json_atomic(path: Path, payload: dict[str, Any]) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
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


def read_enabled() -> bool:
    try:
        payload = json.loads(_config_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return False
    return bool(isinstance(payload, dict) and payload.get("enabled"))


def _write_enabled(enabled: bool) -> None:
    _write_json_atomic(_config_path(), {"enabled": bool(enabled)})


def _set_job(persist: bool = True, **updates: Any) -> None:
    with _job_lock:
        _job.update(updates)
        payload = dict(_job)
        if persist:
            # 先在锁内落盘再对 current_job() 的读者可见，保证读到 completed 时
            # 状态文件必然已写入（重启恢复只认文件）。
            _write_state(payload)


def _bump_downloaded(delta_bytes: int) -> None:
    if delta_bytes <= 0:
        return
    with _job_lock:
        _job["downloaded_bytes"] = int(_job.get("downloaded_bytes") or 0) + delta_bytes


def _write_state(payload: dict[str, Any]) -> None:
    _write_json_atomic(_state_path(), payload)


def _recover_state_locked() -> None:
    # A running job cannot survive a process restart; surface it as failed so
    # the settings page can show why the last download did not finish.
    global _job, _state_recovered
    if _state_recovered:
        return
    _state_recovered = True
    try:
        payload = json.loads(_state_path().read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return
    if not isinstance(payload, dict) or "status" not in payload:
        return
    recovered = {**_IDLE_JOB, **payload}
    if recovered.get("status") == "running":
        recovered.update(status="failed", phase="interrupted", error="CUDA kit download was interrupted")
        _job = recovered
        _write_state(dict(recovered))
    elif recovered.get("status") in {"completed", "failed", "cancelled"}:
        _job = recovered


def current_job() -> dict[str, Any]:
    with _job_lock:
        _recover_state_locked()
        return dict(_job)


def download_active() -> bool:
    return current_job().get("status") == "running"


def _reset_gpu_detection() -> None:
    """Reset the nvidia-smi gate cache; an in-flight probe is left running."""
    global _gpu_detect_started, _gpu_detect_result
    with _gpu_detect_lock:
        if _gpu_detect_started and _gpu_detect_result is None:
            return
        _gpu_detect_started = False
        _gpu_detect_result = None


def _reset_probe_cache() -> None:
    global _probe_warm_started, _probe_warm_failed
    cache_clear = getattr(platform_service.runtime_probe_snapshot, "cache_clear", None)
    if callable(cache_clear):
        cache_clear()
    with _probe_warm_lock:
        _probe_warm_started = False
        _probe_warm_failed = None
    _reset_gpu_detection()


def _schedule_probe_warm() -> None:
    global _probe_warm_started
    with _probe_warm_lock:
        if _probe_warm_started:
            return
        _probe_warm_started = True

    def warm() -> None:
        global _probe_warm_failed
        try:
            platform_service.runtime_probe_snapshot()
        except Exception as exc:
            _probe_warm_failed = f"{type(exc).__name__}: {exc}"

    threading.Thread(target=warm, daemon=True).start()


def _probe_snapshot_cached() -> dict[str, Any] | None:
    """Return the cached runtime probe without blocking; None while unprobed."""
    probe = platform_service.runtime_probe_snapshot
    cache_info = getattr(probe, "cache_info", None)
    if callable(cache_info) and cache_info().currsize == 0:
        with _probe_warm_lock:
            warm_error = _probe_warm_failed
        return {"_error": warm_error} if warm_error else None
    try:
        return probe()
    except Exception as exc:
        return {"_error": f"{type(exc).__name__}: {exc}"}


_gpu_detect_lock = threading.Lock()
_gpu_detect_started = False
_gpu_detect_result: bool | None = None


def _detect_nvidia_gpu() -> bool:
    """Bounded nvidia-smi probe: True when a driver-visible NVIDIA GPU exists."""
    import subprocess

    kwargs: dict[str, Any] = {"capture_output": True, "timeout": 5, **no_window_kwargs()}
    try:
        result = subprocess.run(["nvidia-smi", "-L"], **kwargs)
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0 and b"GPU" in result.stdout


def _gpu_detected_cached() -> bool | None:
    """NVIDIA GPU presence for the settings gate; None while undetermined.

    Never blocks the caller: the probe runs once in a daemon thread and the
    cached answer (including False for a missing driver) is served afterwards.
    Non-Windows hosts always return None (the field is meaningless there).
    """
    global _gpu_detect_started, _gpu_detect_result
    if not cuda_kit_supported():
        return None
    with _gpu_detect_lock:
        if _gpu_detect_started:
            return _gpu_detect_result
        _gpu_detect_started = True

    def detect() -> None:
        global _gpu_detect_result
        try:
            detected = _detect_nvidia_gpu()
        except Exception:  # noqa: BLE001 - detection must never break the status endpoint
            detected = False
        with _gpu_detect_lock:
            _gpu_detect_result = detected

    threading.Thread(target=detect, daemon=True, name="cuda-kit-gpu-detect").start()
    return None


def _probe_payload(snapshot: dict[str, Any] | None) -> dict[str, Any]:
    if snapshot is None:
        return {"state": "pending", "torch_cuda_available": False, "cuda_device_name": None, "torch_file": None}
    if snapshot.get("_error"):
        return {"state": "failed", "torch_cuda_available": False, "cuda_device_name": None, "torch_file": None}
    return {
        "state": "ok",
        "torch_cuda_available": bool(snapshot.get("torch_cuda_available")),
        "cuda_device_name": snapshot.get("cuda_device_name"),
        "torch_file": snapshot.get("torch_file"),
    }


def _current_torch_version() -> str | None:
    try:
        from importlib import metadata

        return metadata.version("torch")
    except Exception:
        return None


def _base_version(version: str) -> str:
    return version.split("+", 1)[0]


def _read_installed_manifest() -> dict[str, Any] | None:
    try:
        payload = json.loads((kit_dir() / MANIFEST_FILENAME).read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _kit_present(manifest: dict[str, Any] | None) -> bool:
    return manifest is not None and (kit_dir() / "torch" / "__init__.py").is_file()


def _torch_file_in_kit(torch_file: Any) -> bool:
    if not isinstance(torch_file, str) or not torch_file:
        return False
    try:
        torch_path = os.path.normcase(str(Path(torch_file).resolve()))
        kit_path = os.path.normcase(str(kit_dir().resolve()))
    except OSError:
        return False
    return torch_path.startswith(kit_path + os.sep)


def acceleration_status() -> dict[str, Any]:
    if not cuda_kit_supported():
        return {
            "enabled": False,
            "status": "not_downloaded",
            "reason": "CUDA 加速套件仅支持 Windows 桌面端",
            "reason_code": "unsupported_platform",
            "supported": False,
            "gpu_detected": None,
            "kit": None,
            "probe": _probe_payload(None),
            "job": None,
        }
    enabled = read_enabled()
    job = current_job()
    manifest = _read_installed_manifest()
    snapshot = _probe_snapshot_cached()
    probe = _probe_payload(snapshot)

    status = "not_downloaded"
    reason: str | None = None
    reason_code: str | None = None
    if job.get("status") == "running":
        status = "downloading"
    elif not _kit_present(manifest):
        status = "not_downloaded"
    else:
        kit_torch = str(manifest.get("torch_version") or "")
        current_torch = _current_torch_version()
        if current_torch and kit_torch and _base_version(kit_torch) != _base_version(current_torch):
            status = "invalidated"
            reason = f"加速套件的 torch 版本（{kit_torch}）与当前软件版本（{current_torch}）不一致，请重新下载加速套件"
            reason_code = "kit_version_mismatch"
        elif not enabled:
            status = "ready"
        elif snapshot is None:
            # 乐观展示已开启，probe 字段如实报 pending，预热在后台进行
            _schedule_probe_warm()
            status = "enabled"
        elif snapshot.get("_error"):
            status = "enable_failed"
            reason = f"运行时探测失败：{snapshot['_error']}"
            reason_code = "probe_failed"
        elif not _torch_file_in_kit(snapshot.get("torch_file")):
            status = "enable_failed"
            reason = "加速套件尚未注入当前进程（开启后需要重启软件才能生效）"
            reason_code = "kit_not_injected"
        elif not snapshot.get("torch_cuda_available"):
            status = "enable_failed"
            reason = "加速套件已加载，但未检测到可用的 CUDA 设备"
            reason_code = "cuda_device_missing"
        else:
            status = "enabled"

    kit_info = None
    if _kit_present(manifest) and manifest is not None:
        kit_info = {
            "kit_version": str(manifest.get("kit_version") or ""),
            "torch_version": str(manifest.get("torch_version") or ""),
            "total_bytes": int(manifest.get("total_bytes") or 0),
        }
    return {
        "enabled": enabled,
        "status": status,
        "reason": reason,
        "reason_code": reason_code,
        "supported": True,
        "gpu_detected": _gpu_detected_cached(),
        "kit": kit_info,
        "probe": probe,
        "job": job if job.get("status") != "idle" else None,
    }


def redetect_and_status() -> dict[str, Any]:
    if cuda_kit_supported():
        # _reset_probe_cache 内部一并重置显卡检测缓存
        _reset_probe_cache()
    return acceleration_status()


def set_enabled(enabled: bool) -> dict[str, Any]:
    if not cuda_kit_supported():
        if enabled:
            raise ASRboxError("CUDA_ACCELERATION_UNSUPPORTED", "CUDA 加速套件仅支持 Windows 桌面端")
        return acceleration_status()
    _write_enabled(enabled)
    _reset_probe_cache()
    return acceleration_status()


def delete_kit() -> dict[str, Any]:
    if not cuda_kit_supported():
        return acceleration_status()
    if download_active():
        raise ASRboxError("CUDA_KIT_DOWNLOAD_ACTIVE", "CUDA 加速套件下载进行中，请先取消下载")
    shutil.rmtree(kit_dir(), ignore_errors=True)
    shutil.rmtree(downloads_dir(), ignore_errors=True)
    _reset_probe_cache()
    return acceleration_status()


def _release_base_url() -> str:
    return f"https://github.com{RELEASE_PATH_PREFIX}v{__version__}"


def manifest_url() -> str:
    return f"{_release_base_url()}/{MANIFEST_ASSET_NAME}"


def part_url(part_name: str) -> str:
    if not PART_NAME_PATTERN.fullmatch(part_name):
        raise CudaKitFetchError(f"Refusing unexpected CUDA kit part name: {part_name!r}")
    return f"{_release_base_url()}/{part_name}"


def _validate_release_url(url: str) -> None:
    parsed = urlparse(url)
    if parsed.scheme != "https":
        raise CudaKitFetchError(f"CUDA kit downloads require HTTPS: {url!r}")
    if (parsed.hostname or "").lower() != GITHUB_HOST:
        raise CudaKitFetchError(f"CUDA kit downloads are limited to {GITHUB_HOST}: {url!r}")
    expected_prefix = f"{RELEASE_PATH_PREFIX}v{__version__}/"
    if not parsed.path.startswith(expected_prefix):
        raise CudaKitFetchError(f"Unexpected CUDA kit release path: {url!r}")
    asset = parsed.path[len(expected_prefix):]
    if asset != MANIFEST_ASSET_NAME and not PART_NAME_PATTERN.fullmatch(asset):
        raise CudaKitFetchError(f"Unexpected CUDA kit asset name: {asset!r}")


def _validate_redirect_url(url: str) -> str:
    parsed = urlparse(url)
    host = (parsed.hostname or "").lower()
    if parsed.scheme != "https" or (host != GITHUB_HOST and not host.endswith(REDIRECT_HOST_SUFFIX)):
        raise CudaKitFetchError(f"Refusing CUDA kit download redirect to untrusted host: {url!r}")
    return url


def _safe_relative_path(value: Any) -> Path:
    if not isinstance(value, str) or not value or "\\" in value or ":" in value:
        raise CudaKitFetchError(f"Unsafe path in CUDA kit payload: {value!r}")
    path = PurePosixPath(value)
    if path.is_absolute() or any(part in {"", ".."} for part in path.parts):
        raise CudaKitFetchError(f"Unsafe path in CUDA kit payload: {value!r}")
    return Path(*path.parts)


def _file_hash(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        while chunk := handle.read(1024 * 1024):
            digest.update(chunk)
    return digest.hexdigest()


def _looks_like_sha256(value: Any) -> bool:
    return isinstance(value, str) and len(value) == 64 and all(char in "0123456789abcdef" for char in value.lower())


def _validate_manifest(payload: Any) -> dict[str, Any]:
    if not isinstance(payload, dict):
        raise CudaKitFetchError("CUDA kit manifest is not a JSON object")
    if payload.get("schema_version") != 1:
        raise CudaKitFetchError(f"Unsupported CUDA kit manifest schema: {payload.get('schema_version')!r}")
    if not isinstance(payload.get("torch_version"), str) or not payload["torch_version"]:
        raise CudaKitFetchError("CUDA kit manifest is missing torch_version")
    if not _looks_like_sha256(payload.get("zip_sha256")):
        raise CudaKitFetchError("CUDA kit manifest is missing zip_sha256")
    parts = payload.get("parts")
    if not isinstance(parts, list) or not parts:
        raise CudaKitFetchError("CUDA kit manifest is missing parts")
    for part in parts:
        if not isinstance(part, dict):
            raise CudaKitFetchError("CUDA kit manifest part is not an object")
        part_url(str(part.get("name")))
        if not isinstance(part.get("size"), int) or part["size"] < 0:
            raise CudaKitFetchError("CUDA kit manifest part is missing size")
        if not _looks_like_sha256(part.get("sha256")):
            raise CudaKitFetchError("CUDA kit manifest part is missing sha256")
    files = payload.get("files")
    if not isinstance(files, list) or not files:
        raise CudaKitFetchError("CUDA kit manifest is missing files")
    for entry in files:
        if not isinstance(entry, dict):
            raise CudaKitFetchError("CUDA kit manifest file entry is not an object")
        _safe_relative_path(entry.get("path"))
        if not isinstance(entry.get("size"), int) or entry["size"] < 0:
            raise CudaKitFetchError("CUDA kit manifest file entry is missing size")
        if not _looks_like_sha256(entry.get("sha256")):
            raise CudaKitFetchError("CUDA kit manifest file entry is missing sha256")
    return payload


def _default_fetch(
    url: str,
    target: Path,
    *,
    offset: int = 0,
    on_progress: Callable[[int], None] | None = None,
    cancel_event: threading.Event | None = None,
) -> None:
    """Stream *url* into *target*, resuming at *offset* via HTTP Range.

    Redirects are followed hop by hop so each target host is re-validated
    against the allowlist. on_progress reports the target file size after
    each chunk (not the chunk delta), so accounting stays truthful when a
    server ignores the Range header and the file is rewritten from scratch.
    """
    headers = {"Range": f"bytes={offset}-"} if offset else {}
    current_url = url
    timeout = httpx.Timeout(30.0, read=300.0)
    with httpx.Client(timeout=timeout, follow_redirects=False) as client:
        for _attempt in range(MAX_REDIRECTS + 1):
            with client.stream("GET", current_url, headers=headers) as response:
                if response.status_code in {301, 302, 303, 307, 308}:
                    location = response.headers.get("location")
                    if not location:
                        raise CudaKitFetchError("CUDA kit download redirect is missing a Location header")
                    current_url = _validate_redirect_url(urljoin(current_url, location))
                    continue
                if response.status_code == 206 and offset:
                    mode, written = "ab", offset
                elif response.status_code == 200:
                    # The server ignored the Range request; restart the file.
                    mode, written = "wb", 0
                else:
                    raise CudaKitFetchError(f"CUDA kit download failed with HTTP {response.status_code}")
                target.parent.mkdir(parents=True, exist_ok=True)
                with target.open(mode) as handle:
                    for chunk in response.iter_bytes(DOWNLOAD_CHUNK_BYTES):
                        if cancel_event is not None and cancel_event.is_set():
                            raise CudaKitDownloadCancelled("CUDA kit download cancelled")
                        handle.write(chunk)
                        written += len(chunk)
                        if on_progress is not None:
                            on_progress(written)
                return
        raise CudaKitFetchError("CUDA kit download exceeded the redirect limit")


def _check_cancel() -> None:
    if _cancel_event.is_set():
        raise CudaKitDownloadCancelled("CUDA kit download cancelled")


def _download_manifest(downloads: Path) -> dict[str, Any]:
    url = manifest_url()
    _validate_release_url(url)
    target = downloads / MANIFEST_FILENAME
    _default_fetch(url, target, cancel_event=_cancel_event)
    _check_cancel()
    try:
        payload = json.loads(target.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise CudaKitFetchError(f"CUDA kit manifest is not valid JSON: {exc}") from exc
    return _validate_manifest(payload)


def _download_part(part: dict[str, Any], downloads: Path) -> None:
    name = str(part["name"])
    url = part_url(name)
    _validate_release_url(url)
    expected_size = int(part["size"])
    part_path = downloads / f"{name}.part"
    existing = part_path.stat().st_size if part_path.is_file() else 0
    if existing == expected_size:
        if _file_hash(part_path) == part["sha256"]:
            _bump_downloaded(expected_size)
            return
        part_path.unlink()
        existing = 0
    elif existing > expected_size:
        part_path.unlink()
        existing = 0
    _set_job(current_part=name)
    _bump_downloaded(existing)
    accounted = existing

    def on_progress(size: int) -> None:
        nonlocal accounted
        if size > accounted:
            _bump_downloaded(size - accounted)
            accounted = size

    _default_fetch(url, part_path, offset=existing, on_progress=on_progress, cancel_event=_cancel_event)
    _check_cancel()
    if part_path.stat().st_size != expected_size or _file_hash(part_path) != part["sha256"]:
        part_path.unlink(missing_ok=True)
        raise CudaKitFetchError(f"CUDA kit part failed integrity verification and was removed: {name}")


def _concatenate_parts(parts: list[dict[str, Any]], downloads: Path) -> Path:
    zip_path = downloads / LOCAL_ZIP_FILENAME
    with zip_path.open("wb") as output:
        for part in parts:
            part_path = downloads / f"{part['name']}.part"
            with part_path.open("rb") as source:
                while chunk := source.read(4 * 1024 * 1024):
                    _check_cancel()
                    output.write(chunk)
    return zip_path


def _verify_zip(manifest: dict[str, Any], zip_path: Path) -> None:
    expected_size = manifest.get("zip_size")
    if isinstance(expected_size, int) and expected_size >= 0 and zip_path.stat().st_size != expected_size:
        zip_path.unlink(missing_ok=True)
        raise CudaKitFetchError("CUDA kit archive size does not match the manifest")
    if _file_hash(zip_path) != manifest["zip_sha256"]:
        zip_path.unlink(missing_ok=True)
        raise CudaKitFetchError("CUDA kit archive failed integrity verification")


def _extract_kit(zip_path: Path, downloads: Path) -> Path:
    extract_dir = downloads / EXTRACT_DIR_NAME
    shutil.rmtree(extract_dir, ignore_errors=True)
    extract_dir.mkdir(parents=True, exist_ok=True)
    try:
        with zipfile.ZipFile(zip_path) as archive:
            for member in archive.infolist():
                _check_cancel()
                if member.is_dir():
                    continue
                relative = _safe_relative_path(member.filename)
                target = extract_dir / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                with archive.open(member) as source, target.open("wb") as output:
                    while chunk := source.read(4 * 1024 * 1024):
                        _check_cancel()
                        output.write(chunk)
    except Exception:
        shutil.rmtree(extract_dir, ignore_errors=True)
        raise
    return extract_dir


def _verify_extracted_files(manifest: dict[str, Any], extract_dir: Path) -> None:
    for entry in manifest["files"]:
        _check_cancel()
        relative = _safe_relative_path(entry["path"])
        target = extract_dir / relative
        if not target.is_file():
            raise CudaKitFetchError(f"CUDA kit file is missing after extraction: {entry['path']}")
        if target.stat().st_size != entry["size"] or _file_hash(target) != entry["sha256"]:
            raise CudaKitFetchError(f"CUDA kit file failed integrity verification: {entry['path']}")


def _install_kit(manifest_source: Path, extract_dir: Path, downloads: Path) -> None:
    target = kit_dir()
    backup = kit_root() / f".{KIT_DIR_NAME}.backup-{uuid.uuid4().hex}"
    if target.exists():
        os.replace(target, backup)
    try:
        os.replace(extract_dir, target)
    except Exception:
        if backup.exists():
            os.replace(backup, target)
        raise
    shutil.rmtree(backup, ignore_errors=True)
    shutil.copyfile(manifest_source, target / MANIFEST_FILENAME)
    for item in downloads.iterdir():
        if item.is_dir():
            shutil.rmtree(item, ignore_errors=True)
        else:
            item.unlink(missing_ok=True)


def _run_download() -> None:
    downloads = downloads_dir()
    try:
        downloads.mkdir(parents=True, exist_ok=True)
        _set_job(phase=PHASE_MANIFEST)
        manifest = _download_manifest(downloads)
        parts = manifest["parts"]
        total_bytes = manifest.get("zip_size")
        if not isinstance(total_bytes, int) or total_bytes < 0:
            total_bytes = sum(int(part["size"]) for part in parts)
        _set_job(phase=PHASE_PARTS, parts_total=len(parts), total_bytes=total_bytes, downloaded_bytes=0)
        for part in parts:
            _check_cancel()
            _download_part(part, downloads)
        _set_job(phase=PHASE_VERIFY, current_part=None)
        zip_path = _concatenate_parts(parts, downloads)
        _verify_zip(manifest, zip_path)
        _check_cancel()
        _set_job(phase=PHASE_EXTRACT)
        try:
            extract_dir = _extract_kit(zip_path, downloads)
            _set_job(phase=PHASE_VERIFY_FILES)
            _verify_extracted_files(manifest, extract_dir)
        except CudaKitDownloadCancelled:
            shutil.rmtree(downloads / EXTRACT_DIR_NAME, ignore_errors=True)
            raise
        except Exception:
            # 逐文件复核失败 = 整体作废，磁盘上的旧套件也不再信任
            shutil.rmtree(downloads / EXTRACT_DIR_NAME, ignore_errors=True)
            shutil.rmtree(kit_dir(), ignore_errors=True)
            _reset_probe_cache()
            raise
        _install_kit(downloads / MANIFEST_FILENAME, extract_dir, downloads)
        _reset_probe_cache()
        _set_job(status="completed", phase="completed", current_part=None, error=None)
    except CudaKitDownloadCancelled as exc:
        # 保留各分卷 .part 供断点续传，仅清理不可续传的拼合/解压产物
        shutil.rmtree(downloads / EXTRACT_DIR_NAME, ignore_errors=True)
        (downloads / LOCAL_ZIP_FILENAME).unlink(missing_ok=True)
        _set_job(status="cancelled", phase="cancelled", current_part=None, error=str(exc))
    except Exception as exc:
        shutil.rmtree(downloads / EXTRACT_DIR_NAME, ignore_errors=True)
        _set_job(status="failed", phase="failed", current_part=None, error=str(exc))


def start_download() -> dict[str, Any]:
    if not cuda_kit_supported():
        raise ASRboxError("CUDA_ACCELERATION_UNSUPPORTED", "CUDA 加速套件仅支持 Windows 桌面端")
    global _job
    with _job_lock:
        _recover_state_locked()
        if _job.get("status") == "running":
            return dict(_job)
        _job = {
            **_IDLE_JOB,
            "id": uuid.uuid4().hex,
            "status": "running",
            "phase": "starting",
        }
        payload = dict(_job)
    _cancel_event.clear()
    _write_state(payload)
    threading.Thread(target=_run_download, daemon=True).start()
    return current_job()


def cancel_download() -> dict[str, Any]:
    if download_active():
        _cancel_event.set()
    return current_job()
