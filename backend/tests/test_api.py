from __future__ import annotations

import json
import os
import threading
import time
import zipfile
from pathlib import Path

import pytest
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


def test_health_allows_tauri_origin(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/health", headers={"Origin": "tauri://localhost"})

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "tauri://localhost"


def test_health_rejects_opaque_null_origin(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/health", headers={"Origin": "null"})

    assert response.status_code == 200
    assert "access-control-allow-origin" not in response.headers


@pytest.mark.parametrize(
    ("data", "expected_detail"),
    [
        ({"backend": "demo"}, "Unsupported transcription backend"),
        ({"backend": "local"}, "Local transcription requires a model"),
        ({"backend": "local", "model_name": "missing-model"}, "Unknown local model"),
        ({"backend": "provider"}, "Provider transcription requires a provider"),
        ({"backend": "provider", "provider_id": "missing-provider"}, "Provider is not configured"),
    ],
)
def test_transcription_rejects_invalid_backend_selection_before_saving_upload(
    tmp_path: Path,
    data: dict[str, str],
    expected_detail: str,
) -> None:
    client = make_client(tmp_path)

    response = client.post(
        "/transcriptions",
        files={"file": ("invalid.wav", b"audio", "audio/wav")},
        data=data,
    )

    assert response.status_code == 422
    assert expected_detail in response.json()["detail"]
    assert client.get("/tasks").json()["total"] == 0
    assert list((tmp_path / "uploads").glob("*")) == []


def test_transcription_rejects_disabled_provider_before_saving_upload(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    provider = client.post(
        "/providers",
        json={
            "name": "Disabled provider",
            "provider_type": "custom",
            "base_url": "https://asr.example.test",
            "enabled": False,
        },
    ).json()

    response = client.post(
        "/transcriptions",
        files={"file": ("invalid.wav", b"audio", "audio/wav")},
        data={"backend": "provider", "provider_id": provider["id"]},
    )

    assert response.status_code == 422
    assert "Provider is disabled" in response.json()["detail"]
    assert client.get("/tasks").json()["total"] == 0
    assert list((tmp_path / "uploads").glob("*")) == []


def test_models_status_includes_whisper_and_chinese_enhanced_models(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/models/status")
    assert response.status_code == 200
    names = {model["model_name"] for model in response.json()["models"]}
    assert {
        "whisper-base",
        "whisper-small",
        "whisper-medium",
        "whisper-large-v3",
        "whisper-large-v3-turbo",
        "faster-whisper-base",
        "faster-whisper-small",
        "faster-whisper-medium",
        "faster-whisper-large-v3",
        "faster-whisper-large-v3-turbo",
        "qwen3-asr-0.6b",
        "qwen3-asr-1.7b",
        "mlx-whisper-turbo",
        "sensevoice-small",
    } <= names
    by_name = {model["model_name"]: model for model in response.json()["models"]}
    assert by_name["qwen3-asr-1.7b"]["preferred_source"] == "modelscope"
    assert by_name["qwen3-asr-1.7b"]["source"] == "modelscope"
    assert by_name["qwen3-asr-1.7b"]["source_candidates"][0]["source"] == "modelscope"
    assert by_name["qwen3-asr-1.7b"]["source_candidates"][0]["repo_id"] == "Qwen/Qwen3-ASR-1.7B-hf"
    assert by_name["mlx-whisper-turbo"]["preferred_source"] == "modelscope"


def test_runtime_status_reports_backend_capabilities(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/runtime/status")
    assert response.status_code == 200
    body = response.json()
    assert body["python_version"]
    assert body["data_dir"] == str(tmp_path)
    assert body["models_dir"] == str(tmp_path / "models")
    assert "ffmpeg_available" in body
    assert body["ffmpeg_source"] in {"manual", "bundled", "system", "missing"}
    assert body["ffprobe_source"] in {"manual", "bundled", "system", "missing"}
    assert "ffmpeg_path" in body
    assert "ffprobe_path" in body
    assert "ffmpeg_version" in body
    assert "ffprobe_version" in body
    assert "ffmpeg_error" in body
    assert "ffprobe_error" in body
    assert "faster_whisper_available" in body
    assert "funasr_available" in body
    assert "torchaudio_available" in body
    assert "qwen3_asr_available" in body
    assert "transformers_qwen3_asr_available" in body


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
    if model_name.startswith("sensevoice"):
        (model_dir / "config.yaml").write_text("model: sensevoice", encoding="utf-8")
        (model_dir / "model.pt").write_bytes(b"weights")
        (model_dir / "am.mvn").write_bytes(b"mvn")
    else:
        (model_dir / "config.json").write_text("{}", encoding="utf-8")
        (model_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
        (model_dir / "preprocessor_config.json").write_text("{}", encoding="utf-8")
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
    marker_body = json.loads(marker.read_text())
    assert marker_body["snapshot_path"] == str(tmp_path / "models" / "whisper-base")
    assert marker_body["installed_at"]
    assert marker_body["size_on_disk_mb"] > 0

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
    assert status["installed_source"] == "modelscope"
    assert status["installed_repo_id"] == "iic/SenseVoiceSmall"


def test_model_download_falls_back_to_next_source_candidate(tmp_path: Path, monkeypatch) -> None:
    calls: list[tuple[str, str]] = []

    def failing_modelscope(config, model_dir: Path) -> str:
        calls.append((config.source, config.repo_id or ""))
        raise RuntimeError("modelscope unavailable")

    def successful_huggingface(config, model_dir: Path) -> str:
        calls.append((config.source, config.repo_id or ""))
        model_dir.mkdir(parents=True, exist_ok=True)
        (model_dir / "model.safetensors").write_bytes(b"weights")
        (model_dir / "config.json").write_text("{}", encoding="utf-8")
        (model_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
        (model_dir / "processor_config.json").write_text("{}", encoding="utf-8")
        return str(model_dir)

    monkeypatch.setattr("backend.services.models._download_modelscope_snapshot", failing_modelscope)
    monkeypatch.setattr("backend.services.models._download_huggingface_snapshot", successful_huggingface)
    monkeypatch.setattr("backend.services.models.qwen3_asr_available", lambda: True)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "qwen3-asr-1.7b"})
    assert response.status_code == 200
    status = wait_for_model_status(client, "qwen3-asr-1.7b", "downloaded", True)

    assert calls == [
        ("modelscope", "Qwen/Qwen3-ASR-1.7B-hf"),
        ("huggingface", "Qwen/Qwen3-ASR-1.7B-hf"),
    ]
    assert status["installed_source"] == "huggingface"
    assert status["installed_repo_id"] == "Qwen/Qwen3-ASR-1.7B-hf"
    progress = client.get("/models/active-downloads")
    assert progress.status_code == 200


def test_model_download_reports_intermediate_directory_progress(tmp_path: Path, monkeypatch) -> None:
    def fake_download(config, model_dir: Path) -> str:
        model_dir.mkdir(parents=True, exist_ok=True)
        for index in range(3):
            (model_dir / f"chunk-{index}.pt").write_bytes(b"x" * 1024 * 1024)
            time.sleep(0.04)
        return str(model_dir)

    monkeypatch.setattr("backend.services.models._download_modelscope_snapshot", fake_download)
    monkeypatch.setattr("backend.services.models.DOWNLOAD_PROGRESS_POLL_SECONDS", 0.01)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "sensevoice-small"})
    assert response.status_code == 200

    from backend.utils.progress import get_progress_manager

    deadline = time.time() + 3
    intermediate = None
    while time.time() < deadline:
        progress = get_progress_manager().get_progress("sensevoice-small")
        if progress and progress["status"] == "downloading" and 0 < progress["progress"] < 100:
            intermediate = progress
            break
        time.sleep(0.01)

    assert intermediate is not None
    assert intermediate["current"] > 0
    assert intermediate["total"] > intermediate["current"]
    wait_for_model_status(client, "sensevoice-small", "downloaded", True)


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


def test_model_compatibility_verify_and_recommendation(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    incomplete = tmp_path / "models" / "faster-whisper-small"
    incomplete.mkdir(parents=True)
    (incomplete / "model.json").write_text("{}", encoding="utf-8")
    (incomplete / "model.bin").write_bytes(b"weights")

    compatibility = client.get("/models/faster-whisper-small/compatibility")
    assert compatibility.status_code == 200
    assert compatibility.json()["compatible"] is False
    assert "tokenizer" in compatibility.json()["missing"]

    verified = client.post("/models/verify")
    assert verified.status_code == 200
    assert any(item["model_name"] == "faster-whisper-small" for item in verified.json())

    recommendation = client.post("/models/recommend", json={"language": "zh", "duration_ms": 120000})
    assert recommendation.status_code == 200
    assert recommendation.json()["model_name"] in {"qwen3-asr-0.6b", "sensevoice-small", "mlx-whisper-turbo", "faster-whisper-small", "whisper-base"}


def test_qwen3_asr_compatibility_requires_processor_and_transformers_support(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path)
    model_dir = create_downloaded_model(tmp_path, "qwen3-asr-0.6b")
    (model_dir / "preprocessor_config.json").unlink()

    missing = client.get("/models/qwen3-asr-0.6b/compatibility").json()
    assert missing["compatible"] is False
    assert "processor/chat_template" in missing["missing"]

    (model_dir / "processor_config.json").write_text("{}", encoding="utf-8")
    monkeypatch.setattr("backend.services.models.qwen3_asr_available", lambda: True)
    compatible = client.get("/models/qwen3-asr-0.6b/compatibility").json()
    assert compatible["compatible"] is True


def test_funasr_compatibility_reports_missing_runtime_dependencies(tmp_path: Path, monkeypatch) -> None:
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "sensevoice-small")
    monkeypatch.setattr("backend.services.models.torchaudio_available", lambda: False)
    monkeypatch.setattr("backend.services.models.funasr_available", lambda: False)

    response = client.get("/models/sensevoice-small/compatibility")
    assert response.status_code == 200
    body = response.json()
    assert body["compatible"] is False
    assert "torchaudio runtime" in body["missing"]
    assert "funasr runtime" in body["missing"]


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


def test_settings_can_store_and_clear_ffmpeg_paths(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    updated = client.put("/settings/asr", json={"ffmpeg_path": "/tmp/ffmpeg", "ffprobe_path": "/tmp/ffprobe"})
    assert updated.status_code == 200
    assert updated.json()["ffmpeg_path"] == "/tmp/ffmpeg"
    assert updated.json()["ffprobe_path"] == "/tmp/ffprobe"

    cleared = client.put("/settings/asr", json={"ffmpeg_path": None, "ffprobe_path": None})
    assert cleared.status_code == 200
    assert cleared.json()["ffmpeg_path"] is None
    assert cleared.json()["ffprobe_path"] is None


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
        assert row.error_code == "TASK_INTERRUPTED"
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
    assert json_export.json()["version_id"] is not None

    versions = client.get(f"/tasks/{task_id}/versions")
    assert versions.status_code == 200
    assert versions.json()[0]["version_type"] == "transcribe"


def test_clear_tasks_deletes_task_list(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text="transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="transcript")],
        ),
    )
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    for filename in ("one.wav", "two.wav"):
        response = client.post(
            "/transcriptions",
            files={"file": (filename, b"audio", "audio/wav")},
            data={"backend": "local", "model_name": "whisper-base"},
        )
        assert response.status_code == 200
        wait_for_task(client, response.json()["id"], lambda item: item["status"] == "completed", "completed")

    assert client.get("/tasks").json()["total"] == 2
    cleared = client.delete("/tasks")

    assert cleared.status_code == 200
    assert cleared.json()["deleted"] == 2
    assert client.get("/tasks").json() == {"items": [], "total": 0}


def test_failed_task_records_error_code_and_diagnostics(tmp_path: Path, monkeypatch) -> None:
    from backend.services.errors import ASRboxError

    monkeypatch.setattr(
        "backend.services.tasks.prepare_media_for_asr",
        lambda path: (_ for _ in ()).throw(ASRboxError("NO_AUDIO_STREAM", "no audio", stage="preprocessing")),
    )
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    created = client.post(
        "/transcriptions",
        files={"file": ("silent.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    ).json()
    failed = wait_for_task(client, created["id"], lambda row: row["status"] == "failed", "failed")
    assert failed["error_code"] == "NO_AUDIO_STREAM"
    assert failed["options"]["error_code"] == "NO_AUDIO_STREAM"

    diagnostics = client.get(f"/tasks/{created['id']}/diagnostics")
    assert diagnostics.status_code == 200
    assert diagnostics.json()[0]["error_code"] == "NO_AUDIO_STREAM"

    codes = client.get("/diagnostics/error-codes")
    assert codes.status_code == 200
    assert any(item["code"] == "NO_AUDIO_STREAM" for item in codes.json()["items"])


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


def test_funasr_backend_cleans_sensevoice_tags_and_maps_segments(monkeypatch) -> None:
    from backend.backends.local_asr import FunASRBackend
    from backend.backends.registry import get_model_config

    created: list[dict] = []
    generated: list[dict] = []

    class FakeAutoModel:
        def __init__(self, **kwargs):
            created.append(kwargs)

        def generate(self, **kwargs):
            generated.append(kwargs)
            return [
                {
                    "text": "<|zh|><|NEUTRAL|>你好 世界",
                    "sentence_info": [
                        {"start": 0, "end": 1200, "text": "<|zh|>你好"},
                        {"start": 1200, "end": 2300, "text": "<|HAPPY|>世界"},
                    ],
                }
            ]

    monkeypatch.setattr("backend.backends.local_asr.AutoModel", FakeAutoModel)

    result = FunASRBackend().transcribe("audio.wav", get_model_config("sensevoice-small"), {"language": "yue"})

    assert created[0]["disable_update"] is True
    assert generated[0]["language"] == "yue"
    assert result.text == "你好 世界"
    assert [segment.text for segment in result.segments] == ["你好", "世界"]
    assert result.segments[1].end == 2.3
    assert result.raw_result_summary["items"] == 1


def test_qwen3_asr_backend_uses_processor_and_maps_transcription(tmp_path: Path, monkeypatch) -> None:
    from backend.backends.local_asr import Qwen3ASRBackend
    from backend.backends.registry import get_model_config

    model_dir = create_downloaded_model(tmp_path, "qwen3-asr-0.6b")
    (model_dir / "processor_config.json").write_text("{}", encoding="utf-8")
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))

    calls: list[tuple[str, dict]] = []

    class FakeInputs(dict):
        def __init__(self):
            super().__init__({"input_ids": type("Ids", (), {"shape": (1, 3)})()})

        def to(self, *args):
            calls.append(("to", {"args": args}))
            return self

    class FakeProcessor:
        @classmethod
        def from_pretrained(cls, path):
            calls.append(("processor", {"path": path}))
            return cls()

        def apply_transcription_request(self, **kwargs):
            calls.append(("request", kwargs))
            return FakeInputs()

        def decode(self, generated_ids, return_format=None):
            calls.append(("decode", {"return_format": return_format}))
            if return_format == "parsed":
                return [{"language": "Chinese", "transcription": "你好 Qwen"}]
            return ["你好 Qwen"]

    class FakeModel:
        device = "cpu"
        dtype = "float32"

        @classmethod
        def from_pretrained(cls, path, **kwargs):
            calls.append(("model", {"path": path, **kwargs}))
            return cls()

        def generate(self, **kwargs):
            calls.append(("generate", kwargs))

            class Output:
                def __getitem__(self, _key):
                    return self

            return Output()

    monkeypatch.setattr("transformers.AutoProcessor", FakeProcessor)
    monkeypatch.setattr("transformers.AutoModelForMultimodalLM", FakeModel, raising=False)

    result = Qwen3ASRBackend().transcribe(
        "audio.wav",
        get_model_config("qwen3-asr-0.6b"),
        {"language": "zh"},
    )

    assert result.text == "你好 Qwen"
    assert result.language == "Chinese"
    assert result.segments[0].text == "你好 Qwen"
    assert ("request", {"audio": "audio.wav", "language": "zh"}) in calls


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
    before_versions = client.get(f"/tasks/{original['id']}/versions").json()
    assert [item["version_type"] for item in before_versions] == ["transcribe"]

    response = client.post(f"/tasks/{original['id']}/retranscribe", json={"model_name": "faster-whisper-small", "language": "en"})
    assert response.status_code == 200
    assert response.json()["status"] == "queued"
    rerun = wait_for_task(client, original["id"], lambda item: item["status"] == "completed" and item["model_name"] == "faster-whisper-small", "rerun completed")
    assert rerun["text"] == "faster-whisper-small transcript"
    assert rerun["language"] == "en"
    assert calls == ["whisper-base", "faster-whisper-small"]
    after_versions = client.get(f"/tasks/{original['id']}/versions").json()
    assert [item["version_type"] for item in after_versions] == ["retranscribe", "transcribe"]


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


def test_batch_transcriptions_and_active_tasks_endpoint(tmp_path: Path, monkeypatch) -> None:
    release = threading.Event()

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        release.wait(timeout=1)
        return TranscriptionResult(
            text=f"{Path(audio_path).stem} transcript",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="batch transcript")],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    response = client.post(
        "/transcriptions/batch",
        files=[
            ("files", ("one.wav", b"1", "audio/wav")),
            ("files", ("two.wav", b"2", "audio/wav")),
        ],
        data={"backend": "local", "model_name": "whisper-base", "word_timestamps": "true"},
    )
    assert response.status_code == 200
    body = response.json()
    assert body["total"] == 2
    assert body["failures"] == []

    active = client.get("/tasks/active")
    assert active.status_code == 200
    assert active.json()["local_worker_count"] >= 1
    assert active.json()["queued_tasks"] or active.json()["running_tasks"]

    release.set()
    for item in body["items"]:
        task = wait_for_task(client, item["id"], lambda row: row["status"] == "completed", "batch completed")
        assert task["options"]["word_timestamps"] is True


def test_long_audio_uses_chunk_pipeline_and_offsets_segments(tmp_path: Path, monkeypatch) -> None:
    calls: list[str] = []

    def fake_split(audio_path: Path, output_dir: Path, duration_ms: int, *, window_ms: int, overlap_ms: int):
        first = output_dir / "chunk-0001.wav"
        second = output_dir / "chunk-0002.wav"
        first.parent.mkdir(parents=True, exist_ok=True)
        first.write_bytes(b"1")
        second.write_bytes(b"2")
        return [(first, 0, 600000), (second, 595000, 1200000)]

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        calls.append(Path(audio_path).name)
        return TranscriptionResult(
            text=Path(audio_path).stem,
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text=Path(audio_path).stem)],
        )

    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 31 * 60 * 1000}))
    monkeypatch.setattr("backend.services.tasks.split_audio_chunks", fake_split)
    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)

    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    created = client.post(
        "/transcriptions",
        files={"file": ("long.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    ).json()
    task = wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "chunk completed")

    assert calls == ["chunk-0001.wav", "chunk-0002.wav"]
    assert [segment["text"] for segment in task["segments"]] == ["chunk-0001", "chunk-0002"]
    assert task["segments"][1]["start"] == 595.0


def test_task_postprocess_updates_segments_and_exports_speaker_prefix(tmp_path: Path, monkeypatch) -> None:
    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        return TranscriptionResult(
            text="hello,,,, world",
            duration=2.0,
            model_name=model_name,
            segments=[
                TranscriptSegment(id=1, start=0.0, end=0.2, text="hello,,,,", speaker="SPEAKER_00"),
                TranscriptSegment(id=2, start=0.2, end=0.4, text="world", speaker="SPEAKER_00"),
            ],
        )

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 2000}))
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    created = client.post(
        "/transcriptions",
        files={"file": ("post.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    ).json()
    wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "completed")

    processed = client.post(
        f"/tasks/{created['id']}/postprocess",
        json={"mode": "aggressive", "max_chars_per_line": 12, "merge_short_segments": True},
    )
    assert processed.status_code == 200
    assert processed.json()["segments"][0]["text"] == "hello, world"

    exported = client.get(f"/tasks/{created['id']}/export/txt")
    assert "[SPEAKER_00] hello, world" in exported.text


def test_segment_editing_creates_versions_and_can_restore(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text="first second",
            duration=2.0,
            model_name=model_name,
            segments=[
                TranscriptSegment(id=1, start=0.0, end=1.0, text="first"),
                TranscriptSegment(id=2, start=1.0, end=2.0, text="second"),
            ],
        ),
    )
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 2000}))
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    created = client.post(
        "/transcriptions",
        files={"file": ("edit.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    ).json()
    task = wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "completed")
    original_version_id = client.get(f"/tasks/{task['id']}/versions").json()[0]["id"]

    updated = client.patch(f"/tasks/{task['id']}/segments/1", json={"text": "changed"})
    assert updated.status_code == 200
    assert updated.json()["segments"][0]["text"] == "changed"

    merged = client.post(f"/tasks/{task['id']}/segments/merge", json={"segment_ids": [1, 2]})
    assert merged.status_code == 200
    assert len(merged.json()["segments"]) == 1

    restored = client.post(f"/tasks/{task['id']}/versions/{original_version_id}/restore")
    assert restored.status_code == 200
    assert [segment["text"] for segment in restored.json()["segments"]] == ["first", "second"]
    version_types = [item["version_type"] for item in client.get(f"/tasks/{task['id']}/versions").json()]
    assert version_types[:4] == ["restore", "edit", "edit", "transcribe"]


def test_preflight_and_storage_usage_endpoints(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr(
        "backend.routes.transcriptions.preflight_media",
        lambda path: {
            "supported_format": True,
            "has_audio_stream": True,
            "duration_ms": 61000,
            "audio_codec": "pcm_s16le",
            "sample_rate": 16000,
            "channels": 1,
            "peak_volume_db": -6.0,
            "mean_volume_db": -18.0,
            "near_silence": False,
            "needs_normalization": False,
            "will_chunk": False,
            "chunk_count": 1,
            "warnings": [],
        },
    )
    client = make_client(tmp_path)

    preflight = client.post("/transcriptions/preflight", files={"file": ("check.wav", b"audio", "audio/wav")})
    assert preflight.status_code == 200
    assert preflight.json()["has_audio_stream"] is True
    assert preflight.json()["readiness"]["backend"] == "local"

    usage = client.get("/storage/usage")
    assert usage.status_code == 200
    assert "uploads_mb" in usage.json()

    cleanup = client.post("/storage/cleanup", json={"delete_normalized": True, "delete_chunks": True})
    assert cleanup.status_code == 200
    assert "removed" in cleanup.json()


def test_model_storage_cleanup_and_cancel_download(tmp_path: Path, monkeypatch) -> None:
    release = threading.Event()

    def fake_download(config, model_dir: Path) -> str:
        model_dir.mkdir(parents=True, exist_ok=True)
        (model_dir / "partial.incomplete").write_text("partial")
        release.wait(timeout=1)
        (model_dir / "model.bin").write_bytes(b"weights")
        return str(model_dir)

    monkeypatch.setattr("backend.services.models._download_huggingface_snapshot", fake_download)
    client = make_client(tmp_path)

    response = client.post("/models/download", json={"model_name": "whisper-small"})
    assert response.status_code == 200
    active = client.get("/models/active-downloads").json()
    assert any(item["model_name"] == "whisper-small" for item in active)

    cancel = client.post("/models/whisper-small/cancel-download")
    assert cancel.status_code == 200
    release.set()
    time.sleep(0.1)
    assert not (tmp_path / "models" / "whisper-small" / "model.json").exists()

    storage = client.get("/models/storage")
    assert storage.status_code == 200
    assert any(item["model_name"] == "whisper-small" for item in storage.json()["models"])

    cleanup = client.post("/models/cleanup-incomplete")
    assert cleanup.status_code == 200
    assert "whisper-small" in cleanup.json()["removed"]


def test_model_migrate_can_import_from_source_directory(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    source = tmp_path / "old-models"
    old_model = source / "whisper-base"
    old_model.mkdir(parents=True)
    (old_model / "model.json").write_text("{}", encoding="utf-8")
    (old_model / "model.safetensors").write_bytes(b"weights")

    response = client.post("/models/migrate", json={"source": str(source)})

    assert response.status_code == 200
    assert response.json()["moved"] == 1
    assert (tmp_path / "models" / "whisper-base" / "model.json").exists()
    assert wait_for_model_status(client, "whisper-base", "downloaded", True)["downloaded"] is True


def test_openai_compatible_provider_transcribes_and_masks_option_secrets(tmp_path: Path, monkeypatch) -> None:
    posted: list[dict] = []

    class FakeResponse:
        status_code = 200
        text = "{}"

        def json(self):
            return {"text": "provider text", "segments": [{"start": 0, "end": 1.5, "text": "provider text"}]}

    def fake_post(url, headers, files, data, timeout):
        posted.append({"url": url, "headers": headers, "data": data})
        return FakeResponse()

    monkeypatch.setattr("backend.providers.http_providers.requests.post", fake_post)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1500}))

    client = make_client(tmp_path)
    provider = client.post(
        "/providers",
        json={
            "name": "Compatible",
            "provider_type": "openai_compatible",
            "base_url": "https://asr.example/v1",
            "api_key": "secret-token",
            "default_model": "whisper-1",
            "enabled": True,
            "options": {"access_key_secret": "hidden-secret"},
        },
    ).json()
    listed = next(item for item in client.get("/providers").json()["items"] if item["id"] == provider["id"])
    assert listed["options"]["access_key_secret"] == "hid...ret"

    created = client.post(
        "/transcriptions",
        files={"file": ("remote.wav", b"audio", "audio/wav")},
        data={"backend": "provider", "provider_id": provider["id"], "language": "zh"},
    ).json()
    task = wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "provider completed")
    assert task["text"] == "provider text"
    assert posted[0]["url"] == "https://asr.example/v1/audio/transcriptions"
    assert posted[0]["headers"]["Authorization"] == "Bearer secret-token"
    assert posted[0]["data"]["language"] == "zh"


