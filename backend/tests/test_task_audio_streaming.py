from __future__ import annotations

import io
from pathlib import Path
from types import SimpleNamespace

from fastapi import HTTPException
from fastapi.testclient import TestClient

from backend.database import session as db_session
from backend.database.models import TranscriptionTask
from backend.services import media_streaming


def _add_audio_task(
    tmp_path: Path,
    monkeypatch,
    payload: bytes = b"0123456789",
    *,
    normalized_payload: bytes | None = None,
) -> TestClient:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    audio = tmp_path / "external-audio.wav"
    audio.write_bytes(payload)
    normalized_audio = None
    if normalized_payload is not None:
        normalized_audio = tmp_path / "normalized-audio.wav"
        normalized_audio.write_bytes(normalized_payload)
    db_session.init_db()
    db = db_session.SessionLocal()
    try:
        db.add(
            TranscriptionTask(
                id="range-audio",
                filename="external-audio.wav",
                source="local",
                audio_path=str(audio),
                normalized_audio_path=str(normalized_audio) if normalized_audio is not None else None,
                status="completed",
                progress=100,
                options_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()

    from backend.app import create_app

    return TestClient(create_app())


def test_parse_single_byte_ranges() -> None:
    assert media_streaming.parse_single_range("bytes=2-5", 10) == (2, 5)
    assert media_streaming.parse_single_range("bytes=4-", 10) == (4, 9)
    assert media_streaming.parse_single_range("bytes=-4", 10) == (6, 9)


def test_parse_range_rejects_multiple_or_unsatisfiable_ranges() -> None:
    for value in ("items=0-1", "bytes=1-2,4-5", "bytes=20-30", "bytes=-0"):
        try:
            media_streaming.parse_single_range(value, 10)
        except HTTPException as exc:
            assert exc.status_code == 416
            assert exc.headers == {"Content-Range": "bytes */10"}
        else:
            raise AssertionError(f"expected 416 for {value}")


def test_frozen_macos_audio_response_streams_exact_range_and_stops_reader(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client = _add_audio_task(tmp_path, monkeypatch)
    launched: list[tuple[list[str], object]] = []
    process = SimpleNamespace(
        stdout=io.BytesIO(b"0123456789"),
        poll=lambda: None,
        terminate=lambda: setattr(process, "terminated", True),
        wait=lambda timeout=None: 0,
        kill=lambda: setattr(process, "killed", True),
        terminated=False,
        killed=False,
    )

    def fake_popen(command, **kwargs):
        launched.append((command, kwargs))
        return process

    monkeypatch.setattr(media_streaming, "uses_frozen_macos_reader", lambda: True)
    monkeypatch.setattr(media_streaming.subprocess, "Popen", fake_popen)

    response = client.get("/tasks/range-audio/audio", headers={"Range": "bytes=2-5"})

    assert response.status_code == 206
    assert response.content == b"2345"
    assert response.headers["accept-ranges"] == "bytes"
    assert response.headers["content-range"] == "bytes 2-5/10"
    assert response.headers["content-length"] == "4"
    assert launched and launched[0][0][0] == "/bin/dd"
    assert process.terminated is True


def test_frozen_macos_audio_response_returns_416_without_starting_reader(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client = _add_audio_task(tmp_path, monkeypatch)
    monkeypatch.setattr(media_streaming, "uses_frozen_macos_reader", lambda: True)
    monkeypatch.setattr(
        media_streaming.subprocess,
        "Popen",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(AssertionError("reader must not start")),
    )

    response = client.get("/tasks/range-audio/audio", headers={"Range": "bytes=100-200"})

    assert response.status_code == 416
    assert response.headers["content-range"] == "bytes */10"


def test_task_audio_prefers_existing_normalized_audio(
    tmp_path: Path,
    monkeypatch,
) -> None:
    client = _add_audio_task(tmp_path, monkeypatch, b"original", normalized_payload=b"normalized")
    launched: list[list[str]] = []

    class FakeProcess:
        def __init__(self):
            self.stdout = io.BytesIO(b"normalized")

        def poll(self):
            return 0

    def fake_popen(command, **_kwargs):
        launched.append(command)
        return FakeProcess()

    monkeypatch.setattr(media_streaming, "uses_frozen_macos_reader", lambda: True)
    monkeypatch.setattr(media_streaming.subprocess, "Popen", fake_popen)

    response = client.get("/tasks/range-audio/audio", headers={"Range": "bytes=0-9"})

    assert response.status_code == 206
    assert response.content == b"normalized"
    assert launched[0][1] == f"if={tmp_path / 'normalized-audio.wav'}"
