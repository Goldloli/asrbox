from __future__ import annotations

from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend import config
from backend.mcp_server import server as mcp_server
from backend.services import models as model_service


class _FakeTask:
    def __init__(self, audio_path: Path) -> None:
        self.audio_path = audio_path

    def model_dump(self) -> dict[str, str]:
        return {"audio_path": str(self.audio_path)}


def _stub_create_task(monkeypatch: pytest.MonkeyPatch) -> list[Path]:
    recorded: list[Path] = []

    def fake_create_task_from_path(db, *, path: Path, **kwargs):
        recorded.append(path)
        return _FakeTask(path)

    monkeypatch.setattr(mcp_server.task_service, "create_task_from_path", fake_create_task_from_path)
    monkeypatch.setattr(mcp_server.db_session, "init_db", lambda: None)
    monkeypatch.setattr(mcp_server.db_session, "SessionLocal", lambda: _FakeSession())
    return recorded


class _FakeSession:
    def close(self) -> None:
        return None


def test_mcp_transcribe_rejects_path_outside_allowed_roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("ASRBOX_DESKTOP_MODE", raising=False)
    monkeypatch.delenv("ASRBOX_MCP_ALLOWED_ROOTS", raising=False)
    recorded = _stub_create_task(monkeypatch)
    database_file = tmp_path / "asrbox.db"
    database_file.write_text("sentinel", encoding="utf-8")

    with pytest.raises(ValueError, match="MCP ingestion boundary"):
        mcp_server._transcribe({"path": str(database_file)})

    assert recorded == []


def test_mcp_transcribe_allows_uploads_and_declared_roots(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.delenv("ASRBOX_DESKTOP_MODE", raising=False)
    extra_root = tmp_path / "mounted-media"
    extra_root.mkdir()
    monkeypatch.setenv("ASRBOX_MCP_ALLOWED_ROOTS", str(extra_root))
    recorded = _stub_create_task(monkeypatch)

    uploads_file = config.get_uploads_dir() / "clip.wav"
    uploads_file.write_bytes(b"audio")
    mounted_file = extra_root / "other.mp4"
    mounted_file.write_bytes(b"video")

    mcp_server._transcribe({"path": str(uploads_file)})
    mcp_server._transcribe({"path": str(mounted_file)})

    assert recorded == [uploads_file, mounted_file]


def test_mcp_transcribe_desktop_mode_keeps_arbitrary_paths(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path / "data"))
    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    recorded = _stub_create_task(monkeypatch)
    anywhere = tmp_path / "anywhere" / "clip.wav"
    anywhere.parent.mkdir()
    anywhere.write_bytes(b"audio")

    mcp_server._transcribe({"path": str(anywhere)})

    assert recorded == [anywhere]


def test_delete_model_rejects_unregistered_name_and_keeps_directory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    stranger = config.get_models_dir() / "stranger-model"
    stranger.mkdir(parents=True)
    (stranger / "weights.bin").write_bytes(b"weights")

    with pytest.raises(ValueError, match="Unknown model"):
        model_service.delete_model("stranger-model")

    assert (stranger / "weights.bin").exists()


def test_delete_model_rejects_path_escape_and_keeps_models_root(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    models_root = config.get_models_dir()
    models_root.mkdir(parents=True, exist_ok=True)
    sentinel = models_root / "sentinel.txt"
    sentinel.write_text("keep me", encoding="utf-8")

    for name in ("..", "."):
        with pytest.raises(ValueError, match="Unknown model"):
            model_service.delete_model(name)

    assert sentinel.exists()


def test_delete_registered_model_removes_directory(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    target = config.get_models_dir() / "whisper-base"
    target.mkdir(parents=True)
    (target / "model.bin").write_bytes(b"weights")

    model_service.delete_model("whisper-base")

    assert not target.exists()


def test_delete_model_route_maps_unknown_name_to_404(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    from backend.app import create_app

    client = TestClient(create_app())
    sentinel = config.get_models_dir() / "sentinel.txt"
    sentinel.parent.mkdir(parents=True, exist_ok=True)
    sentinel.write_text("keep", encoding="utf-8")

    response = client.delete("/models/stranger-model")
    assert response.status_code == 404

    escape = client.delete("/models/%2E%2E")
    assert escape.status_code == 404
    assert sentinel.read_text(encoding="utf-8") == "keep"
