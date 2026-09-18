from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import time
from pathlib import Path

import pytest
import requests


def test_frozen_binary_health_runtime_and_shutdown() -> None:
    if os.environ.get("ASRBOX_BINARY_SMOKE") != "1":
        pytest.skip("Set ASRBOX_BINARY_SMOKE=1 to run the frozen binary smoke gate")

    root = Path(__file__).resolve().parents[2]
    binary = Path(os.environ.get("ASRBOX_BINARY_PATH") or root / "dist" / "asrbox-server")
    if not binary.exists():
        subprocess.run([sys.executable, str(root / "backend" / "build_binary.py")], check=True, cwd=root)
    assert binary.exists()
    if binary.is_dir():
        binary = binary / ("asrbox-server.exe" if os.name == "nt" else "asrbox-server")
    assert binary.is_file()

    if sys.platform == "darwin" and os.environ.get("ASRBOX_BINARY_MLX") == "1":
        mlx_check = subprocess.run(
            [str(binary), "--runtime-check", "mlx"],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=root,
        )
        assert mlx_check.returncode == 0, mlx_check.stdout + mlx_check.stderr

    port = int(os.environ.get("ASRBOX_BINARY_SMOKE_PORT", "17594"))
    data_dir = tempfile.mkdtemp(prefix="asrbox-binary-smoke-")
    resolved_data_dir = str(Path(data_dir).resolve())
    proc = subprocess.Popen(
        [str(binary), "--host", "127.0.0.1", "--port", str(port), "--data-dir", data_dir],
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        cwd=root,
    )
    try:
        _wait_for_health(port, proc)
        start = time.time()
        runtime = requests.get(f"http://127.0.0.1:{port}/runtime/status", timeout=180)
        assert runtime.status_code == 200
        runtime_data = runtime.json()
        assert runtime_data["data_dir"] == resolved_data_dir
        capability_detail = json.dumps(
            {
                "qwen3_asr_available": runtime_data.get("qwen3_asr_available"),
                "funasr_available": runtime_data.get("funasr_available"),
                "moss_transcribe_diarize_available": runtime_data.get("moss_transcribe_diarize_available"),
                "torchaudio_available": runtime_data.get("torchaudio_available"),
                "warnings": runtime_data.get("warnings"),
            },
            ensure_ascii=False,
        )
        assert runtime_data["qwen3_asr_available"] is True, capability_detail
        assert runtime_data["funasr_available"] is True, capability_detail
        assert runtime_data["moss_transcribe_diarize_available"] is True, capability_detail
        assert time.time() - start < 180

        shutdown = requests.post(f"http://127.0.0.1:{port}/shutdown", timeout=30)
        assert shutdown.status_code == 200
        try:
            proc.wait(timeout=60)
        except subprocess.TimeoutExpired:
            proc.terminate()
            proc.wait(timeout=30)
        assert _port_released(port)
    finally:
        if proc.poll() is None:
            proc.terminate()
            try:
                proc.wait(timeout=30)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait(timeout=10)

    with tempfile.TemporaryDirectory(prefix="asrbox-binary-worker-") as worker_dir:
        worker_path = Path(worker_dir)
        request_path = worker_path / "request.json"
        result_path = worker_path / "result.json"
        request_path.write_text(json.dumps({"model_name": "whisper-base", "inputs": []}), encoding="utf-8")
        worker = subprocess.run(
            [
                str(binary),
                "--data-dir",
                data_dir,
                "--local-worker-request",
                str(request_path),
                "--local-worker-result",
                str(result_path),
            ],
            capture_output=True,
            text=True,
            timeout=180,
            cwd=root,
        )
        assert worker.returncode == 1, worker.stdout + worker.stderr
        worker_state = json.loads(result_path.read_text(encoding="utf-8"))
        assert worker_state["status"] == "failed"
        assert worker_state["error_type"] == "ValueError"


def _wait_for_health(port: int, proc: subprocess.Popen) -> None:
    deadline = time.time() + 120
    last_error = ""
    while time.time() < deadline:
        if proc.poll() is not None:
            output = proc.stdout.read() if proc.stdout else ""
            raise AssertionError(f"binary exited early with {proc.returncode}\n{last_error}\n{output}")
        try:
            response = requests.get(f"http://127.0.0.1:{port}/health", timeout=2)
            if response.status_code == 200 and response.json()["status"] == "healthy":
                return
        except Exception as exc:
            last_error = str(exc)
        time.sleep(1)
    raise AssertionError(f"Timed out waiting for binary /health: {last_error}")


def _port_released(port: int) -> bool:
    sock = socket.socket()
    try:
        return sock.connect_ex(("127.0.0.1", port)) != 0
    finally:
        sock.close()
