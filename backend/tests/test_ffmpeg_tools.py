from __future__ import annotations

from pathlib import Path
from types import SimpleNamespace

from backend.services import media
from backend.services import ffmpeg_tools
from backend.services.ffmpeg_tools import ToolStatus, resolve_tool


def _fake_tool(path: Path, name: str) -> str:
    path.write_text(f"#!/bin/sh\necho '{name} version test'\n")
    path.chmod(0o755)
    return str(path)


def _stub_version_probe(monkeypatch):
    # The priority-resolution tests below only exercise candidate ordering; the
    # version probe is stubbed because fake tools are not real executables on
    # every platform (Windows cannot exec a shell script).
    monkeypatch.setattr(ffmpeg_tools, "_version", lambda _path: ("fake version test", None))


def test_manual_path_wins_over_bundled_and_system(tmp_path: Path, monkeypatch):
    _stub_version_probe(monkeypatch)
    manual = _fake_tool(tmp_path / "manual-ffmpeg", "manual")
    bundled = _fake_tool(tmp_path / "bundled-ffmpeg", "bundled")
    system = _fake_tool(tmp_path / "system-ffmpeg", "system")
    monkeypatch.setenv("ASRBOX_FFMPEG_PATH", bundled)
    monkeypatch.setattr(ffmpeg_tools.shutil, "which", lambda name: system if name == "ffmpeg" else None)

    status = resolve_tool("ffmpeg", manual)

    assert status.available is True
    assert status.path == manual
    assert status.source == "manual"


def test_bundled_path_wins_over_system_without_manual(tmp_path: Path, monkeypatch):
    _stub_version_probe(monkeypatch)
    bundled = _fake_tool(tmp_path / "bundled-ffprobe", "bundled")
    system = _fake_tool(tmp_path / "system-ffprobe", "system")
    monkeypatch.setenv("ASRBOX_FFPROBE_PATH", bundled)
    monkeypatch.setattr(ffmpeg_tools.shutil, "which", lambda name: system if name == "ffprobe" else None)

    status = resolve_tool("ffprobe")

    assert status.available is True
    assert status.path == bundled
    assert status.source == "bundled"


def test_invalid_bundled_path_falls_back_to_system(tmp_path: Path, monkeypatch):
    _stub_version_probe(monkeypatch)
    system = _fake_tool(tmp_path / "system-ffmpeg", "system")
    monkeypatch.setenv("ASRBOX_FFMPEG_PATH", str(tmp_path / "missing-ffmpeg"))
    monkeypatch.setattr(ffmpeg_tools.shutil, "which", lambda name: system if name == "ffmpeg" else None)

    status = resolve_tool("ffmpeg")

    assert status.available is True
    assert status.path == system
    assert status.source == "system"


def test_probe_media_uses_resolved_ffprobe(monkeypatch):
    commands: list[list[str]] = []
    monkeypatch.setattr(
        media,
        "resolve_tools",
        lambda **_kwargs: {
            "ffprobe": ToolStatus(True, "/tmp/asrbox-ffprobe", "manual", "ffprobe version test"),
            "ffmpeg": ToolStatus(True, "/tmp/asrbox-ffmpeg", "manual", "ffmpeg version test"),
        },
    )

    def fake_run(command, **_kwargs):
        commands.append(command)
        return SimpleNamespace(stdout='{"format":{"duration":"1"},"streams":[{"codec_type":"audio","sample_rate":"16000","channels":1}]}')

    monkeypatch.setattr(media.subprocess, "run", fake_run)

    metadata = media.probe_media(Path("sample.mp4"))

    assert metadata["has_audio_stream"] is True
    assert commands[0][0] == "/tmp/asrbox-ffprobe"


def test_prepare_media_uses_resolved_ffmpeg(monkeypatch):
    commands: list[list[str]] = []
    monkeypatch.setattr(media, "probe_media", lambda _path: {"has_audio_stream": True})
    monkeypatch.setattr(
        media,
        "resolve_tools",
        lambda **_kwargs: {
            "ffprobe": ToolStatus(True, "/tmp/asrbox-ffprobe", "manual", "ffprobe version test"),
            "ffmpeg": ToolStatus(True, "/tmp/asrbox-ffmpeg", "manual", "ffmpeg version test"),
        },
    )

    def fake_run(command, **_kwargs):
        commands.append(command)
        return SimpleNamespace(stdout="", stderr="")

    monkeypatch.setattr(media.subprocess, "run", fake_run)

    media.prepare_media_for_asr(Path("sample.mp4"))

    assert commands[0][0] == "/tmp/asrbox-ffmpeg"
