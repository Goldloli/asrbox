from __future__ import annotations

import json
from pathlib import Path

from backend.backends.local_asr import _model_path


def _write_marker(model_dir: Path, snapshot_path: str) -> None:
    model_dir.mkdir(parents=True, exist_ok=True)
    (model_dir / "model.json").write_text(
        json.dumps({"model_name": model_dir.name, "snapshot_path": snapshot_path}),
        encoding="utf-8",
    )


def test_model_path_prefers_recorded_snapshot_when_it_exists(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    model_dir = tmp_path / "models" / "qwen3-asr-1.7b"
    snapshot = tmp_path / "elsewhere" / "Qwen" / "Qwen3-ASR-1.7B-hf"
    snapshot.mkdir(parents=True)
    _write_marker(model_dir, str(snapshot))

    assert _model_path("qwen3-asr-1.7b") == snapshot


def test_model_path_reanchors_stale_snapshot_after_storage_relocation(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path / "new-root"))
    model_dir = tmp_path / "new-root" / "models" / "qwen3-asr-1.7b"
    snapshot = model_dir / "Qwen" / "Qwen3-ASR-1.7B-hf"
    snapshot.mkdir(parents=True)
    stale = tmp_path / "old-root" / "models" / "qwen3-asr-1.7b" / "Qwen" / "Qwen3-ASR-1.7B-hf"
    _write_marker(model_dir, str(stale))

    assert _model_path("qwen3-asr-1.7b") == snapshot


def test_model_path_falls_back_to_model_dir_when_snapshot_is_unrecoverable(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    model_dir = tmp_path / "models" / "qwen3-asr-1.7b"
    _write_marker(model_dir, str(tmp_path / "old-root" / "models" / "qwen3-asr-1.7b" / "Qwen" / "missing"))

    assert _model_path("qwen3-asr-1.7b") == model_dir
