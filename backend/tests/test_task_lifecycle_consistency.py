from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from backend.database import session as db_session
from backend.database.models import ProofreadingRun, TranscriptionChunk, TranscriptionTask, TranscriptVersion
from backend.services import proofreading as proofreading_service
from backend.services import storage as storage_service
from backend.services import task_runtime
from backend.services import tasks as task_service
from backend.services.local_task_worker import run_local_task_worker


def _init_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    db_session.init_db()


def _add_task(db, task_id: str, status: str, *, audio_path: str = "uploads/a.wav") -> TranscriptionTask:
    row = TranscriptionTask(
        id=task_id,
        filename="a.wav",
        source="local",
        audio_path=audio_path,
        status=status,
        progress=50.0,
        options_json="{}",
    )
    db.add(row)
    db.commit()
    return row


def test_retry_retranscribe_delete_reject_active_task(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    monkeypatch.setattr(task_service, "start_task_in_background", lambda task_id: None)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "active-1", "transcribing")
        for action in (
            lambda: task_service.retry_task(db, "active-1"),
            lambda: task_service.retranscribe_task(db, "active-1"),
            lambda: task_service.delete_task(db, "active-1"),
        ):
            with pytest.raises(task_service.TaskActiveError):
                action()
        assert db.get(TranscriptionTask, "active-1").status == "transcribing"
    finally:
        db.close()


