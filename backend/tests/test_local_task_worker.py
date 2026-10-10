from __future__ import annotations

import json
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest

from backend.models import TranscriptSegment, TranscriptionResult


def test_local_worker_publishes_atomic_progress_and_completed_results(tmp_path: Path, monkeypatch) -> None:
    from backend.services import local_task_worker

    calls: list[str] = []

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        calls.append(audio_path)
        return TranscriptionResult(
            text=Path(audio_path).stem,
            language=options["language"],
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text=Path(audio_path).stem)],
        )

    monkeypatch.setattr(local_task_worker, "transcribe_with_local_model", fake_transcribe)
    request_path = tmp_path / "request.json"
    result_path = tmp_path / "result.json"
    request_path.write_text(
        json.dumps(
            {
                "model_name": "whisper-base",
                "options": {"language": "zh"},
                "inputs": [{"audio_path": "first.wav"}, {"audio_path": "second.wav"}],
            }
        ),
        encoding="utf-8",
    )

    assert local_task_worker.run_local_task_worker(request_path, result_path) == 0

    state = json.loads(result_path.read_text(encoding="utf-8"))
    assert state["status"] == "completed"
    assert state["completed"] == state["total"] == 2
    assert [item["text"] for item in state["results"]] == ["first", "second"]
    assert calls == ["first.wav", "second.wav"]
    assert not result_path.with_suffix(".json.tmp").exists()


def test_local_worker_reports_invalid_requests_without_a_traceback(tmp_path: Path) -> None:
    from backend.services.local_task_worker import run_local_task_worker

    request_path = tmp_path / "request.json"
    result_path = tmp_path / "result.json"
    request_path.write_text(json.dumps({"model_name": "whisper-base", "inputs": []}), encoding="utf-8")

    assert run_local_task_worker(request_path, result_path) == 1
    state = json.loads(result_path.read_text(encoding="utf-8"))
    assert state["status"] == "failed"
    assert state["error_type"] == "ValueError"
    assert "at least one input" in state["error"]


def test_local_worker_command_supports_source_and_frozen_runtimes(tmp_path: Path, monkeypatch) -> None:
    from backend.services import tasks

    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    request_path = tmp_path / "request.json"
    result_path = tmp_path / "result.json"

    source_command = tasks._local_worker_command(request_path, result_path)
    assert source_command[:3] == [sys.executable, "-m", "backend.server"]
    assert source_command[source_command.index("--parent-pid") + 1] == str(tasks.os.getpid())

    monkeypatch.setattr(tasks.sys, "frozen", True, raising=False)
    frozen_command = tasks._local_worker_command(request_path, result_path)
    assert frozen_command[0] == sys.executable
    assert "backend.server" not in frozen_command
    assert frozen_command[-4:] == ["--local-worker-request", str(request_path), "--local-worker-result", str(result_path)]


def test_local_worker_environment_lifts_the_frozen_thread_cap(monkeypatch) -> None:
    from backend.services import tasks

    monkeypatch.setenv("OMP_NUM_THREADS", "1")
    monkeypatch.setattr(tasks.os, "cpu_count", lambda: 16)

    assert tasks._local_worker_environment(1)["OMP_NUM_THREADS"] == "16"
    assert tasks._local_worker_environment(4)["OMP_NUM_THREADS"] == "4"

    monkeypatch.setattr(tasks.os, "cpu_count", lambda: 3)
    assert tasks._local_worker_environment(4)["OMP_NUM_THREADS"] == "1"


def test_combining_local_chunks_filters_overlap_and_offsets_timestamps() -> None:
    from backend.services.tasks import _combine_local_worker_results

    row = SimpleNamespace(duration_ms=121_000, language="zh", model_name="whisper-base")
    inputs = [
        {"audio_path": "first.wav", "start_ms": 0, "end_ms": 120_000},
        {"audio_path": "second.wav", "start_ms": 118_000, "end_ms": 121_000},
    ]
    payloads = [
        TranscriptionResult(
            text="first",
            segments=[TranscriptSegment(id=1, start=119.0, end=120.0, text="first")],
        ).model_dump(mode="json"),
        TranscriptionResult(
            text="duplicate kept",
            segments=[
                TranscriptSegment(id=1, start=0.5, end=1.5, text="duplicate"),
                TranscriptSegment(id=2, start=2.5, end=3.0, text="kept"),
            ],
        ).model_dump(mode="json"),
    ]

    result = _combine_local_worker_results(row, inputs, payloads)

    assert [segment.text for segment in result.segments] == ["first", "kept"]
    assert result.segments[1].start == pytest.approx(120.5)
    assert result.duration == pytest.approx(121.0)


