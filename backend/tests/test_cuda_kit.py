from __future__ import annotations

import hashlib
import io
import json
import threading
import time
import zipfile
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import __version__
from backend.services import cuda_kit
from backend.services.errors import ASRboxError

KIT_TORCH_VERSION = "2.11.0+cu128"
CURRENT_TORCH_VERSION = "2.11.0"
PART1_NAME = "asrbox-cuda-kit-windows-x64.zip.part1"
PART2_NAME = "asrbox-cuda-kit-windows-x64.zip.part2"


@pytest.fixture(autouse=True)
def _isolated_cuda_kit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(cuda_kit, "_job", dict(cuda_kit._IDLE_JOB))
    monkeypatch.setattr(cuda_kit, "_state_recovered", False)
    monkeypatch.setattr(cuda_kit, "_cancel_event", threading.Event())
    monkeypatch.setattr(cuda_kit, "_probe_warm_started", False)
    monkeypatch.setattr(cuda_kit, "_probe_warm_failed", None)
    # GPU 探测默认表现为"已启动且暂无结果"：真实函数短路返回 None，不拉起线程/子进程
    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", True)
    monkeypatch.setattr(cuda_kit, "_gpu_detect_result", None)
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "win32")
    monkeypatch.setattr(cuda_kit, "_current_torch_version", lambda: CURRENT_TORCH_VERSION)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: None)
    monkeypatch.setattr(cuda_kit, "_schedule_probe_warm", lambda: None)


def _sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def _build_fake_kit(tmp_path: Path) -> tuple[dict, dict[str, bytes]]:
    """构造含 torch/__init__.py 的小假树，打成真 zip 后按字节分卷，manifest 用真 sha256。"""
    source = tmp_path / "kit-source"
    torch_pkg = source / "torch"
    (torch_pkg / "lib").mkdir(parents=True)
    (torch_pkg / "nn").mkdir()
    (torch_pkg / "__init__.py").write_text(f'__version__ = "{KIT_TORCH_VERSION}"\n', encoding="utf-8")
    (torch_pkg / "lib" / "cudart64_128.dll").write_bytes(b"fake-cuda-dll-" * 16)
    (torch_pkg / "nn" / "__init__.py").write_text("# fake nn module\n", encoding="utf-8")
    dist_info = source / f"torch-{KIT_TORCH_VERSION}.dist-info"
    dist_info.mkdir()
    (dist_info / "METADATA").write_text(f"Name: torch\nVersion: {KIT_TORCH_VERSION}\n", encoding="utf-8")

    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(source.rglob("*")):
            if path.is_file():
                archive.write(path, path.relative_to(source).as_posix())
    zip_bytes = zip_buffer.getvalue()
    midpoint = len(zip_bytes) // 2
    part_bytes = (zip_bytes[:midpoint], zip_bytes[midpoint:])

    files = []
    for path in sorted(source.rglob("*")):
        if path.is_file():
            files.append(
                {
                    "path": path.relative_to(source).as_posix(),
                    "size": path.stat().st_size,
                    "sha256": _sha256(path.read_bytes()),
                }
            )
    manifest = {
        "schema_version": 1,
        "kit_version": "0.1.9",
        "torch_version": KIT_TORCH_VERSION,
        "python": "3.14",
        "platform": "windows-x64",
        "file_count": len(files),
        "total_bytes": sum(entry["size"] for entry in files),
        "files": files,
        "zip_name": "asrbox-cuda-kit-windows-x64.zip",
        "zip_size": len(zip_bytes),
        "zip_sha256": _sha256(zip_bytes),
        "parts": [
            {"name": name, "size": len(data), "sha256": _sha256(data)}
            for name, data in zip((PART1_NAME, PART2_NAME), part_bytes)
        ],
    }
    payloads = {
        cuda_kit.manifest_url(): json.dumps(manifest).encode("utf-8"),
        cuda_kit.part_url(PART1_NAME): part_bytes[0],
        cuda_kit.part_url(PART2_NAME): part_bytes[1],
    }
    return manifest, payloads