def test_retry_terminal_task_resets_state(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    monkeypatch.setattr(task_service, "start_task_in_background", lambda task_id: None)
    db = db_session.SessionLocal()
    try:
        row = _add_task(db, "failed-1", "failed")
        row.error = "boom"
        row.completed_at = task_service._utc_now()
        db.commit()

        response = task_service.retry_task(db, "failed-1")

        assert response is not None
        assert response.status == "queued"
        assert response.error is None
        assert response.completed_at is None
    finally:
        db.close()


def test_delete_all_tasks_skips_active(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "active-2", "queued")
        _add_task(db, "done-2", "completed")

        deleted = task_service.delete_all_tasks(db)

        assert deleted == 1
        assert db.get(TranscriptionTask, "active-2") is not None
        assert db.get(TranscriptionTask, "done-2") is None
    finally:
        db.close()


def test_active_task_endpoints_return_409(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    from backend.app import create_app

    client = TestClient(create_app())
    db = db_session.SessionLocal()
    try:
        _add_task(db, "active-3", "transcribing")
    finally:
        db.close()

    assert client.post("/tasks/active-3/retry").status_code == 409
    assert client.post("/tasks/active-3/retranscribe", json={}).status_code == 409
    assert client.delete("/tasks/active-3").status_code == 409

    db = db_session.SessionLocal()
    try:
        row = db.get(TranscriptionTask, "active-3")
        assert row is not None and row.status == "transcribing"
    finally:
        db.close()


def test_run_task_failure_handler_survives_deleted_row(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        row = _add_task(db, "ghost-1", "transcribing")
        task_id = row.id
        db.delete(row)
        db.commit()

        ghost = db.get(TranscriptionTask, task_id)
        assert ghost is None
        # row is detached/deleted; run_task must return without raising.
        task_service.run_task(db, row)
    finally:
        db.close()


def test_fail_task_after_escape_marks_active_task_failed(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "escape-1", "transcribing")
        task_service._fail_task_after_escape("escape-1")

        row = db.get(TranscriptionTask, "escape-1")
        assert row.status == "failed"
        assert row.error_code == "WORKER_RUNTIME_ERROR"
    finally:
        db.close()


def test_fail_task_after_escape_leaves_terminal_task_untouched(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "escape-2", "completed")
        task_service._fail_task_after_escape("escape-2")
        assert db.get(TranscriptionTask, "escape-2").status == "completed"
    finally:
        db.close()


def test_request_cancel_ignores_untracked_task() -> None:
    assert task_runtime.request_cancel("untracked-xyz") is None
    assert "untracked-xyz" not in task_runtime.snapshot()["cancelled_task_ids"]

    task_runtime.mark_queued("tracked-xyz")
    assert task_runtime.request_cancel("tracked-xyz") == "queued"
    assert task_runtime.is_cancelled("tracked-xyz")
    task_runtime.mark_finished("tracked-xyz")
    assert "tracked-xyz" not in task_runtime.snapshot()["cancelled_task_ids"]


def test_cleanup_chunks_skips_active_tasks(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    derived = tmp_path / "derived-audio"
    derived.mkdir(parents=True, exist_ok=True)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "active-4", "transcribing")
        _add_task(db, "done-4", "completed")
        for task_id in ("active-4", "done-4"):
            chunk_file = derived / f"{task_id}-0.wav"
            chunk_file.write_bytes(b"chunk")
            db.add(TranscriptionChunk(task_id=task_id, idx=0, audio_path=str(chunk_file), start_ms=0, end_ms=1000, status="completed"))
        db.commit()

        report = storage_service.cleanup(db, delete_normalized=False, delete_chunks=True, delete_orphans=False, delete_old_diagnostics=False)

        assert (derived / "active-4-0.wav").exists()
        assert not (derived / "done-4-0.wav").exists()
        assert db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == "active-4").count() == 1
        assert db.query(TranscriptionChunk).filter(TranscriptionChunk.task_id == "done-4").count() == 0
        assert any("active-4" not in path for path in report["removed"])
    finally:
        db.close()


def test_local_task_worker_missing_request_writes_failed_result(tmp_path: Path) -> None:
    result = tmp_path / "result.json"
    exit_code = run_local_task_worker(tmp_path / "missing-request.json", result)
    assert exit_code == 1
    payload = json.loads(result.read_text(encoding="utf-8"))
    assert payload["status"] == "failed"
    assert payload["error"]


def test_proofreading_fail_run_after_escape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task(db, "task-for-run", "completed")
        db.add(TranscriptVersion(task_id="task-for-run", version_type="transcribe", text="hello"))
        db.commit()
        version_id = db.query(TranscriptVersion.id).filter(TranscriptVersion.task_id == "task-for-run").scalar()
        db.add(ProofreadingRun(id="run-escape", task_id="task-for-run", source_version_id=version_id, llm_provider_id="p1", provider_name="P", provider_preset="custom", model_name="m", status="running"))
        db.commit()

        proofreading_service._fail_run_after_escape("run-escape")

        run = db.get(ProofreadingRun, "run-escape")
        assert run.status == "failed"
        assert run.error_code == "PROOFREADING_FAILED"
    finally:
        db.close()


def test_cancel_requested_during_postprocessing_stays_cancelled(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.models import TranscriptSegment, TranscriptionResult

    captured: dict[str, str] = {}

    def fake_transcribe(model_name: str, audio_path: str, options: dict) -> TranscriptionResult:
        captured["task_id"] = Path(audio_path).stem
        return TranscriptionResult(
            text="hello",
            duration=1.0,
            model_name=model_name,
            segments=[TranscriptSegment(id=1, start=0.0, end=1.0, text="hello")],
        )

    def cancelling_postprocess(segments, **kwargs):
        task_runtime.request_cancel(captured["task_id"])
        return segments

    monkeypatch.setattr("backend.services.tasks.transcribe_with_local_model", fake_transcribe)
    monkeypatch.setattr("backend.services.tasks.prepare_media_for_asr", lambda path, **_: (path, {"duration_ms": 1000}))
    monkeypatch.setattr("backend.services.tasks.postprocess.process_segments", cancelling_postprocess)
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_INLINE_LOCAL_TRANSCRIPTION", "1")
    from backend.app import create_app

    client = TestClient(create_app())
    model_dir = tmp_path / "models" / "whisper-base"
    model_dir.mkdir(parents=True)
    (model_dir / "model.json").write_text("{}", encoding="utf-8")
    (model_dir / "model.safetensors").write_bytes(b"weights")
    (model_dir / "config.json").write_text("{}", encoding="utf-8")
    (model_dir / "tokenizer.json").write_text("{}", encoding="utf-8")
    (model_dir / "preprocessor_config.json").write_text("{}", encoding="utf-8")

    response = client.post(
        "/transcriptions",
        files={"file": ("sample.wav", b"fake audio", "audio/wav")},
        data={"backend": "local", "model_name": "whisper-base"},
    )
    assert response.status_code == 200
    task_id = response.json()["id"]

    for _ in range(100):
        task = client.get(f"/tasks/{task_id}").json()
        if task["status"] in {"completed", "failed", "cancelled"}:
            break
        import time

        time.sleep(0.1)
    assert task["status"] == "cancelled"
    assert not task["segments"]
    task_runtime.mark_finished(task_id)