def test_combining_local_chunks_keeps_timestampless_segments_from_every_chunk() -> None:
    from backend.services.tasks import _combine_local_worker_results

    row = SimpleNamespace(duration_ms=238_000, language="en", model_name="qwen3-asr-1.7b")
    inputs = [
        {"audio_path": "first.wav", "start_ms": 0, "end_ms": 120_000},
        {"audio_path": "second.wav", "start_ms": 118_000, "end_ms": 238_000},
    ]
    payloads = [
        TranscriptionResult(
            text="alpha",
            segments=[TranscriptSegment(id=1, start=0.0, end=0.0, text="alpha")],
        ).model_dump(mode="json"),
        TranscriptionResult(
            text="bravo",
            segments=[TranscriptSegment(id=1, start=0.0, end=0.0, text="bravo")],
        ).model_dump(mode="json"),
    ]

    result = _combine_local_worker_results(row, inputs, payloads)

    assert [segment.text for segment in result.segments] == ["alpha", "bravo"]
    assert (result.segments[0].start, result.segments[0].end) == (0.0, 120.0)
    assert (result.segments[1].start, result.segments[1].end) == (118.0, 238.0)
    assert result.text == "alpha bravo"


def test_short_local_worker_progress_accepts_one_result_without_chunk_rows() -> None:
    from backend.services.tasks import _publish_local_worker_progress

    published = _publish_local_worker_progress(
        None,
        SimpleNamespace(),
        [],
        [{"text": "short transcript"}],
        0,
    )

    assert published == 1


def test_stalled_local_worker_is_terminated_and_reported(tmp_path: Path, monkeypatch) -> None:
    import pytest

    from backend.services import tasks
    from backend.services.errors import ASRboxError

    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_LOCAL_WORKER_STALL_SECONDS", "1")
    monkeypatch.setattr(
        tasks.settings_service,
        "get_settings",
        lambda db: SimpleNamespace(vad=False, word_timestamps=False, max_concurrent_local_tasks=1),
    )
    monkeypatch.setattr(
        tasks,
        "_local_worker_inputs",
        lambda db, row, audio_path: ([{"audio_path": "chunk.wav", "start_ms": 0, "end_ms": 1000}], []),
    )

    terminated: list[str] = []

    class HungProcess:
        def __init__(self, *args, **kwargs) -> None:
            self.returncode = None

        def poll(self):
            return None

        def terminate(self) -> None:
            terminated.append("terminate")

        def kill(self) -> None:
            terminated.append("kill")

        def wait(self, timeout=None) -> int:
            return 0

    monkeypatch.setattr(tasks.subprocess, "Popen", lambda *args, **kwargs: HungProcess())

    row = SimpleNamespace(id="stalled-task", model_name="whisper-base", language=None, options_json="{}")

    with pytest.raises(ASRboxError) as excinfo:
        tasks._transcribe_local_subprocess(None, row, Path("audio.wav"))

    assert excinfo.value.code == "LOCAL_WORKER_STALLED"
    assert excinfo.value.stage == "transcribing"
    assert terminated


def _heartbeat_worker_harness(tmp_path: Path, monkeypatch, task_id: str):
    import time as time_module

    from backend.services import tasks

    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_LOCAL_WORKER_STALL_SECONDS", "1")
    monkeypatch.setattr(
        tasks.settings_service,
        "get_settings",
        lambda db: SimpleNamespace(vad=False, word_timestamps=False, max_concurrent_local_tasks=1),
    )
    monkeypatch.setattr(
        tasks,
        "_local_worker_inputs",
        lambda db, row, audio_path: ([{"audio_path": "chunk.wav", "start_ms": 0, "end_ms": 1000}], []),
    )

    terminated: list[str] = []

    class HungProcess:
        def __init__(self, *args, **kwargs) -> None:
            self.returncode = None

        def poll(self):
            return None

        def terminate(self) -> None:
            terminated.append("terminate")

        def kill(self) -> None:
            terminated.append("kill")

        def wait(self, timeout=None) -> int:
            return 0

    monkeypatch.setattr(tasks.subprocess, "Popen", lambda *args, **kwargs: HungProcess())
    heartbeat_file = tmp_path / "cache" / "task-workers" / task_id / "heartbeat.json"
    heartbeat_file.parent.mkdir(parents=True, exist_ok=True)
    return tasks, heartbeat_file, terminated, time_module


