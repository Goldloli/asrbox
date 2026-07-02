from __future__ import annotations

import json
import os
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.models import TranscriptSegment, TranscriptionResult


def make_client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.app import create_app

    app = create_app()
    return TestClient(app)


def test_health_reports_ready_and_filesystem(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    health = client.get("/health")
    assert health.status_code == 200
    assert health.json()["status"] == "healthy"
    assert health.json()["port"] == 17494

    filesystem = client.get("/health/filesystem")
    assert filesystem.status_code == 200
    body = filesystem.json()
    assert body["healthy"] is True
    assert {item["label"] for item in body["directories"]} >= {
        "data",
        "uploads",
        "exports",
    }


def test_models_status_includes_whisper_and_chinese_enhanced_models(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/models/status")
    assert response.status_code == 200
    names = {model["model_name"] for model in response.json()["models"]}
    assert {"whisper-base", "faster-whisper-small", "mlx-whisper-turbo", "sensevoice-small"} <= names


def wait_for_model_status(client: TestClient, model_name: str, key: str, value: object) -> dict:
    deadline = time.time() + 3
    last_status = {}
    while time.time() < deadline:
        response = client.get("/models/status")
        assert response.status_code == 200
        last_status = next(model for model in response.json()["models"] if model["model_name"] == model_name)
        if last_status[key] == value:
            return last_status
        time.sleep(0.05)
    raise AssertionError(f"{model_name} never reached {key}={value}; last={last_status}")


def wait_for_task(client: TestClient, task_id: str, predicate, description: str) -> dict:
    deadline = time.time() + 3
    last_task = {}
    while time.time() < deadline:
        response = client.get(f"/tasks/{task_id}")
        assert response.status_code == 200
        last_task = response.json()
        if predicate(last_task):
            return last_task
        time.sleep(0.05)
    raise AssertionError(f"{task_id} never reached {description}; last={last_task}")


def create_downloaded_model(tmp_path: Path, model_name: str, weight_name: str = "model.safetensors") -> Path:
    model_dir = tmp_path / "models" / model_name
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "model.json").write_text("{}", encoding="utf-8")
    (model_dir / weight_name).write_bytes(b"weights")
    return model_dir


def test_huggingface_model_download_uses_snapshot_and_marks_downloaded(tmp_path: Path, monkeypatch) -> None:
    calls: list[tuple[str, Path, tuple[str, ...] | None]] = []

    def fake_download(config, model_dir: Path) -> str:
        calls.append((config.repo_id, model_dir, tuple(config.allow_patterns or [])))
        model_dir.mkdir(parents=True, exist_ok=True)
        (model_dir / "model.safetensors").write_bytes(b"weights")
        return str(model_dir)

    monkeypatch.setattr("backend.services.models._download_huggingface_snapshot", fake_download)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "whisper-base"})
    assert response.status_code == 200
    wait_for_model_status(client, "whisper-base", "downloaded", True)

    assert calls
    assert calls[0][0] == "openai/whisper-base"
    assert calls[0][1] == tmp_path / "models" / "whisper-base"
    assert "*.safetensors" in calls[0][2]
    marker = tmp_path / "models" / "whisper-base" / "model.json"
    assert json.loads(marker.read_text())["snapshot_path"] == str(tmp_path / "models" / "whisper-base")

    second = client.post("/models/download", json={"model_name": "whisper-base"})
    assert second.status_code == 200
    assert len(calls) == 1


def test_modelscope_model_download_uses_modelscope_snapshot(tmp_path: Path, monkeypatch) -> None:
    calls: list[tuple[str, Path]] = []

    def fake_download(config, model_dir: Path) -> str:
        calls.append((config.repo_id, model_dir))
        model_dir.mkdir(parents=True, exist_ok=True)
        (model_dir / "model.pt").write_bytes(b"weights")
        return str(model_dir)

    monkeypatch.setattr("backend.services.models._download_modelscope_snapshot", fake_download)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "sensevoice-small"})
    assert response.status_code == 200
    status = wait_for_model_status(client, "sensevoice-small", "downloaded", True)

    assert status["source"] == "modelscope"
    assert calls == [("iic/SenseVoiceSmall", tmp_path / "models" / "sensevoice-small")]


