from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi.testclient import TestClient


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


def test_transcription_task_runs_and_exports_outputs(tmp_path: Path) -> None:
    client = make_client(tmp_path)

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
    assert "sample.wav" in txt_export.text

    srt_export = client.get(f"/tasks/{task_id}/export/srt")
    assert srt_export.status_code == 200
    assert "00:00:00,000 -->" in srt_export.text

    json_export = client.get(f"/tasks/{task_id}/export/json")
    assert json_export.status_code == 200
    assert json_export.json()["id"] == task_id


def test_task_retry_and_cancel_endpoints_are_idempotent(tmp_path: Path) -> None:
    client = make_client(tmp_path)
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