def test_active_heartbeat_survives_stall_limit_but_hits_hard_cap(tmp_path: Path, monkeypatch) -> None:
    import threading
    import time as time_module

    import pytest

    from backend.services.errors import ASRboxError

    tasks, heartbeat_file, terminated, _ = _heartbeat_worker_harness(tmp_path, monkeypatch, "active-task")
    monkeypatch.setattr(tasks, "LOCAL_WORKER_LIVENESS_SECONDS", 0.2)
    stop = threading.Event()

    def beat() -> None:
        started = time_module.monotonic()
        while not stop.is_set():
            payload = {"at": time_module.time(), "cpu": 100.0 + (time_module.monotonic() - started) * 3, "completed": 0, "total": 1}
            heartbeat_file.write_text(json.dumps(payload), encoding="utf-8")
            stop.wait(0.05)

    thread = threading.Thread(target=beat, daemon=True)
    thread.start()
    row = SimpleNamespace(id="active-task", model_name="whisper-base", language=None, options_json="{}")
    commits: list[int] = []
    fake_db = SimpleNamespace(commit=lambda: commits.append(1))
    started = time_module.monotonic()
    try:
        with pytest.raises(ASRboxError) as excinfo:
            tasks._transcribe_local_subprocess(fake_db, row, Path("audio.wav"))
    finally:
        stop.set()
        thread.join(timeout=2)

    elapsed = time_module.monotonic() - started
    assert excinfo.value.code == "LOCAL_WORKER_STALLED"
    # The stall limit is 1s and the hard cap 3s: a stall under ~2.5s would mean the
    # heartbeat activity was ignored; the cap bounds the busy-loop case.
    assert elapsed >= 2.5
    assert terminated
    assert commits  # liveness kept refreshing the task row while the worker was active


def test_frozen_heartbeat_stalls_at_the_configured_limit(tmp_path: Path, monkeypatch) -> None:
    import time as time_module

    import pytest

    from backend.services.errors import ASRboxError

    tasks, heartbeat_file, terminated, _ = _heartbeat_worker_harness(tmp_path, monkeypatch, "frozen-task")
    # The heartbeat exists but its CPU time never advances: a wedged-but-alive process.
    heartbeat_file.write_text(json.dumps({"at": time_module.time(), "cpu": 42.0, "completed": 0, "total": 1}), encoding="utf-8")
    row = SimpleNamespace(id="frozen-task", model_name="whisper-base", language=None, options_json="{}")
    started = time_module.monotonic()
    with pytest.raises(ASRboxError) as excinfo:
        tasks._transcribe_local_subprocess(None, row, Path("audio.wav"))
    elapsed = time_module.monotonic() - started

    assert excinfo.value.code == "LOCAL_WORKER_STALLED"
    assert elapsed < 2.5
    assert terminated


def test_local_worker_heartbeat_reports_cpu_and_stops_with_the_run(tmp_path: Path, monkeypatch) -> None:
    import time as time_module

    from backend.services import local_task_worker

    monkeypatch.setattr(local_task_worker, "HEARTBEAT_SECONDS", 0.05)

    def burning_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        deadline = time_module.monotonic() + 0.2
        while time_module.monotonic() < deadline:
            sum(index * index for index in range(5000))
        return TranscriptionResult(
            text=Path(audio_path).stem,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text=Path(audio_path).stem)],
        )

    monkeypatch.setattr(local_task_worker, "transcribe_with_local_model", burning_transcribe)
    request_path = tmp_path / "request.json"
    result_path = tmp_path / "result.json"
    request_path.write_text(
        json.dumps({"model_name": "whisper-base", "options": {}, "inputs": [{"audio_path": "chunk.wav"}]}),
        encoding="utf-8",
    )

    assert local_task_worker.run_local_task_worker(request_path, result_path) == 0

    heartbeat = json.loads((tmp_path / "heartbeat.json").read_text(encoding="utf-8"))
    assert heartbeat["cpu"] > 0
    assert heartbeat["completed"] in (0, 1)
    assert heartbeat["total"] == 1
    assert json.loads(result_path.read_text(encoding="utf-8"))["status"] == "completed"


@pytest.mark.parametrize(
    ("cuda_available", "mps_available", "expected_device", "accelerated"),
    [
        (True, True, 0, True),
        (False, True, "mps", True),
        (False, False, -1, False),
    ],
)
def test_transformers_device_prefers_cuda_then_mps_then_cpu(
    cuda_available: bool,
    mps_available: bool,
    expected_device: object,
    accelerated: bool,
) -> None:
    from backend.backends.local_asr import _transformers_device

    class Availability:
        def __init__(self, available: bool) -> None:
            self.available = available

        def is_available(self) -> bool:
            return self.available

    fake_torch = SimpleNamespace(
        cuda=Availability(cuda_available),
        backends=SimpleNamespace(mps=Availability(mps_available)),
        float16="float16",
    )

    device, dtype = _transformers_device(fake_torch)

    assert device == expected_device
    assert dtype == ("float16" if accelerated else None)
