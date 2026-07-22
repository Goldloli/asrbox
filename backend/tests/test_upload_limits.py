from __future__ import annotations

from io import BytesIO
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.services import uploads
from backend.services.uploads import UploadLimitExceeded, copy_local_path, save_upload


def make_client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("ASRBOX_API_TOKEN", raising=False)
    from backend.app import create_app

    return TestClient(create_app())


def test_save_upload_removes_partial_file_when_limit_is_exceeded(tmp_path: Path) -> None:
    destination = tmp_path / "partial.wav"

    with pytest.raises(UploadLimitExceeded):
        save_upload(BytesIO(b"123456"), destination, max_bytes=5, chunk_size=2)

    assert not destination.exists()


def test_save_upload_streams_valid_file(tmp_path: Path) -> None:
    destination = tmp_path / "valid.wav"

    written = save_upload(BytesIO(b"12345"), destination, max_bytes=5, chunk_size=2)

    assert written == 5
    assert destination.read_bytes() == b"12345"


def test_copy_local_path_streams_with_progress_when_clone_is_unavailable(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.wav"
    destination = tmp_path / "managed" / "target.wav"
    source.write_bytes(b"123456")
    progress = []
    monkeypatch.setattr(uploads, "_try_clone_file", lambda *_args: False)

    copied = copy_local_path(source, destination, on_progress=lambda current, total: progress.append((current, total)), chunk_size=2)

    assert copied == 6
    assert destination.read_bytes() == b"123456"
    assert progress == [(0, 6), (2, 6), (4, 6), (6, 6)]


def test_copy_local_path_uses_clone_when_available(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.wav"
    destination = tmp_path / "target.wav"
    source.write_bytes(b"audio")
    progress = []

    def fake_clone(clone_source: Path, clone_destination: Path) -> bool:
        clone_destination.write_bytes(clone_source.read_bytes())
        return True

    monkeypatch.setattr(uploads, "_try_clone_file", fake_clone)

    copy_local_path(source, destination, on_progress=lambda current, total: progress.append((current, total)))

    assert destination.read_bytes() == b"audio"
    assert progress == [(0, 5), (5, 5)]


def test_copy_local_path_failure_preserves_source_and_removes_partial_target(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "source.wav"
    destination = tmp_path / "target.wav"
    source.write_bytes(b"original")
    monkeypatch.setattr(uploads, "_try_clone_file", lambda *_args: False)

    def fail_after_first_chunk(current: int, _total: int) -> None:
        if current:
            raise OSError("disk disconnected")

    with pytest.raises(OSError, match="disk disconnected"):
        copy_local_path(source, destination, on_progress=fail_after_first_chunk, chunk_size=2)

    assert source.read_bytes() == b"original"
    assert not destination.exists()
    assert not destination.with_name(f"{destination.name}.importing").exists()


def test_transcription_rejects_oversized_file_before_task_creation(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_MAX_UPLOAD_BYTES", "5")
    monkeypatch.setattr("backend.services.tasks.start_task_in_background", lambda _task_id: None)
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/transcriptions",
        files={"file": ("large.wav", b"123456", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )

    assert response.status_code == 413
    assert client.get("/tasks").json()["total"] == 0
    assert list((tmp_path / "uploads").glob("*")) == []


def test_batch_rejects_excessive_file_count(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_MAX_BATCH_FILES", "2")
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/transcriptions/batch",
        files=[
            ("files", ("one.wav", b"1", "audio/wav")),
            ("files", ("two.wav", b"2", "audio/wav")),
            ("files", ("three.wav", b"3", "audio/wav")),
        ],
        data={"backend": "local", "model_name": "whisper-base"},
    )

    assert response.status_code == 413
    assert client.get("/tasks").json()["total"] == 0


def test_batch_rejects_excessive_total_size(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_MAX_BATCH_TOTAL_BYTES", "5")
    client = make_client(tmp_path, monkeypatch)

    response = client.post(
        "/transcriptions/batch",
        files=[
            ("files", ("one.wav", b"123", "audio/wav")),
            ("files", ("two.wav", b"456", "audio/wav")),
        ],
        data={"backend": "local", "model_name": "whisper-base"},
    )

    assert response.status_code == 413
    assert client.get("/tasks").json()["total"] == 0
