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
