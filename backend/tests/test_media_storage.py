from __future__ import annotations

import json
import os
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend import config
from backend.models import TranscriptSegment, TranscriptionResult


def make_client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    os.environ["ASRBOX_INLINE_LOCAL_TRANSCRIPTION"] = "1"
    from backend.app import create_app

    app = create_app()
    return TestClient(app)


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


def create_downloaded_model(tmp_path: Path, model_name: str) -> Path:
    model_dir = tmp_path / "models" / model_name
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "model.json").write_text("{}", encoding="utf-8")
    (model_dir / "model.safetensors").write_bytes(b"weights")
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    (model_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
    (model_dir / "preprocessor_config.json").write_text("{}", encoding="utf-8")
    return model_dir


def _fake_prepare_with_duration(duration_ms: int):
    def fake_prepare(path: Path, *, output_dir: Path | None = None, output_name: str | None = None) -> tuple[Path, dict]:
        target_dir = output_dir or path.parent
        target_dir.mkdir(parents=True, exist_ok=True)
        target = target_dir / (output_name or f"{path.stem}.wav")
        target.write_bytes(b"normalized")
        return target, {"duration_ms": duration_ms}

    return fake_prepare


def _stub_local_transcription(monkeypatch, *, duration_ms: int = 1000) -> None:
    monkeypatch.setattr(
        "backend.services.tasks.transcribe_with_local_model",
        lambda model_name, audio_path, options: TranscriptionResult(
            text=f"{Path(audio_path).stem} transcript",
            duration=duration_ms / 1000,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=duration_ms / 1000, text=f"{Path(audio_path).stem} transcript")],
        ),
    )
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", _fake_prepare_with_duration(duration_ms))