def _install_fake_kit(tmp_path: Path) -> tuple[Path, dict]:
    manifest, payloads = _build_fake_kit(tmp_path)
    zip_bytes = payloads[cuda_kit.part_url(PART1_NAME)] + payloads[cuda_kit.part_url(PART2_NAME)]
    kit = cuda_kit.kit_dir()
    kit.mkdir(parents=True)
    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        archive.extractall(kit)
    (kit / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")
    return kit, manifest


class _FakeFetcher:
    """本地假下载器：offset 即生产 _default_fetch 的 Range 起点语义（bytes=offset-）。"""

    def __init__(self, payloads: dict[str, bytes], *, chunk_bytes: int = 64, chunk_delay: float = 0.0, delay_on=None) -> None:
        self.payloads = payloads
        self.chunk_bytes = chunk_bytes
        self.chunk_delay = chunk_delay
        self.delay_on = delay_on
        self.requests: list[tuple[str, int]] = []
        self.active = 0
        self.max_active = 0
        self._lock = threading.Lock()

    def __call__(self, url, target, *, offset=0, on_progress=None, cancel_event=None):
        with self._lock:
            self.active += 1
            self.max_active = max(self.max_active, self.active)
        self.requests.append((url, offset))
        try:
            data = self.payloads[url]
            if offset > len(data):
                raise cuda_kit.CudaKitFetchError(f"range not satisfiable: {offset}")
            body = data[offset:]
            mode = "ab" if offset else "wb"
            written = offset
            with Path(target).open(mode) as handle:
                for index in range(0, len(body), self.chunk_bytes):
                    if cancel_event is not None and cancel_event.is_set():
                        raise cuda_kit.CudaKitDownloadCancelled("cancelled by test")
                    chunk = body[index : index + self.chunk_bytes]
                    handle.write(chunk)
                    written += len(chunk)
                    if on_progress is not None:
                        on_progress(written)
                    if self.chunk_delay and (self.delay_on is None or self.delay_on(url)):
                        time.sleep(self.chunk_delay)
        finally:
            with self._lock:
                self.active -= 1


def _wait_for_job(predicate=None, timeout: float = 15.0) -> dict:
    predicate = predicate or (lambda job: job["status"] in {"completed", "failed", "cancelled"})
    deadline = time.time() + timeout
    job = cuda_kit.current_job()
    while time.time() < deadline:
        job = cuda_kit.current_job()
        if predicate(job):
            return job
        time.sleep(0.02)
    raise AssertionError(f"job never reached expected state; last={job}")


def _probe_ok(kit: Path, *, cuda: bool = True) -> dict:
    return {
        "torch_cuda_available": cuda,
        "cuda_device_name": "Fake RTX" if cuda else None,
        "torch_file": str(kit / "torch" / "__init__.py"),
    }


def _make_client() -> TestClient:
    from backend.app import create_app

    return TestClient(create_app())


# --- 派生状态机 ---


def test_status_not_downloaded_by_default() -> None:
    status = cuda_kit.acceleration_status()
    assert status["supported"] is True
    assert status["enabled"] is False
    assert status["status"] == "not_downloaded"
    assert status["reason"] is None
    assert status["kit"] is None
    assert status["probe"] == {"state": "pending", "torch_cuda_available": False, "cuda_device_name": None, "torch_file": None}
    assert status["job"] is None


def test_status_ready_with_installed_kit(tmp_path: Path) -> None:
    _install_fake_kit(tmp_path)
    status = cuda_kit.acceleration_status()
    assert status["status"] == "ready"
    assert status["reason"] is None
    assert status["kit"] is not None
    assert status["kit"]["kit_version"] == "0.1.9"
    assert status["kit"]["torch_version"] == KIT_TORCH_VERSION
    assert status["kit"]["total_bytes"] > 0


def test_status_enabled_when_probe_confirms(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    kit, _manifest = _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: _probe_ok(kit))
    status = cuda_kit.acceleration_status()
    assert status["status"] == "enabled"
    assert status["enabled"] is True
    assert status["reason"] is None
    assert status["probe"]["state"] == "ok"
    assert status["probe"]["torch_cuda_available"] is True
    assert status["probe"]["cuda_device_name"] == "Fake RTX"
    assert status["probe"]["torch_file"] == str(kit / "torch" / "__init__.py")


def test_status_enable_failed_when_cuda_unavailable(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    kit, _manifest = _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: _probe_ok(kit, cuda=False))
    status = cuda_kit.acceleration_status()
    assert status["status"] == "enable_failed"
    assert status["reason"]
    assert status["probe"]["state"] == "ok"
    assert status["probe"]["torch_cuda_available"] is False


def test_status_enable_failed_when_torch_not_from_kit(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    snapshot = {"torch_cuda_available": True, "cuda_device_name": "Fake RTX", "torch_file": "/elsewhere/torch/__init__.py"}
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: snapshot)
    status = cuda_kit.acceleration_status()
    assert status["status"] == "enable_failed"
    assert status["reason"]


def test_status_enable_failed_when_probe_errors(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: {"_error": "boom"})
    status = cuda_kit.acceleration_status()
    assert status["status"] == "enable_failed"
    assert "boom" in status["reason"]
    assert status["probe"]["state"] == "failed"


def test_status_enabled_optimistic_while_probe_pending(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    warm_calls: list[int] = []
    monkeypatch.setattr(cuda_kit, "_schedule_probe_warm", lambda: warm_calls.append(1))
    status = cuda_kit.acceleration_status()
    assert status["status"] == "enabled"
    assert status["probe"]["state"] == "pending"
    assert warm_calls, "probe 未就绪时应触发后台预热"


def test_gpu_detected_cached_none_while_pending_then_cached_result(monkeypatch: pytest.MonkeyPatch) -> None:
    import time

    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", False)
    monkeypatch.setattr(cuda_kit, "_gpu_detect_result", None)
    monkeypatch.setattr(cuda_kit, "_detect_nvidia_gpu", lambda: True)
    assert cuda_kit._gpu_detected_cached() is None
    for _ in range(200):
        if cuda_kit._gpu_detected_cached() is not None:
            break
        time.sleep(0.01)
    assert cuda_kit._gpu_detected_cached() is True


def test_gpu_detected_cached_skipped_on_non_windows(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "darwin")
    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", False)
    assert cuda_kit._gpu_detected_cached() is None
    assert cuda_kit._gpu_detect_started is False


def test_detect_nvidia_gpu_subprocess_outcomes(monkeypatch: pytest.MonkeyPatch) -> None:
    import subprocess

    class _Result:
        returncode = 0
        stdout = b"GPU 0: NVIDIA GeForce RTX 3080 Ti"

    monkeypatch.setattr(subprocess, "run", lambda *args, **kwargs: _Result())
    assert cuda_kit._detect_nvidia_gpu() is True

    def _missing(*args, **kwargs):
        raise FileNotFoundError("nvidia-smi")

    monkeypatch.setattr(subprocess, "run", _missing)
    assert cuda_kit._detect_nvidia_gpu() is False


def test_status_invalidated_on_torch_version_mismatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_current_torch_version", lambda: "2.12.0")
    status = cuda_kit.acceleration_status()
    assert status["status"] == "invalidated"
    assert status["reason"]


def test_status_invalidated_even_when_enabled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_current_torch_version", lambda: "2.12.0")
    status = cuda_kit.acceleration_status()
    assert status["status"] == "invalidated"
    assert status["enabled"] is True


def test_local_version_suffix_does_not_invalidate(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_current_torch_version", lambda: "2.11.0+cu128")
    status = cuda_kit.acceleration_status()
    assert status["status"] == "ready"


def test_unsupported_platform_short_circuits(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "darwin")
    status = cuda_kit.acceleration_status()
    assert status["supported"] is False
    assert status["enabled"] is False
    assert status["status"] == "not_downloaded"
    assert status["reason"]
    assert status["kit"] is None
    assert status["job"] is None
    assert status["probe"]["state"] == "pending"
    with pytest.raises(ASRboxError):
        cuda_kit.set_enabled(True)


# --- reason_code 契约 ---


def test_reason_code_unsupported_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "darwin")
    assert cuda_kit.acceleration_status()["reason_code"] == "unsupported_platform"


def test_reason_code_kit_version_mismatch(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_current_torch_version", lambda: "2.12.0")
    assert cuda_kit.acceleration_status()["reason_code"] == "kit_version_mismatch"


def test_reason_code_probe_failed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: {"_error": "boom"})
    assert cuda_kit.acceleration_status()["reason_code"] == "probe_failed"


def test_reason_code_kit_not_injected(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    snapshot = {"torch_cuda_available": True, "cuda_device_name": "Fake RTX", "torch_file": "/elsewhere/torch/__init__.py"}
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: snapshot)
    status = cuda_kit.acceleration_status()
    assert status["reason_code"] == "kit_not_injected"
    assert "重启软件" in status["reason"]


def test_reason_code_cuda_device_missing(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    kit, _manifest = _install_fake_kit(tmp_path)
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: _probe_ok(kit, cuda=False))
    assert cuda_kit.acceleration_status()["reason_code"] == "cuda_device_missing"


def test_reason_code_none_when_healthy(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    kit, _manifest = _install_fake_kit(tmp_path)
    assert cuda_kit.acceleration_status()["reason_code"] is None
    cuda_kit.set_enabled(True)
    monkeypatch.setattr(cuda_kit, "_probe_snapshot_cached", lambda: _probe_ok(kit))
    assert cuda_kit.acceleration_status()["reason_code"] is None


# --- 按需重新探测 ---


def test_redetect_reprobes_after_driver_recovery(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", False)
    monkeypatch.setattr(cuda_kit, "_gpu_detect_result", None)
    outcomes = iter([False, True])
    monkeypatch.setattr(cuda_kit, "_detect_nvidia_gpu", lambda: next(outcomes))
    assert cuda_kit._gpu_detected_cached() is None
    for _ in range(200):
        if cuda_kit._gpu_detected_cached() is not None:
            break
        time.sleep(0.01)
    assert cuda_kit._gpu_detected_cached() is False, "首次探测（装驱动前）无显卡"
    status = cuda_kit.redetect_and_status()
    assert status["gpu_detected"] is None, "重新探测异步进行，状态端点不阻塞"
    for _ in range(200):
        if cuda_kit._gpu_detected_cached() is not None:
            break
        time.sleep(0.01)
    assert cuda_kit._gpu_detected_cached() is True, "装好驱动后重新探测应能看到显卡"


def test_redetect_keeps_inflight_probe(monkeypatch: pytest.MonkeyPatch) -> None:
    started = threading.Event()
    release = threading.Event()
    calls: list[int] = []

    def _slow_detect() -> bool:
        calls.append(1)
        started.set()
        release.wait(timeout=5)
        return True

    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", False)
    monkeypatch.setattr(cuda_kit, "_gpu_detect_result", None)
    monkeypatch.setattr(cuda_kit, "_detect_nvidia_gpu", _slow_detect)
    assert cuda_kit._gpu_detected_cached() is None
    assert started.wait(timeout=5)
    cuda_kit.redetect_and_status()
    assert cuda_kit._gpu_detect_started is True
    release.set()
    for _ in range(200):
        if cuda_kit._gpu_detected_cached() is not None:
            break
        time.sleep(0.01)
    assert cuda_kit._gpu_detected_cached() is True
    assert len(calls) == 1, "进行中的探测不被打断、不重复拉起"


def test_redetect_noop_on_unsupported_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "darwin")
    monkeypatch.setattr(cuda_kit, "_gpu_detect_started", False)
    monkeypatch.setattr(cuda_kit, "_gpu_detect_result", None)
    status = cuda_kit.redetect_and_status()
    assert status["supported"] is False
    assert status["reason_code"] == "unsupported_platform"
    assert cuda_kit._gpu_detect_started is False, "非 Windows 平台不触发任何探测"
    with pytest.raises(ASRboxError):
        cuda_kit.start_download()
    assert cuda_kit.set_enabled(False)["supported"] is False
    assert cuda_kit.delete_kit()["supported"] is False
    assert not cuda_kit.kit_root().exists(), "非 Windows 平台不得创建任何套件目录"


# --- 来源白名单 ---


def test_release_urls_accept_production_assets() -> None:
    cuda_kit._validate_release_url(cuda_kit.manifest_url())
    cuda_kit._validate_release_url(cuda_kit.part_url(PART1_NAME))


@pytest.mark.parametrize(
    "url",
    [
        f"http://github.com/Goldloli/asrbox/releases/download/v{__version__}/cuda-kit-manifest.json",
        f"https://evil.com/Goldloli/asrbox/releases/download/v{__version__}/cuda-kit-manifest.json",
        "https://github.com/Goldloli/asrbox/releases/download/v9.9.9/cuda-kit-manifest.json",
        f"https://github.com/other/asrbox/releases/download/v{__version__}/cuda-kit-manifest.json",
        f"https://github.com/Goldloli/asrbox/releases/download/v{__version__}/../../etc/passwd",
        f"https://github.com/Goldloli/asrbox/releases/download/v{__version__}/other-asset.zip",
    ],
    ids=["non-https", "non-github-host", "wrong-version", "wrong-repo-path", "path-traversal", "wrong-asset"],
)
def test_release_url_rejected(url: str) -> None:
    with pytest.raises(cuda_kit.CudaKitFetchError):
        cuda_kit._validate_release_url(url)


@pytest.mark.parametrize(
    "name",
    ["../../x", "..\\..\\x", f"{PART1_NAME}/../../x", f"{PART1_NAME}.exe", "evil.zip.part1", ""],
    ids=["posix-traversal", "windows-traversal", "nested-traversal", "suffix-tampering", "wrong-name", "empty"],
)
def test_part_name_rejected(name: str) -> None:
    with pytest.raises(cuda_kit.CudaKitFetchError):
        cuda_kit.part_url(name)


def test_redirect_targets_limited_to_github_domains() -> None:
    assert cuda_kit._validate_redirect_url("https://objects.githubusercontent.com/release-asset?token=1")
    assert cuda_kit._validate_redirect_url(cuda_kit.manifest_url())
    for url in (
        "https://evil.com/x",
        "http://objects.githubusercontent.com/x",
        "https://githubusercontent.com.evil.com/x",
    ):
        with pytest.raises(cuda_kit.CudaKitFetchError):
            cuda_kit._validate_redirect_url(url)


# --- 下载 job ---


def test_download_job_end_to_end(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest, payloads = _build_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_default_fetch", _FakeFetcher(payloads))
    job = cuda_kit.start_download()
    assert job["status"] == "running"
    final = _wait_for_job()
    assert final["status"] == "completed"
    assert final["phase"] == "completed"
    assert final["parts_total"] == 2
    assert final["downloaded_bytes"] == final["total_bytes"] == manifest["zip_size"]
    assert final["error"] is None
    kit = cuda_kit.kit_dir()
    assert (kit / "torch" / "__init__.py").is_file()
    assert (kit / "torch" / "lib" / "cudart64_128.dll").is_file()
    assert (kit / "manifest.json").is_file()
    assert list(cuda_kit.downloads_dir().iterdir()) == [], "安装成功后暂存目录应清空"
    status = cuda_kit.acceleration_status()
    assert status["status"] == "ready"
    assert status["kit"]["torch_version"] == KIT_TORCH_VERSION
    persisted = json.loads(cuda_kit._state_path().read_text(encoding="utf-8"))
    assert persisted["status"] == "completed"


def test_tampered_part_fails_and_is_removed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _manifest, payloads = _build_fake_kit(tmp_path)
    part2_url = cuda_kit.part_url(PART2_NAME)
    payloads[part2_url] = bytes([payloads[part2_url][0] ^ 0xFF]) + payloads[part2_url][1:]
    monkeypatch.setattr(cuda_kit, "_default_fetch", _FakeFetcher(payloads))
    cuda_kit.start_download()
    final = _wait_for_job()
    assert final["status"] == "failed"
    assert PART2_NAME in final["error"]
    assert not cuda_kit.kit_dir().exists()
    assert not (cuda_kit.downloads_dir() / f"{PART2_NAME}.part").exists(), "校验不符的分卷应删除"
    assert (cuda_kit.downloads_dir() / f"{PART1_NAME}.part").is_file(), "完好分卷保留供重试"


def test_tampered_manifest_file_hash_discards_everything(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest, payloads = _build_fake_kit(tmp_path)
    manifest["files"][0]["sha256"] = "0" * 64
    payloads[cuda_kit.manifest_url()] = json.dumps(manifest).encode("utf-8")
    old_kit = cuda_kit.kit_dir()
    (old_kit / "torch").mkdir(parents=True)
    (old_kit / "torch" / "__init__.py").write_text("# old kit\n", encoding="utf-8")
    monkeypatch.setattr(cuda_kit, "_default_fetch", _FakeFetcher(payloads))
    cuda_kit.start_download()
    final = _wait_for_job()
    assert final["status"] == "failed"
    assert final["phase"] == "failed"
    assert "integrity" in final["error"] or "missing" in final["error"]
    assert not cuda_kit.kit_dir().exists(), "逐文件复核失败时旧套件一并作废"
    assert not (cuda_kit.downloads_dir() / "extract").exists()


def test_download_resumes_existing_part(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest, payloads = _build_fake_kit(tmp_path)
    part1_url = cuda_kit.part_url(PART1_NAME)
    part1_data = payloads[part1_url]
    resume_from = len(part1_data) // 3
    downloads = cuda_kit.downloads_dir()
    downloads.mkdir(parents=True)
    (downloads / f"{PART1_NAME}.part").write_bytes(part1_data[:resume_from])
    fetcher = _FakeFetcher(payloads)
    monkeypatch.setattr(cuda_kit, "_default_fetch", fetcher)
    cuda_kit.start_download()
    final = _wait_for_job()
    assert final["status"] == "completed"
    part1_requests = [offset for url, offset in fetcher.requests if url == part1_url]
    assert part1_requests == [resume_from], "已有 .part 字节应作为 Range 起点（bytes=N-）"
    assert final["downloaded_bytes"] == manifest["zip_size"]


def test_cancel_midway_preserves_parts_and_retry_resumes(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _manifest, payloads = _build_fake_kit(tmp_path)
    part1_url = cuda_kit.part_url(PART1_NAME)
    # 只放慢分卷下载（manifest 快速通过）；轮询 job 内存进度而非文件大小（Windows 上打开中的文件 stat 不可靠）
    fetcher = _FakeFetcher(payloads, chunk_bytes=32, chunk_delay=0.05, delay_on=lambda url: url != cuda_kit.manifest_url())
    monkeypatch.setattr(cuda_kit, "_default_fetch", fetcher)
    cuda_kit.start_download()
    part1_path = cuda_kit.downloads_dir() / f"{PART1_NAME}.part"
    _wait_for_job(lambda job: job.get("current_part") == PART1_NAME and job["downloaded_bytes"] > 0)
    cuda_kit.cancel_download()
    final = _wait_for_job()
    assert final["status"] == "cancelled"
    assert part1_path.is_file()
    partial = part1_path.stat().st_size
    assert 0 < partial < len(payloads[part1_url]), "取消后保留 .part 供续传"

    fetcher.chunk_delay = 0.0
    cuda_kit.start_download()
    retried = _wait_for_job()
    assert retried["status"] == "completed"
    part1_offsets = [offset for url, offset in fetcher.requests if url == part1_url]
    assert part1_offsets[0] == 0
    assert part1_offsets[-1] == partial, "重试应从取消时保留的字节续传"


def test_start_download_is_idempotent_while_running(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _manifest, payloads = _build_fake_kit(tmp_path)
    entered = threading.Event()
    release = threading.Event()

    class _BlockingFetcher(_FakeFetcher):
        def __call__(self, url, target, **kwargs):
            if url == cuda_kit.manifest_url():
                entered.set()
                if not release.wait(10):
                    raise cuda_kit.CudaKitFetchError("test timed out")
            return super().__call__(url, target, **kwargs)

    fetcher = _BlockingFetcher(payloads)
    monkeypatch.setattr(cuda_kit, "_default_fetch", fetcher)
    first = cuda_kit.start_download()
    assert entered.wait(5), "download worker did not start"
    second = cuda_kit.start_download()
    assert second["id"] == first["id"]
    assert second["status"] == "running"
    release.set()
    assert _wait_for_job()["status"] == "completed"
    manifest_calls = [url for url, _offset in fetcher.requests if url == cuda_kit.manifest_url()]
    assert len(manifest_calls) == 1, "running 中重复 download 不得并发起第二个"
    assert fetcher.max_active == 1


def test_failed_job_can_be_retried(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _manifest, payloads = _build_fake_kit(tmp_path)

    class _FlakyFetcher(_FakeFetcher):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, **kwargs)
            self.fail_part1 = True

        def __call__(self, url, target, **kwargs):
            if self.fail_part1 and url == cuda_kit.part_url(PART1_NAME):
                self.fail_part1 = False
                raise cuda_kit.CudaKitFetchError("network down")
            return super().__call__(url, target, **kwargs)

    monkeypatch.setattr(cuda_kit, "_default_fetch", _FlakyFetcher(payloads))
    cuda_kit.start_download()
    assert _wait_for_job()["status"] == "failed"
    cuda_kit.start_download()
    assert _wait_for_job()["status"] == "completed"


def test_interrupted_job_recovers_as_failed() -> None:
    cuda_kit.kit_root().mkdir(parents=True)
    cuda_kit._write_state({**cuda_kit._IDLE_JOB, "id": "abc123", "status": "running", "phase": "parts"})
    job = cuda_kit.current_job()
    assert job["status"] == "failed"
    assert job["phase"] == "interrupted"
    assert job["id"] == "abc123"
    persisted = json.loads(cuda_kit._state_path().read_text(encoding="utf-8"))
    assert persisted["status"] == "failed"


def test_terminal_job_recovers_for_display() -> None:
    cuda_kit.kit_root().mkdir(parents=True)
    cuda_kit._write_state({**cuda_kit._IDLE_JOB, "id": "deadbeef", "status": "failed", "phase": "failed", "error": "checksum mismatch"})
    status = cuda_kit.acceleration_status()
    assert status["status"] == "not_downloaded"
    assert status["job"] is not None
    assert status["job"]["status"] == "failed"
    assert status["job"]["error"] == "checksum mismatch"


def test_probe_cache_reset_on_lifecycle_events(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    calls: list[int] = []
    monkeypatch.setattr(cuda_kit, "_reset_probe_cache", lambda: calls.append(1))
    cuda_kit.set_enabled(True)
    cuda_kit.set_enabled(False)
    cuda_kit.delete_kit()
    _manifest, payloads = _build_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_default_fetch", _FakeFetcher(payloads))
    cuda_kit.start_download()
    assert _wait_for_job()["status"] == "completed"
    assert len(calls) == 4, "开关切换、删除套件、下载完成都必须重置 probe 缓存"


# --- 路由层 ---


def test_status_route_returns_declared_fields() -> None:
    with _make_client() as client:
        response = client.get("/settings/cuda-acceleration")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"enabled", "status", "reason", "reason_code", "supported", "gpu_detected", "kit", "probe", "job"}
    assert body["supported"] is True
    assert body["enabled"] is False
    assert body["status"] == "not_downloaded"
    assert body["reason"] is None
    assert body["reason_code"] is None
    assert body["kit"] is None
    assert body["job"] is None
    assert set(body["probe"]) == {"state", "torch_cuda_available", "cuda_device_name", "torch_file"}
    assert body["probe"]["state"] == "pending"


def test_redetect_route_returns_status() -> None:
    with _make_client() as client:
        response = client.post("/settings/cuda-acceleration/redetect")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"enabled", "status", "reason", "reason_code", "supported", "gpu_detected", "kit", "probe", "job"}
    assert body["supported"] is True


def test_put_route_persists_switch_and_returns_status() -> None:
    with _make_client() as client:
        response = client.put("/settings/cuda-acceleration", json={"enabled": True})
        assert response.status_code == 200
        body = response.json()
        assert body["enabled"] is True
        assert body["status"] == "not_downloaded", "套件未就绪时开启不报错，由状态体现"
        assert client.get("/settings/cuda-acceleration").json()["enabled"] is True
        off = client.put("/settings/cuda-acceleration", json={"enabled": False})
        assert off.status_code == 200
        assert off.json()["enabled"] is False
    config = json.loads((cuda_kit.kit_root() / "config.json").read_text(encoding="utf-8"))
    assert config == {"enabled": False}


def test_download_job_route_returns_idle_without_job() -> None:
    with _make_client() as client:
        response = client.get("/settings/cuda-acceleration/download")
    assert response.status_code == 200
    body = response.json()
    assert set(body) == {"id", "status", "phase", "current_part", "parts_total", "downloaded_bytes", "total_bytes", "error"}
    assert body["status"] == "idle"
    assert body["id"] is None


def test_download_route_flow(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    manifest, payloads = _build_fake_kit(tmp_path)
    monkeypatch.setattr(cuda_kit, "_default_fetch", _FakeFetcher(payloads))
    with _make_client() as client:
        started = client.post("/settings/cuda-acceleration/download")
        assert started.status_code == 202
        assert started.json()["status"] in {"running", "completed"}
        assert started.json()["id"]
        deadline = time.time() + 15
        job = {}
        while time.time() < deadline:
            job = client.get("/settings/cuda-acceleration/download").json()
            if job["status"] in {"completed", "failed", "cancelled"}:
                break
            time.sleep(0.05)
        assert job["status"] == "completed"
        assert set(job) == {"id", "status", "phase", "current_part", "parts_total", "downloaded_bytes", "total_bytes", "error"}
        assert job["parts_total"] == 2
        assert job["downloaded_bytes"] == job["total_bytes"] == manifest["zip_size"]
        status = client.get("/settings/cuda-acceleration").json()
        assert status["status"] == "ready"
        assert status["job"]["status"] == "completed"
        cancel = client.post("/settings/cuda-acceleration/download/cancel")
        assert cancel.status_code == 200
        assert cancel.json()["status"] == "completed", "已结束的 job 不受取消影响"


def test_delete_kit_route_preserves_switch() -> None:
    with _make_client() as client:
        client.put("/settings/cuda-acceleration", json={"enabled": True})
        kit = cuda_kit.kit_dir()
        (kit / "torch").mkdir(parents=True)
        (kit / "torch" / "__init__.py").write_text("# kit\n", encoding="utf-8")
        downloads = cuda_kit.downloads_dir()
        downloads.mkdir(parents=True)
        (downloads / "junk.part").write_bytes(b"junk")
        response = client.delete("/settings/cuda-acceleration/kit")
        assert response.status_code == 200
        body = response.json()
        assert body["enabled"] is True, "删除套件不动 config.json"
        assert body["status"] == "not_downloaded"
        assert not kit.exists()
        assert not downloads.exists()
        assert (cuda_kit.kit_root() / "config.json").is_file()


def test_routes_reject_mutations_on_unsupported_platform(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(cuda_kit, "_host_platform", lambda: "darwin")
    with _make_client() as client:
        status = client.get("/settings/cuda-acceleration")
        assert status.status_code == 200
        body = status.json()
        assert body["supported"] is False
        assert body["status"] == "not_downloaded"
        assert body["enabled"] is False
        assert body["reason"]
        assert body["kit"] is None
        assert body["job"] is None
        download = client.post("/settings/cuda-acceleration/download")
        assert download.status_code == 400
        assert download.json()["detail"]["error_code"] == "CUDA_ACCELERATION_UNSUPPORTED"
        enable = client.put("/settings/cuda-acceleration", json={"enabled": True})
        assert enable.status_code == 400
        assert enable.json()["detail"]["error_code"] == "CUDA_ACCELERATION_UNSUPPORTED"
        disable = client.put("/settings/cuda-acceleration", json={"enabled": False})
        assert disable.status_code == 200
        assert disable.json()["supported"] is False
        delete = client.delete("/settings/cuda-acceleration/kit")
        assert delete.status_code == 200
        redetect = client.post("/settings/cuda-acceleration/redetect")
        assert redetect.status_code == 200
        assert redetect.json()["supported"] is False
        assert redetect.json()["reason_code"] == "unsupported_platform"
    assert not cuda_kit.kit_root().exists(), "非 Windows 平台不得创建任何套件目录"