def test_aliyun_provider_supports_submit_and_poll_flow(tmp_path: Path, monkeypatch) -> None:
    posted: list[str] = []
    polled: list[dict] = []

    class SubmitResponse:
        status_code = 200
        text = "{}"

        def json(self):
            return {"task_id": "task-1"}

    class PollResponse:
        status_code = 200
        text = "{}"

        def json(self):
            return {"status": "completed", "text": "aliyun text", "segments": [{"start": 0, "end": 900, "text": "aliyun text"}]}

    def fake_post(url, headers, files, data, timeout):
        posted.append(url)
        return SubmitResponse()

    def fake_get(url, headers, params, timeout):
        polled.append({"url": url, "params": params})
        return PollResponse()

    monkeypatch.setattr("backend.providers.http_providers.requests.post", fake_post)
    monkeypatch.setattr("backend.providers.http_providers.requests.get", fake_get)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 900}))

    client = make_client(tmp_path)
    client.put(
        "/providers/aliyun",
        json={
            "enabled": True,
            "base_url": "https://aliyun.example/submit",
            "default_model": "paraformer-v2",
            "options": {
                "app_key": "app",
                "access_key_id": "id",
                "access_key_secret": "secret",
                "result_url": "https://aliyun.example/result",
                "poll_interval_seconds": 0,
            },
        },
    )
    created = client.post(
        "/transcriptions",
        files={"file": ("aliyun.wav", b"audio", "audio/wav")},
        data={"backend": "provider", "provider_id": "aliyun"},
    ).json()
    task = wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "aliyun completed")

    assert task["text"] == "aliyun text"
    assert posted == ["https://aliyun.example/submit"]
    assert polled == [{"url": "https://aliyun.example/result", "params": {"task_id": "task-1"}}]


