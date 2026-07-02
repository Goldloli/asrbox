from __future__ import annotations

import json
import os
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


def test_transcription_task_runs_and_exports_outputs(tmp_path: Path, monkeypatch) -> None:
    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        return TranscriptionResult(
            text="sample local transcript",
            language=options.get("language"),
            duration=1.8,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.8, text="sample local transcript")],
        )

    def fake_normalize(path: Path) -> Path:
        return path

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.normalize_media_for_asr", fake_normalize)
    client = make_client(tmp_path)
    model_dir = tmp_path / "models" / "whisper-base"
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text("{}")
    (model_dir / "model.safetensors").write_bytes(b"weights")

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
    task = response.json()
    assert task["status"] == "completed"
    assert task["filename"] == "sample.wav"
    assert task["text"]
    assert task["segments"]

    task_id = task["id"]
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

    def fake_normalize(path: Path) -> Path:
        target = path.with_suffix(".mp3")
        target.write_bytes(b"mp3")
        return target

    monkeypatch.setattr("backend.providers.bcut.BcutProvider.transcribe", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.normalize_media_for_asr", fake_normalize)

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
    task = response.json()
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

    def fake_normalize(path: Path) -> Path:
        target = path.with_suffix(".mp3")
        target.write_bytes(b"mp3")
        return target

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.normalize_media_for_asr", fake_normalize)

    client = make_client(tmp_path)
    model_dir = tmp_path / "models" / "whisper-base"
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text("{}")
    (model_dir / "model.safetensors").write_bytes(b"weights")

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
    task = response.json()
    assert task["status"] == "completed"
    assert task["text"] == "本地模型真实转写结果"
    assert task["model_name"] == "whisper-base"
    assert task["duration_ms"] == 2400
    assert [segment["text"] for segment in task["segments"]] == ["本地模型真实", "转写结果"]
    assert calls == [("whisper-base", str(tmp_path / "uploads" / f"{task['id']}.mp3"), {"language": "zh"})]


def test_task_retry_and_cancel_endpoints_are_idempotent(tmp_path: Path, monkeypatch) -> None:
    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        return TranscriptionResult(
            text="retry local transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="retry local transcript")],
        )

    def fake_normalize(path: Path) -> Path:
        return path

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.normalize_media_for_asr", fake_normalize)
    client = make_client(tmp_path)
    model_dir = tmp_path / "models" / "whisper-base"
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text("{}")
    (model_dir / "model.safetensors").write_bytes(b"weights")
    response = client.post(
        "/transcriptions",
        files={"file": ("retry.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    task_id = response.json()["id"]

    retry = client.post(f"/tasks/{task_id}/retry")
    assert retry.status_code == 200
    assert retry.json()["status"] == "completed"

    cancel = client.post(f"/tasks/{task_id}/cancel")
    assert cancel.status_code == 200
    assert cancel.json()["status"] in {"completed", "cancelled"}
