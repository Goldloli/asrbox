from __future__ import annotations

import json
from pathlib import Path
import time

from backend import config
from backend.services import model_storage


def _reset_environment(monkeypatch, data_dir: Path) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(data_dir))
    monkeypatch.delenv("ASRBOX_MODEL_STORAGE_ROOT", raising=False)
    monkeypatch.delenv("ASRBOX_MODEL_STORAGE_ROOTS", raising=False)
    monkeypatch.delenv("ASRBOX_CONTAINER", raising=False)


def test_default_root_preserves_existing_models_layout(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path)

    assert config.get_model_storage_root() == tmp_path
    assert config.get_models_dir() == tmp_path / "models"
    assert config.get_model_cache_dir("huggingface") == tmp_path / "cache" / "huggingface"


def test_selected_root_is_persisted_atomically_outside_movable_root(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    target = tmp_path / "external"
    target.mkdir()

    assert config.set_model_storage_root(target) == target

    payload = json.loads((tmp_path / "data" / "model-storage.json").read_text(encoding="utf-8"))
    assert payload == {"version": 1, "root": str(target)}
    assert config.get_model_storage_root() == target
    assert list((tmp_path / "data").glob(".model-storage.json.*.tmp")) == []


def test_inspection_does_not_create_unavailable_configured_root(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    missing = tmp_path / "missing-volume"
    config.set_model_storage_root(missing)

    status = model_storage.inspect_storage()

    assert status["status"] == "unavailable"
    assert status["reason"] == "path_missing"
    assert status["root"] == str(missing)
    assert not missing.exists()
    assert not (missing / "models").exists()


def test_candidate_rejects_symbolic_link_components(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    real = tmp_path / "real"
    real.mkdir()
    linked = tmp_path / "linked"
    linked.symlink_to(real, target_is_directory=True)

    result = model_storage.validate_candidate(linked)

    assert result["valid"] is False
    assert "symbolic_links_not_allowed" in result["errors"]


def test_candidate_rejects_symbolic_links_inside_managed_layout(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    target = tmp_path / "target"
    outside = tmp_path / "outside"
    (target / "models").mkdir(parents=True)
    outside.mkdir()
    (target / "models" / "linked-model").symlink_to(outside, target_is_directory=True)

    result = model_storage.validate_candidate(target)

    assert result["valid"] is False
    assert "symbolic_links_not_allowed" in result["errors"]


def test_container_candidate_is_limited_to_declared_mounts(tmp_path: Path, monkeypatch) -> None:
    data = tmp_path / "data"
    mounted = tmp_path / "mounted"
    outside = tmp_path / "outside"
    mounted.mkdir()
    outside.mkdir()
    _reset_environment(monkeypatch, data)
    monkeypatch.setenv("ASRBOX_CONTAINER", "1")
    monkeypatch.setenv("ASRBOX_MODEL_STORAGE_ROOTS", str(mounted))

    assert model_storage.validate_candidate(mounted)["valid"] is True
    rejected = model_storage.validate_candidate(outside)
    assert rejected["valid"] is False
    assert "path_not_allowed" in rejected["errors"]
    assert config.get_allowed_model_storage_roots() == [data, mounted]


def test_candidate_reports_detected_network_filesystem(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    target = tmp_path / "network"
    target.mkdir()
    monkeypatch.setattr(model_storage, "_filesystem_type", lambda _path: "nfs")

    result = model_storage.validate_candidate(target)

    assert result["valid"] is True
    assert result["network_filesystem"] is True
    assert result["warnings"] == ["network_filesystem"]


def test_startup_marks_running_relocation_interrupted(tmp_path: Path, monkeypatch) -> None:
    _reset_environment(monkeypatch, tmp_path / "data")
    target = tmp_path / "target"
    staging = target / ".asrbox-relocation-job-1.staging"
    staging.mkdir(parents=True)
    model_storage.write_relocation_state({"id": "job-1", "status": "running", "phase": "copying", "target_root": str(target)})

    recovered = model_storage.recover_interrupted_relocation()

    assert recovered is not None
    assert recovered["status"] == "failed"
    assert recovered["error_code"] == "RELOCATION_INTERRUPTED"
    assert recovered["cleanup_paths"] == [str(staging)]
    assert model_storage.current_relocation()["phase"] == "interrupted"


def _create_model(root: Path, name: str = "whisper-base", content: bytes = b"weights") -> Path:
    model = root / "models" / name
    model.mkdir(parents=True)
    (model / "model.json").write_text('{"model_name":"whisper-base"}', encoding="utf-8")
    (model / "model.safetensors").write_bytes(content)
    return model


def _wait_for_job() -> dict:
    for _ in range(3000):
        job = model_storage.current_relocation()
        if job["status"] not in {"running", "cancelling"}:
            return job
        time.sleep(0.01)
    raise AssertionError("relocation did not finish")


def test_move_copies_verifies_switches_then_removes_source(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])

    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "complete"
    assert config.get_model_storage_root() == target
    assert (target / "models" / "whisper-base" / "model.safetensors").read_bytes() == b"weights"
    assert not source_model.exists()


def test_move_conflict_is_reported_without_overwrite(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    _reset_environment(monkeypatch, source)
    _create_model(source, content=b"source")
    target_model = _create_model(target, content=b"target")
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])

    plan = model_storage.plan_relocation(target, "move")

    assert plan["valid"] is False
    assert "target_conflicts" in plan["errors"]
    assert target_model.joinpath("model.safetensors").read_bytes() == b"target"
    assert config.get_model_storage_root() == source


def test_copy_failure_keeps_source_and_original_configuration(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    monkeypatch.setattr(model_storage, "_copy_tree", lambda *_args, **_kwargs: (_ for _ in ()).throw(OSError("copy failed")))

    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "failed"
    assert config.get_model_storage_root() == source
    assert source_model.exists()
    assert list(target.glob(".asrbox-relocation-*.staging")) == []


def test_adopt_switches_to_valid_target_without_touching_source(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source, content=b"source")
    _create_model(target, content=b"target")
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])

    model_storage.start_relocation({"target_root": str(target), "mode": "adopt", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "complete"
    assert config.get_model_storage_root() == target
    assert source_model.joinpath("model.safetensors").read_bytes() == b"source"


def test_cleanup_failure_keeps_verified_source_copy_for_manual_cleanup(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    monkeypatch.setattr(model_storage, "_remove_owned_source", lambda *_args: [str(source / "models")])

    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "complete"
    assert job["cleanup_required"] is True
    assert config.get_model_storage_root() == target
    assert (source / "models").exists()


def test_cancelled_copy_preserves_source_and_cleans_staging(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    monkeypatch.setattr(model_storage, "_copy_tree", lambda *_args, **_kwargs: (_ for _ in ()).throw(model_storage.RelocationCancelled("cancelled")))

    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "cancelled"
    assert config.get_model_storage_root() == source
    assert source_model.exists()
    assert list(target.glob(".asrbox-relocation-*.staging")) == []


def test_plan_blocks_when_destination_space_is_insufficient(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    usage = model_storage.shutil.disk_usage(target)
    monkeypatch.setattr(model_storage.shutil, "disk_usage", lambda _path: usage._replace(free=1))

    plan = model_storage.plan_relocation(target, "move")

    assert plan["valid"] is False
    assert "insufficient_space" in plan["errors"]
    assert plan["required_headroom_bytes"] >= model_storage.MIN_RELOCATION_HEADROOM_BYTES


def test_hash_verification_failure_keeps_original_root(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    original_equivalent = model_storage._files_equivalent

    def fail_staging_verification(left: Path, right: Path) -> bool:
        if ".staging" in str(right) or right.name.endswith(".partial"):
            return False
        return original_equivalent(left, right)

    monkeypatch.setattr(model_storage, "_files_equivalent", fail_staging_verification)
    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "failed"
    assert config.get_model_storage_root() == source
    assert source_model.exists()


def test_configuration_switch_failure_keeps_original_root(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    original_set = config.set_model_storage_root

    def fail_target_switch(root: str | Path) -> Path:
        if Path(root) == target:
            raise OSError("switch failed")
        return original_set(root)

    monkeypatch.setattr(config, "set_model_storage_root", fail_target_switch)
    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "failed"
    assert config.get_model_storage_root() == source
    assert source_model.exists()


def test_target_readiness_failure_rolls_configuration_back(tmp_path: Path, monkeypatch) -> None:
    source = tmp_path / "data"
    target = tmp_path / "target"
    target.mkdir()
    _reset_environment(monkeypatch, source)
    source_model = _create_model(source)
    monkeypatch.setattr(model_storage, "_active_blockers", lambda _db=None: [])
    original_inspect = model_storage.inspect_storage

    def unavailable_after_switch() -> dict:
        result = original_inspect()
        if config.get_model_storage_root() == target:
            result.update({"available": False, "status": "unavailable", "reason": "io_error"})
        return result

    monkeypatch.setattr(model_storage, "inspect_storage", unavailable_after_switch)
    model_storage.start_relocation({"target_root": str(target), "mode": "move", "include_shared_caches": False, "acknowledge_network": False})
    job = _wait_for_job()

    assert job["status"] == "failed"
    assert config.get_model_storage_root() == source
    assert source_model.exists()