def test_batch_status_retry_and_export_zip(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text=Path(audio_path).stem,
            duration=1,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0, end=1, text=Path(audio_path).stem)],
        ),
    )
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    created = client.post(
        "/transcriptions/batch",
        files=[
            ("files", ("one.wav", b"one", "audio/wav")),
            ("files", ("two.wav", b"two", "audio/wav")),
        ],
        data={"backend": "local", "model_name": "whisper-base"},
    )
    assert created.status_code == 200
    batch_id = created.json()["batch_id"]
    assert batch_id
    for item in created.json()["items"]:
        wait_for_task(client, item["id"], lambda row: row["status"] == "completed", "batch completed")

    status = client.get(f"/batches/{batch_id}")
    assert status.status_code == 200
    assert status.json()["completed"] == 2
    assert status.json()["progress"] == 100

    exported = client.get(f"/batches/{batch_id}/export.zip")
    assert exported.status_code == 200
    assert exported.headers["content-type"] == "application/zip"


def test_task_logs_quality_runtime_and_storage_support_diagnostics(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path: (path, {"duration_ms": 120000}))
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text="",
            duration=120,
            model_name=model_name,
            segments=[],
        ),
    )
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    created = client.post(
        "/transcriptions",
        files={"file": ("empty.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    ).json()
    task = wait_for_task(client, created["id"], lambda row: row["status"] == "completed", "completed")
    assert task["options"]["quality_report"]["warnings"] == ["EMPTY_TRANSCRIPT", "TEXT_TOO_SHORT_FOR_DURATION"]

    logs = client.get(f"/tasks/{created['id']}/logs")
    assert logs.status_code == 200
    assert any(item["stage"] == "quality" for item in logs.json())

    quality = client.get(f"/tasks/{created['id']}/quality")
    assert quality.status_code == 200
    assert "EMPTY_TRANSCRIPT" in quality.json()["warnings"]

    health = client.get("/runtime/health-report")
    assert health.status_code == 200
    assert health.json()["runtime"]["data_dir"] == str(tmp_path)

    bundle = client.get("/runtime/diagnostic-bundle.zip")
    assert bundle.status_code == 200
    assert bundle.headers["content-type"] == "application/zip"

    dry_run = client.post("/storage/cleanup/dry-run", json={"delete_chunks": True})
    assert dry_run.status_code == 200

    backup = client.post("/storage/backup", json={})
    assert backup.status_code == 200
    assert Path(backup.json()["path"]).exists()


def test_model_benchmark_and_provider_transcription_test(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setattr("backend.services.media.prepare_media_for_asr", lambda path: (path, {"duration_ms": 1000}))
    monkeypatch.setattr(
        "backend.services.benchmarks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text="benchmark text",
            duration=1,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0, end=1, text="benchmark text")],
        ),
    )
    monkeypatch.setattr(
        "backend.providers.bcut.BcutProvider.transcribe",
        lambda self, audio_path, options: TranscriptionResult(
            text="provider test",
            duration=1,
            provider_id="bcut",
            segments=[TranscriptSegment(id=1, start=0, end=1, text="provider test")],
        ),
    )
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    audio = tmp_path / "bench.wav"
    audio.write_bytes(b"audio")

    benchmark = client.post("/models/benchmark", json={"model_names": ["whisper-base"], "audio_path": str(audio)})
    assert benchmark.status_code == 200
    assert benchmark.json()[0]["success"] is True

    listed = client.get("/models/benchmark")
    assert listed.status_code == 200
    assert listed.json()[0]["model_name"] == "whisper-base"

    provider_test = client.post(
        "/providers/bcut/test-transcription",
        files={"file": ("provider.wav", b"audio", "audio/wav")},
    )
    assert provider_test.status_code == 200
    assert provider_test.json()["ok"] is True
    assert provider_test.json()["segments_count"] == 1


def test_storage_restore_rejects_unsafe_or_invalid_backups(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    missing_manifest = tmp_path / "missing-manifest.zip"
    with zipfile.ZipFile(missing_manifest, "w") as archive:
        archive.writestr("asrbox.db", b"db")
    response = client.post("/storage/restore", json={"backup_path": str(missing_manifest)})
    assert response.status_code == 400

    traversal = tmp_path / "traversal.zip"
    manifest = {
        "name": "asrbox-backup",
        "schema_version": "1",
        "created_at": "2026-07-03T00:00:00",
        "files": [{"path": "../evil.txt", "size": 4, "sha256": "bad"}],
    }
    with zipfile.ZipFile(traversal, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("../evil.txt", b"evil")
    response = client.post("/storage/restore", json={"backup_path": str(traversal)})
    assert response.status_code == 400

    mismatch = tmp_path / "checksum.zip"
    manifest = {
        "name": "asrbox-backup",
        "schema_version": "1",
        "created_at": "2026-07-03T00:00:00",
        "files": [{"path": "asrbox.db", "size": 2, "sha256": "0" * 64}],
    }
    with zipfile.ZipFile(mismatch, "w") as archive:
        archive.writestr("manifest.json", json.dumps(manifest))
        archive.writestr("asrbox.db", b"db")
    response = client.post("/storage/restore", json={"backup_path": str(mismatch)})
    assert response.status_code == 400


def test_build_binary_dry_run_and_server_args() -> None:
    from backend.build_binary import build_args
    from backend.server import parse_args

    command = build_args(cuda=False, mlx=True)
    joined = " ".join(command)
    assert "PyInstaller" in joined
    assert "asrbox-server" in command
    assert "accelerate" in command
    assert "mlx_whisper" in command

    args = parse_args(["--host", "127.0.0.1", "--port", "17495", "--parent-pid", "123", "--keep-running-sentinel", "/tmp/asrbox.keep"])
    assert args.host == "127.0.0.1"
    assert args.port == 17495
    assert args.parent_pid == 123
    assert args.keep_running_sentinel == "/tmp/asrbox.keep"

    version_args = parse_args(["--version"])
    assert version_args.version is True