def test_model_download_error_is_reported_and_delete_clears_cache(tmp_path: Path, monkeypatch) -> None:
    def failing_download(config, model_dir: Path) -> str:
        model_dir.mkdir(parents=True, exist_ok=True)
        (model_dir / "partial.incomplete").write_text("partial")
        raise RuntimeError("network unavailable")

    monkeypatch.setattr("backend.services.models._download_huggingface_snapshot", failing_download)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "whisper-base"})
    assert response.status_code == 200
    status = wait_for_model_status(client, "whisper-base", "error", "network unavailable")
    assert status["downloaded"] is False

    delete = client.delete("/models/whisper-base")
    assert delete.status_code == 200
    status = wait_for_model_status(client, "whisper-base", "downloaded", False)
    assert status["error"] is None


def test_provider_crud_masks_secrets_and_supports_defaults(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    providers = client.get("/providers").json()["items"]
    assert providers[0]["provider_type"] == "bcut"
    assert any(provider["provider_type"] == "aliyun" for provider in providers)

    created = client.post(
        "/providers",
        json={
            "name": "Custom OpenAI",
            "provider_type": "custom",
            "base_url": "https://example.test/v1",
            "api_key": "secret-token",
            "default_model": "whisper-1",
            "enabled": True,
            "options": {"mode": "openai_compatible"},
        },
    )
    assert created.status_code == 200
    body = created.json()
    assert body["api_key_masked"] == "sec...ken"
    assert "api_key" not in body

    provider_id = body["id"]
    updated = client.put(
        f"/providers/{provider_id}",
        json={"enabled": False, "api_key": "new-token"},
    )
    assert updated.status_code == 200
    assert updated.json()["enabled"] is False
    assert updated.json()["api_key_masked"] == "new...ken"

    settings = client.put(
        "/settings/asr",
        json={"default_backend": "provider", "default_provider_id": provider_id},
    )
    assert settings.status_code == 200
    assert settings.json()["default_provider_id"] == provider_id


def test_running_tasks_are_marked_interrupted_on_startup(tmp_path: Path) -> None:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.database.models import TranscriptionTask
    from backend.database import session as db_session
    from backend.services.tasks import mark_interrupted_tasks

    db_session.init_db()
    db = db_session.SessionLocal()
    try:
        db.add(
            TranscriptionTask(
                id="stale-task",
                filename="stale.mp4",
                source="local",
                audio_path="uploads/stale.mp4",
                status="transcribing",
                progress=60,
                model_name="whisper-base",
            )
        )
        db.commit()

        assert mark_interrupted_tasks(db) == 1

        row = db.query(TranscriptionTask).filter(TranscriptionTask.id == "stale-task").one()
        assert row.status == "interrupted"
        assert row.progress == 100
        assert row.error == "Task was interrupted before the server restarted"
    finally:
        db.close()


def test_transcription_task_runs_and_exports_outputs(tmp_path: Path, monkeypatch) -> None:
    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        return TranscriptionResult(
            text="sample local transcript",
            language=options.get("language"),
            duration=1.8,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.8, text="sample local transcript")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1800}))
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    payload = b"fake audio bytes"
    response = client.post(
        "/transcriptions",
        files={"file": ("sample.wav", payload, "audio/wav")},
        data={
            "backend": "local",
            "model_name": "whisper-base",
            "language": "zh",
            "output_formats": json.dumps(["txt", "srt", "json"]),
        },
    )
    assert response.status_code == 200
    task_id = response.json()["id"]
    task = wait_for_task(client, task_id, lambda item: item["status"] == "completed", "completed")
    assert task["status"] == "completed"
    assert task["filename"] == "sample.wav"
    assert task["duration_ms"] == 1800
    assert task["options"]["audio_metadata"]["duration_ms"] == 1800
    assert task["text"]
    assert task["segments"]

    fetched = client.get(f"/tasks/{task_id}")
    assert fetched.status_code == 200
    assert fetched.json()["id"] == task_id

    events = client.get(f"/tasks/{task_id}/events")
    assert events.status_code == 200
    assert "completed" in events.text

    txt_export = client.get(f"/tasks/{task_id}/export/txt")
    assert txt_export.status_code == 200
    assert "sample local transcript" in txt_export.text

    srt_export = client.get(f"/tasks/{task_id}/export/srt")
    assert srt_export.status_code == 200
    assert "00:00:00,000 -->" in srt_export.text

    json_export = client.get(f"/tasks/{task_id}/export/json")
    assert json_export.status_code == 200
    assert json_export.json()["id"] == task_id