def test_delete_external_task_preserves_source_and_removes_derived_audio(tmp_path: Path, tmp_path_factory, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    _stub_local_transcription(monkeypatch)
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    sources_dir = tmp_path_factory.mktemp("media-sources")
    source = sources_dir / "keep-me.wav"
    source.write_bytes(b"source-media")

    created = client.post(
        "/transcriptions/path",
        json={"paths": [str(source)], "backend": "local", "model_name": "whisper-base"},
    )
    assert created.status_code == 200
    task = created.json()["items"][0]
    assert task["source_kind"] == "external"
    task = wait_for_task(client, task["id"], lambda item: item["status"] == "completed", "completed")

    normalized = tmp_path / "derived-audio" / f"{task['id']}.wav"
    assert normalized.exists()

    deleted = client.delete(f"/tasks/{task['id']}")

    assert deleted.status_code == 200
    assert source.read_bytes() == b"source-media"
    assert not normalized.exists()
    assert client.get(f"/tasks/{task['id']}").status_code == 404


def test_delete_managed_task_removes_upload_and_derived_audio(tmp_path: Path, monkeypatch) -> None:
    _stub_local_transcription(monkeypatch)
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")

    created = client.post(
        "/transcriptions",
        files={"file": ("managed.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    assert created.status_code == 200
    task = created.json()
    assert task["source_kind"] == "managed"
    task = wait_for_task(client, task["id"], lambda item: item["status"] == "completed", "completed")

    upload = tmp_path / "uploads" / f"{task['id']}.wav"
    normalized = tmp_path / "derived-audio" / f"{task['id']}.wav"
    assert upload.exists()
    assert normalized.exists()

    deleted = client.delete(f"/tasks/{task['id']}")

    assert deleted.status_code == 200
    assert not upload.exists()
    assert not normalized.exists()
    assert client.get(f"/tasks/{task['id']}").status_code == 404


def test_relink_task_media_rebinds_source_and_invalidates_derived_audio(tmp_path: Path, tmp_path_factory, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    _stub_local_transcription(monkeypatch)
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    created = client.post(
        "/transcriptions",
        files={"file": ("managed.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    task = wait_for_task(client, created.json()["id"], lambda item: item["status"] == "completed", "completed")
    normalized = tmp_path / "derived-audio" / f"{task['id']}.wav"
    assert normalized.exists()

    sources_dir = tmp_path_factory.mktemp("media-sources")
    replacement = sources_dir / "replacement.wav"
    replacement.write_bytes(b"replacement-media")
    relinked = client.post(f"/tasks/{task['id']}/relink", json={"path": str(replacement)})

    assert relinked.status_code == 200
    body = relinked.json()
    assert body["audio_path"] == str(replacement)
    assert body["source_kind"] == "external"
    assert body["normalized_audio_path"] is None
    assert "_source_kind" not in body["options"]
    assert not normalized.exists()

    fetched = client.get(f"/tasks/{task['id']}")
    assert fetched.status_code == 200
    assert fetched.json()["audio_path"] == str(replacement)
    assert fetched.json()["source_kind"] == "external"
    assert replacement.read_bytes() == b"replacement-media"


def test_relink_task_media_requires_desktop_mode_and_existing_path(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    _stub_local_transcription(monkeypatch)
    client = make_client(tmp_path)
    create_downloaded_model(tmp_path, "whisper-base")
    created = client.post(
        "/transcriptions",
        files={"file": ("managed.wav", b"audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    task = wait_for_task(client, created.json()["id"], lambda item: item["status"] == "completed", "completed")

    missing = client.post(f"/tasks/{task['id']}/relink", json={"path": str(tmp_path / "missing.wav")})
    assert missing.status_code == 400
    assert "Audio file not found" in missing.json()["detail"]

    unknown = client.post("/tasks/no-such-task/relink", json={"path": str(tmp_path)})
    assert unknown.status_code == 404
    assert unknown.json()["detail"] == "Task not found"

    monkeypatch.delenv("ASRBOX_DESKTOP_MODE")
    hidden = client.post(f"/tasks/{task['id']}/relink", json={"path": str(tmp_path)})
    assert hidden.status_code == 404
    assert hidden.json()["detail"] == "Not found"


def test_media_storage_settings_defaults_and_updates_persist(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("ASRBOX_UPLOADS_DIR", raising=False)
    monkeypatch.delenv("ASRBOX_DERIVED_AUDIO_DIR", raising=False)
    monkeypatch.delenv("ASRBOX_CONTAINER", raising=False)
    client = make_client(tmp_path)

    defaults = client.get("/settings/media-storage")
    assert defaults.status_code == 200
    body = defaults.json()
    assert body["ingest_mode"] == "reference"
    assert body["uploads_dir"] == str(tmp_path / "uploads")
    assert body["derived_audio_dir"] == str(tmp_path / "derived-audio")
    assert body["delete_derived_on_complete"] is False
    assert body["uploads_dir_locked"] is False
    assert body["derived_audio_dir_locked"] is False
    assert body["runtime"] == "desktop"

    moved_uploads = tmp_path / "moved-uploads"
    moved_derived = tmp_path / "moved-derived"
    updated = client.put(
        "/settings/media-storage",
        json={
            "ingest_mode": "copy",
            "uploads_dir": str(moved_uploads),
            "derived_audio_dir": str(moved_derived),
            "delete_derived_on_complete": True,
        },
    )
    assert updated.status_code == 200
    updated_body = updated.json()
    assert updated_body["ingest_mode"] == "copy"
    assert updated_body["uploads_dir"] == str(moved_uploads)
    assert updated_body["derived_audio_dir"] == str(moved_derived)
    assert updated_body["delete_derived_on_complete"] is True

    reread = client.get("/settings/media-storage")
    assert reread.status_code == 200
    reread_body = reread.json()
    assert reread_body["ingest_mode"] == "copy"
    assert reread_body["uploads_dir"] == str(moved_uploads)
    assert reread_body["derived_audio_dir"] == str(moved_derived)
    assert reread_body["delete_derived_on_complete"] is True

    payload = json.loads((tmp_path / "media-storage.json").read_text(encoding="utf-8"))
    assert payload["version"] == 1
    assert payload["ingest_mode"] == "copy"
    assert payload["uploads_dir"] == str(moved_uploads)
    assert payload["derived_audio_dir"] == str(moved_derived)
    assert payload["delete_derived_on_complete"] is True


def test_media_storage_settings_reject_invalid_and_locked_directories(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("ASRBOX_UPLOADS_DIR", raising=False)
    monkeypatch.delenv("ASRBOX_DERIVED_AUDIO_DIR", raising=False)
    client = make_client(tmp_path)
    blocker = tmp_path / "blocker"
    blocker.write_bytes(b"not a directory")

    invalid_uploads = client.put("/settings/media-storage", json={"uploads_dir": str(blocker)})
    assert invalid_uploads.status_code == 422
    assert "not a directory" in invalid_uploads.json()["detail"]

    invalid_derived = client.put("/settings/media-storage", json={"derived_audio_dir": str(blocker)})
    assert invalid_derived.status_code == 422
    assert "not a directory" in invalid_derived.json()["detail"]

    monkeypatch.setenv("ASRBOX_UPLOADS_DIR", str(tmp_path / "locked-uploads"))
    locked_uploads = client.put("/settings/media-storage", json={"uploads_dir": str(tmp_path / "other-uploads")})
    assert locked_uploads.status_code == 422
    assert "ASRBOX_UPLOADS_DIR" in locked_uploads.json()["detail"]
    assert client.get("/settings/media-storage").json()["uploads_dir_locked"] is True

    monkeypatch.setenv("ASRBOX_DERIVED_AUDIO_DIR", str(tmp_path / "locked-derived"))
    locked_derived = client.put("/settings/media-storage", json={"derived_audio_dir": str(tmp_path / "other-derived")})
    assert locked_derived.status_code == 422
    assert "ASRBOX_DERIVED_AUDIO_DIR" in locked_derived.json()["detail"]
    assert client.get("/settings/media-storage").json()["derived_audio_dir_locked"] is True


def test_delete_derived_on_complete_cleans_artifacts_and_keeps_external_source(tmp_path: Path, tmp_path_factory, monkeypatch) -> None:
    def fake_split(audio_path: Path, output_dir: Path, duration_ms: int, *, window_ms: int, overlap_ms: int):
        output_dir.mkdir(parents=True, exist_ok=True)
        first = output_dir / "chunk-0001.wav"
        second = output_dir / "chunk-0002.wav"
        first.write_bytes(b"1")
        second.write_bytes(b"2")
        return [(first, 0, 600000), (second, 595000, 1200000)]

    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    _stub_local_transcription(monkeypatch, duration_ms=31 * 60 * 1000)
    monkeypatch.setattr("backend.services.tasks.split_audio_chunks", fake_split)
    client = make_client(tmp_path)
    config.update_media_storage_config(ingest_mode="reference", delete_derived_on_complete=True)
    create_downloaded_model(tmp_path, "whisper-base")
    sources_dir = tmp_path_factory.mktemp("media-sources")
    source = sources_dir / "long-source.wav"
    source.write_bytes(b"long-source-media")

    created = client.post(
        "/transcriptions/path",
        json={"paths": [str(source)], "backend": "local", "model_name": "whisper-base"},
    )
    assert created.status_code == 200
    task_id = created.json()["items"][0]["id"]
    task = wait_for_task(client, task_id, lambda item: item["status"] == "completed", "completed")
    assert task["source_kind"] == "external"

    # Derived-audio cleanup runs right after the completion commit; wait for it to land.
    normalized = tmp_path / "derived-audio" / f"{task_id}.wav"
    chunks_dir = tmp_path / "derived-audio" / f"{task_id}_chunks"
    deadline = time.time() + 3
    while time.time() < deadline:
        current = client.get(f"/tasks/{task_id}").json()
        if current["normalized_audio_path"] is None and not normalized.exists() and not (chunks_dir / "chunk-0001.wav").exists():
            break
        time.sleep(0.05)

    assert client.get(f"/tasks/{task_id}").json()["normalized_audio_path"] is None
    assert not normalized.exists()
    assert not (chunks_dir / "chunk-0001.wav").exists()
    assert not (chunks_dir / "chunk-0002.wav").exists()
    assert source.read_bytes() == b"long-source-media"
