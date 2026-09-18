from __future__ import annotations

from pathlib import Path

from backend import config
from backend.backends import get_model_config
from backend.services import models as model_service


def test_model_status_catalog_does_not_wait_for_runtime_probe_or_usage_scan(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_MODEL_STORAGE_ROOT", str(tmp_path))
    model = get_model_config("qwen3-asr-1.7b")
    assert model is not None
    monkeypatch.setattr(model_service, "get_all_model_configs", lambda: [model])

    model_dir = config.get_models_dir() / model.model_name
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text('{"model_name":"qwen3-asr-1.7b","size_on_disk_mb":12.5}', encoding="utf-8")
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    (model_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
    (model_dir / "processor_config.json").write_text("{}", encoding="utf-8")
    (model_dir / "model.safetensors").write_bytes(b"weights")

    inspect_calls: list[bool] = []

    def inspect_storage(*, include_usage: bool = True):
        inspect_calls.append(include_usage)
        return {
            "available": True,
            "status": "available",
        }

    monkeypatch.setattr(model_service.model_storage, "inspect_storage", inspect_storage)
    assert not hasattr(model_service, "runtime_probe_snapshot_nonblocking")
    monkeypatch.setattr(
        model_service,
        "qwen3_asr_available",
        lambda: (_ for _ in ()).throw(AssertionError("model catalog must not run the blocking runtime probe")),
    )
    def unexpected_scan(*_args, **_kwargs):
        raise AssertionError("routine model catalog requests must use the verified marker snapshot")

    monkeypatch.setattr(model_service, "_cache_info", unexpected_scan)
    monkeypatch.setattr(model_service, "_directory_size", unexpected_scan)
    monkeypatch.setattr(model_service, "is_model_downloaded", unexpected_scan)
    monkeypatch.setattr(model_service, "check_model_compatibility", unexpected_scan)

    statuses = model_service.list_model_statuses()

    assert inspect_calls == [False]
    assert len(statuses) == 1
    assert statuses[0].downloaded is True
    assert statuses[0].compatible is None
    assert statuses[0].compatibility_error is None


def test_model_storage_summary_uses_marker_sizes_without_recursive_scans(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_MODEL_STORAGE_ROOT", str(tmp_path))
    model = get_model_config("qwen3-asr-1.7b")
    assert model is not None
    monkeypatch.setattr(model_service, "get_all_model_configs", lambda: [model])

    model_dir = config.get_models_dir() / model.model_name
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text('{"model_name":"qwen3-asr-1.7b","size_on_disk_mb":12.5}', encoding="utf-8")

    def unexpected_scan(*_args, **_kwargs):
        raise AssertionError("polled storage summaries must not recursively scan model files")

    monkeypatch.setattr(model_service, "_directory_size", unexpected_scan)
    monkeypatch.setattr(model_service, "is_model_downloaded", unexpected_scan)

    summary = model_service.storage_summary()

    assert summary["models"][0]["downloaded"] is True
    assert summary["models"][0]["size_on_disk_mb"] == 12.5
    assert summary["total_size_mb"] == 12.5