def test_bcut_provider_task_uses_provider_result_for_video(tmp_path: Path, monkeypatch) -> None:
    calls: list[tuple[str, dict]] = []

    def fake_transcribe(self, audio_path: str, options: dict) -> TranscriptionResult:
        calls.append((audio_path, options))
        return TranscriptionResult(
            text="真实 provider 转写结果",
            language=options.get("language"),
            duration=3.2,
            provider_id="bcut",
            segments=[
                TranscriptSegment(id=1, start=0.0, end=1.2, text="真实 provider"),
                TranscriptSegment(id=2, start=1.2, end=3.2, text="转写结果"),
            ],
        )

    def fake_prepare(path: Path) -> tuple[Path, dict]:
        target = path.with_suffix(".mp3")
        target.write_bytes(b"mp3")
        return target, {"duration_ms": 3200}

    monkeypatch.setattr("backend.providers.bcut.BcutProvider.transcribe", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", fake_prepare)

    client = make_client(tmp_path)
    response = client.post(
        "/transcriptions",
        files={"file": ("real-video.mp4", b"video", "video/mp4")},
        data={
            "backend": "provider",
            "provider_id": "bcut",
            "language": "zh",
            "output_formats": json.dumps(["txt", "srt"]),
        },
    )

    assert response.status_code == 200
    task = wait_for_task(client, response.json()["id"], lambda item: item["status"] == "completed", "completed")
    assert task["status"] == "completed"
    assert task["text"] == "真实 provider 转写结果"
    assert task["provider_id"] == "bcut"
    assert task["duration_ms"] == 3200
    assert [segment["text"] for segment in task["segments"]] == ["真实 provider", "转写结果"]
    assert calls[0][0].endswith(".mp3")
    assert calls[0][1]["language"] == "zh"


def test_local_model_task_uses_downloaded_model_result(tmp_path: Path, monkeypatch) -> None:
    calls: list[tuple[str, str, dict]] = []

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        calls.append((model_name, audio_path, options))
        return TranscriptionResult(
            text="本地模型真实转写结果",
            language=options.get("language"),
            duration=2.4,
            model_name=model_name,
            segments=[
                TranscriptSegment(id=1, start=0.0, end=1.0, text="本地模型真实"),
                TranscriptSegment(id=2, start=1.0, end=2.4, text="转写结果"),
            ],
        )

    def fake_prepare(path: Path) -> tuple[Path, dict]:
        target = path.with_suffix(".mp3")
        target.write_bytes(b"mp3")
        return target, {"duration_ms": 2400}

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", fake_prepare)

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    response = client.post(
        "/transcriptions",
        files={"file": ("local-video.mp4", b"video", "video/mp4")},
        data={
            "backend": "local",
            "model_name": "whisper-base",
            "language": "zh",
            "output_formats": json.dumps(["txt", "srt"]),
        },
    )

    assert response.status_code == 200
    task = wait_for_task(client, response.json()["id"], lambda item: item["status"] == "completed", "completed")
    assert task["status"] == "completed"
    assert task["text"] == "本地模型真实转写结果"
    assert task["model_name"] == "whisper-base"
    assert task["duration_ms"] == 2400
    assert [segment["text"] for segment in task["segments"]] == ["本地模型真实", "转写结果"]
    assert calls == [
        (
            "whisper-base",
            str(tmp_path / "uploads" / f"{task['id']}.mp3"),
            {"language": "zh", "vad": True, "word_timestamps": False},
        )
    ]


def test_media_preprocess_generates_wav_metadata_and_rejects_unsupported_input(tmp_path: Path, monkeypatch) -> None:
    commands: list[list[str]] = []

    def fake_probe(path: Path) -> dict:
        return {"duration_ms": 12340, "format": "mov,mp4", "audio_codec": "aac"}

    def fake_run(command, capture_output, check, encoding, errors):
        commands.append(command)
        Path(command[-1]).write_bytes(b"wav")

    monkeypatch.setattr("backend.services.media.probe_media", fake_probe)
    monkeypatch.setattr("backend.services.media.subprocess.run", fake_run)
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text="wav transcript",
            duration=12.34,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=12.34, text="wav transcript")],
        ),
    )

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    response = client.post(
        "/transcriptions",
        files={"file": ("clip.mp4", b"video", "video/mp4")},
        data={"backend": "local", "model_name": "whisper-base"},
    )

    assert response.status_code == 200
    task = wait_for_task(client, response.json()["id"], lambda item: item["status"] == "completed", "completed")
    assert task["normalized_audio_path"].endswith(".wav")
    assert task["duration_ms"] == 12340
    assert task["options"]["audio_metadata"]["audio_codec"] == "aac"
    assert commands[0][-2:] == ["-y", str(tmp_path / "uploads" / f"{task['id']}.wav")]

    unsupported = client.post(
        "/transcriptions",
        files={"file": ("notes.txt", b"text", "text/plain")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    failed = wait_for_task(client, unsupported.json()["id"], lambda item: item["status"] == "failed", "failed")
    assert "Unsupported media format" in failed["error"]


def test_local_model_task_returns_before_transcription_finishes_and_advances_progress(
    tmp_path: Path, monkeypatch
) -> None:
    started = threading.Event()
    release = threading.Event()

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        started.set()
        release.wait(timeout=1)
        return TranscriptionResult(
            text="background local transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="background local transcript")],
        )

    def fake_prepare(path: Path) -> tuple[Path, dict]:
        target = path.with_suffix(".mp3")
        target.write_bytes(b"mp3")
        return target, {"duration_ms": 1000}

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", fake_prepare)
    monkeypatch.setattr("backend.services.tasks.LOCAL_PROGRESS_INTERVAL_SECONDS", 0.02)

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    started_at = time.monotonic()
    response = client.post(
        "/transcriptions",
        files={"file": ("long-local-video.mp4", b"video", "video/mp4")},
        data={
            "backend": "local",
            "model_name": "whisper-base",
            "language": "zh",
            "output_formats": json.dumps(["txt"]),
        },
    )
    elapsed = time.monotonic() - started_at

    assert response.status_code == 200
    assert elapsed < 0.2
    task_id = response.json()["id"]
    assert started.wait(timeout=1)

    progressing = wait_for_task(
        client,
        task_id,
        lambda task: task["status"] == "transcribing" and task["progress"] > 60,
        "transcribing progress above 60",
    )
    assert progressing["normalized_audio_path"].endswith(".mp3")

    release.set()
    completed = wait_for_task(client, task_id, lambda task: task["status"] == "completed", "completed")
    assert completed["text"] == "background local transcript"


def test_task_retry_and_cancel_endpoints_are_idempotent(tmp_path: Path, monkeypatch) -> None:
    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        return TranscriptionResult(
            text="retry local transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="retry local transcript")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    response = client.post(
        "/transcriptions",
        files={"file": ("retry.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    task_id = response.json()["id"]

    retry = client.post(f"/tasks/{task_id}/retry")
    assert retry.status_code == 200
    retried = wait_for_task(client, task_id, lambda item: item["status"] == "completed", "completed")
    assert retried["status"] == "completed"

    cancel = client.post(f"/tasks/{task_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] in {"completed", "cancelled"}


def test_local_asr_backend_dispatches_transformers_and_faster_whisper(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import transcribe_local
    from backend.backends.registry import get_model_config

    calls: list[tuple[str, str, dict]] = []

    class FakeBackend:
        def transcribe(self, audio_path: str, model_config, options: dict) -> TranscriptionResult:
            calls.append((model_config.engine, audio_path, options))
            return TranscriptionResult(
                text=f"{model_config.engine} result",
                duration=1.0,
                model_name=model_config.model_name,
                segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="ok")],
            )

        def is_loaded(self, model_name: str) -> bool:
            return False

        def unload(self, model_name: str) -> bool:
            return False

    monkeypatch.setattr("backend.backends.local_asr._backends", {"whisper_transformers": FakeBackend(), "faster_whisper": FakeBackend()})

    whisper = transcribe_local("audio.wav", get_model_config("whisper-base"), {"language": "zh"})
    faster = transcribe_local("audio.wav", get_model_config("faster-whisper-small"), {"word_timestamps": True})

    assert whisper.text == "whisper_transformers result"
    assert faster.text == "faster_whisper result"
    assert calls == [
        ("whisper_transformers", "audio.wav", {"language": "zh"}),
        ("faster_whisper", "audio.wav", {"word_timestamps": True}),
    ]


def test_faster_whisper_backend_maps_segments_and_words(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import FasterWhisperBackend
    from backend.backends.registry import get_model_config

    created: list[tuple[str, str, str]] = []

    class Word:
        start = 0.1
        end = 0.3
        word = "你"
        probability = 0.9

    class Segment:
        id = 7
        start = 0.0
        end = 1.2
        text = "你好"
        avg_logprob = -0.2
        words = [Word()]

    class FakeWhisperModel:
        def __init__(self, model_path, device, compute_type):
            created.append((model_path, device, compute_type))

        def transcribe(self, audio_path, **kwargs):
            return [Segment()], type("Info", (), {"language": "zh", "duration": 1.2})()

    monkeypatch.setattr("backend.backends.local_asr.WhisperModel", FakeWhisperModel)
    monkeypatch.setattr("backend.backends.local_asr._faster_whisper_device", lambda: ("cpu", "int8"))

    model_dir = create_downloaded_model(tmp_path, "faster-whisper-small", "model.bin")
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))

    result = FasterWhisperBackend().transcribe(
        "audio.wav",
        get_model_config("faster-whisper-small"),
        {"language": "auto", "vad": True, "word_timestamps": True},
    )

    assert created == [(str(model_dir), "cpu", "int8")]
    assert result.text == "你好"
    assert result.language == "zh"
    assert result.duration == 1.2
    assert result.segments[0].confidence == -0.2
    assert result.words == [{"start": 0.1, "end": 0.3, "word": "你", "probability": 0.9}]


def test_local_queue_limits_concurrency_and_cancelled_queued_task_does_not_run(tmp_path: Path, monkeypatch) -> None:
    started: list[str] = []
    release = threading.Event()

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        task_id = Path(audio_path).stem
        started.append(task_id)
        release.wait(timeout=1)
        return TranscriptionResult(
            text=f"{task_id} done",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text=f"{task_id} done")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))

    client = make_client(tmp_path)
    client.put("/settings/asr", json={"max_concurrent_local_tasks": 1})
    create_downloaded_model(tmp_path, "whisper-base")

    first = client.post("/transcriptions", files={"file": ("one.wav", b"1", "audio/wav")}, data={"backend": "local", "model_name": "whisper-base"}).json()
    second = client.post("/transcriptions", files={"file": ("two.wav", b"2", "audio/wav")}, data={"backend": "local", "model_name": "whisper-base"}).json()

    wait_for_task(client, first["id"], lambda item: item["status"] == "transcribing", "first running")
    assert started == [first["id"]]

    cancelled = client.post(f"/tasks/{second['id']}/cancel")
    assert cancelled.status_code == 200
    assert cancelled.json()["status"] == "cancelled"

    release.set()
    wait_for_task(client, first["id"], lambda item: item["status"] == "completed", "first completed")
    time.sleep(0.1)
    assert started == [first["id"]]
    assert client.get(f"/tasks/{second['id']}").json()["status"] == "cancelled"


def test_cancel_running_task_prevents_completed_result(tmp_path: Path, monkeypatch) -> None:
    started = threading.Event()
    release = threading.Event()

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        started.set()
        release.wait(timeout=1)
        return TranscriptionResult(
            text="should not persist",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="should not persist")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    response = client.post("/transcriptions", files={"file": ("run.wav", b"1", "audio/wav")}, data={"backend": "local", "model_name": "whisper-base"}).json()
    assert started.wait(timeout=1)
    cancelled = client.post(f"/tasks/{response['id']}/cancel")
    assert cancelled.status_code == 200
    release.set()
    task = wait_for_task(client, response["id"], lambda item: item["status"] == "cancelled", "cancelled")
    assert task["text"] is None
    assert task["segments"] == []


def test_retranscribe_resets_task_and_runs_again(tmp_path: Path, monkeypatch) -> None:
    calls: list[str] = []

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        calls.append(model_name)
        return TranscriptionResult(
            text=f"{model_name} transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text=f"{model_name} transcript")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    create_downloaded_model(tmp_path, "faster-whisper-small", "model.bin")
    original = client.post("/transcriptions", files={"file": ("again.wav", b"1", "audio/wav")}, data={"backend": "local", "model_name": "whisper-base"}).json()
    wait_for_task(client, original["id"], lambda item: item["status"] == "completed", "completed")

    response = client.post(f"/tasks/{original['id']}/retranscribe", json={"model_name": "faster-whisper-small", "language": "en"})
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    rerun = wait_for_task(client, original["id"], lambda item: item["status"] == "completed" and item["model_name"] == "faster-whisper-small", "rerun completed")
    assert rerun["text"] == "faster-whisper-small transcript"
    assert rerun["language"] == "en"
    assert calls == ["whisper-base", "faster-whisper-small"]


def test_transcription_readiness_reports_local_and_provider_state(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    missing = client.get("/transcriptions/readiness")
    assert missing.status_code == 200
    assert missing.json()["ready"] is False
    assert missing.json()["model"]["model_name"] == "whisper-base"

    create_downloaded_model(tmp_path, "whisper-base")
    ready = client.get("/transcriptions/readiness").json()
    assert ready["backend"] == "local"
    assert ready["ready"] is True

    providers = client.get("/providers").json()["items"]
    aliyun_id = next(item["id"] for item in providers if item["provider_type"] == "aliyun")
    client.put("/settings/asr", json={"default_backend": "provider", "default_provider_id": aliyun_id})
    provider = client.get("/transcriptions/readiness").json()
    assert provider["backend"] == "provider"
    assert provider["ready"] is False
    assert provider["provider"]["id"] == aliyun_id
