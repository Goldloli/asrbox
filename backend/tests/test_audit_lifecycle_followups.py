from __future__ import annotations

import asyncio
from concurrent.futures import ThreadPoolExecutor
from datetime import UTC, datetime
import queue
import subprocess
import threading
import time
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

from backend.database import session as db_session
from backend.database.models import (
    LLMProvider,
    ProofreadingRun,
    ProofreadingSuggestion,
    TranscriptSegment as DBSegment,
    TranscriptVersion,
    TranscriptionChunk,
    TranscriptionTask,
)
from backend.models import TranscriptSegment, TranscriptionResult
from backend.services import media
from backend.services import proofreading
from backend.services import resource_tickets
from backend.services import storage as storage_service
from backend.services import tasks as task_service
from backend.services import versions as version_service
from backend.services.ffmpeg_tools import ToolStatus


def _init_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    db_session.init_db()


def _seed_chunk_task(
    tmp_path: Path,
    *,
    task_id: str,
    task_status: str,
    chunk_status: str = "failed",
) -> tuple[int, Path]:
    chunk_path = tmp_path / "derived-audio" / f"{task_id}_chunks" / "chunk-0001.wav"
    chunk_path.parent.mkdir(parents=True, exist_ok=True)
    chunk_path.write_bytes(b"audio")
    db = db_session.SessionLocal()
    try:
        row = TranscriptionTask(
            id=task_id,
            filename="sample.wav",
            source="local",
            audio_path="uploads/sample.wav",
            normalized_audio_path=str(chunk_path),
            status=task_status,
            progress=60,
            error="chunk failed" if chunk_status == "failed" else None,
            options_json="{}",
        )
        db.add(row)
        db.flush()
        chunk = TranscriptionChunk(
            task_id=task_id,
            idx=1,
            audio_path=str(chunk_path),
            start_ms=0,
            end_ms=1000,
            status=chunk_status,
            progress=20,
            error="chunk failed" if chunk_status == "failed" else None,
            error_code="CHUNK_FAILED" if chunk_status == "failed" else None,
        )
        db.add(chunk)
        db.commit()
        return chunk.id, chunk_path
    finally:
        db.close()


@pytest.mark.parametrize(
    "operation",
    ["retry-one", "retry-all", "cleanup", "relink"],
)
def test_active_task_artifact_mutations_return_conflict_without_changes(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    _init_db(tmp_path, monkeypatch)
    monkeypatch.setenv("ASRBOX_DESKTOP_MODE", "1")
    task_id = f"active-{operation}"
    replacement = tmp_path / "replacement.wav"
    replacement.write_bytes(b"replacement")
    monkeypatch.setattr(
        task_service,
        "_transcribe_path_for_row",
        lambda *_args: TranscriptionResult(text="must-not-run", segments=[]),
    )

    from backend.app import create_app

    with TestClient(create_app()) as client:
        # Seed after startup recovery so the active state is not intentionally
        # converted to "interrupted" by the application lifespan.
        chunk_id, chunk_path = _seed_chunk_task(
            tmp_path,
            task_id=task_id,
            task_status="transcribing",
        )
        endpoints = {
            "retry-one": f"/tasks/{task_id}/chunks/{chunk_id}/retry",
            "retry-all": f"/tasks/{task_id}/chunks/retry-failed",
            "cleanup": f"/tasks/{task_id}/cleanup-artifacts",
            "relink": f"/tasks/{task_id}/relink",
        }
        payload = {"path": str(replacement)} if operation == "relink" else None
        response = client.post(endpoints[operation], json=payload)

    assert response.status_code == 409
    assert chunk_path.exists()
    check = db_session.SessionLocal()
    try:
        row = check.get(TranscriptionTask, task_id)
        assert row is not None
        assert row.status == "transcribing"
        assert row.audio_path == "uploads/sample.wav"
        assert row.normalized_audio_path == str(chunk_path)
        assert check.query(TranscriptionChunk).filter_by(task_id=task_id).count() == 1
    finally:
        check.close()


def test_concurrent_failed_chunk_retry_executes_once(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    task_id = "chunk-retry-race"
    chunk_id, _chunk_path = _seed_chunk_task(
        tmp_path,
        task_id=task_id,
        task_status="failed",
    )
    started = threading.Event()
    release = threading.Event()
    calls = 0
    calls_lock = threading.Lock()

    def slow_transcribe(*_args) -> TranscriptionResult:
        nonlocal calls
        with calls_lock:
            calls += 1
        started.set()
        assert release.wait(timeout=5)
        return TranscriptionResult(
            text="recovered",
            segments=[TranscriptSegment(id=1, start=0, end=1, text="recovered")],
        )

    monkeypatch.setattr(task_service, "_transcribe_path_for_row", slow_transcribe)
    from backend.app import create_app

    with TestClient(create_app()) as client, ThreadPoolExecutor(max_workers=2) as executor:
        first = executor.submit(client.post, f"/tasks/{task_id}/chunks/{chunk_id}/retry")
        assert started.wait(timeout=5)
        second = executor.submit(client.post, f"/tasks/{task_id}/chunks/{chunk_id}/retry")
        time.sleep(0.1)
        release.set()
        responses = [first.result(timeout=5), second.result(timeout=5)]

    assert sorted(response.status_code for response in responses) == [200, 409]
    assert calls == 1


def test_retry_failed_chunks_preserves_partial_progress_until_remaining_chunk_recovers(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    task_id = "chunk-retry-partial"
    chunks_dir = tmp_path / "derived-audio" / f"{task_id}_chunks"
    chunks_dir.mkdir(parents=True)
    db = db_session.SessionLocal()
    try:
        task = TranscriptionTask(
            id=task_id,
            filename="partial.wav",
            source="local",
            audio_path="uploads/partial.wav",
            status="failed",
            progress=70,
            error="chunk failed",
            error_code="CHUNK_FAILED",
            options_json='{"error_code":"CHUNK_FAILED"}',
        )
        db.add(task)
        for index in (1, 2):
            chunk_path = chunks_dir / f"chunk-{index:04}.wav"
            chunk_path.write_bytes(b"audio")
            db.add(
                TranscriptionChunk(
                    task_id=task_id,
                    idx=index,
                    audio_path=str(chunk_path),
                    start_ms=(index - 1) * 1000,
                    end_ms=index * 1000,
                    status="failed",
                    progress=20,
                    error="chunk failed",
                    error_code="CHUNK_FAILED",
                )
            )
        db.commit()

        calls: list[str] = []

        def partially_failing_transcribe(_db, _row, path: Path) -> TranscriptionResult:
            calls.append(path.name)
            if path.name == "chunk-0002.wav":
                raise RuntimeError("second chunk still fails")
            return TranscriptionResult(text="first recovered", segments=[])

        monkeypatch.setattr(
            task_service,
            "_transcribe_path_for_row",
            partially_failing_transcribe,
        )
        partial = task_service.retry_failed_chunks(db, task_id)

        assert partial is not None
        assert partial.status == "failed"
        chunks = (
            db.query(TranscriptionChunk)
            .filter_by(task_id=task_id)
            .order_by(TranscriptionChunk.idx)
            .all()
        )
        assert [chunk.status for chunk in chunks] == ["completed", "failed"]
        assert chunks[0].text == "first recovered"
        assert db.query(TranscriptVersion).filter_by(task_id=task_id).count() == 0

        monkeypatch.setattr(
            task_service,
            "_transcribe_path_for_row",
            lambda _db, _row, path: (
                calls.append(path.name),
                TranscriptionResult(text="second recovered", segments=[]),
            )[1],
        )
        completed = task_service.retry_failed_chunks(db, task_id)

        assert completed is not None
        assert completed.status == "completed"
        assert completed.text == "first recovered second recovered"
        assert calls == [
            "chunk-0001.wav",
            "chunk-0002.wav",
            "chunk-0002.wav",
        ]
        assert db.query(TranscriptVersion).filter_by(task_id=task_id).count() == 1
    finally:
        db.close()


def test_cancelling_failed_chunk_retry_prevents_final_merge(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    task_id = "chunk-retry-cancel"
    chunk_id, _chunk_path = _seed_chunk_task(
        tmp_path,
        task_id=task_id,
        task_status="failed",
    )
    started = threading.Event()
    release = threading.Event()

    def slow_transcribe(*_args) -> TranscriptionResult:
        started.set()
        assert release.wait(timeout=5)
        return TranscriptionResult(
            text="must-not-merge",
            segments=[
                TranscriptSegment(
                    id=1,
                    start=0,
                    end=1,
                    text="must-not-merge",
                )
            ],
        )

    monkeypatch.setattr(task_service, "_transcribe_path_for_row", slow_transcribe)
    from backend.app import create_app

    with TestClient(create_app()) as client, ThreadPoolExecutor(max_workers=1) as executor:
        retry = executor.submit(
            client.post,
            f"/tasks/{task_id}/chunks/{chunk_id}/retry",
        )
        assert started.wait(timeout=5)
        cancelled = client.post(f"/tasks/{task_id}/cancel")
        release.set()
        retried = retry.result(timeout=5)

    assert cancelled.status_code == 200
    assert retried.status_code == 200
    assert retried.json()["status"] == "cancelled"
    check = db_session.SessionLocal()
    try:
        row = check.get(TranscriptionTask, task_id)
        assert row is not None
        assert row.status == "cancelled"
        assert check.query(TranscriptVersion).filter_by(task_id=task_id).count() == 0
    finally:
        check.close()


def test_chunk_retry_rejects_non_failed_chunk(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    task_id = "completed-chunk"
    chunk_id, _chunk_path = _seed_chunk_task(
        tmp_path,
        task_id=task_id,
        task_status="failed",
        chunk_status="completed",
    )
    monkeypatch.setattr(
        task_service,
        "_transcribe_path_for_row",
        lambda *_args: TranscriptionResult(text="must-not-run", segments=[]),
    )
    from backend.app import create_app

    with TestClient(create_app()) as client:
        response = client.post(f"/tasks/{task_id}/chunks/{chunk_id}/retry")

    assert response.status_code == 409


def test_chunk_retry_route_does_not_block_event_loop(monkeypatch: pytest.MonkeyPatch) -> None:
    from backend.routes import tasks as task_routes

    monkeypatch.setattr(
        task_routes.task_service,
        "retry_chunk",
        lambda *_args: (time.sleep(0.2), SimpleNamespace(id="task"))[1],
    )

    async def scenario() -> None:
        started = time.monotonic()
        request = asyncio.create_task(task_routes.retry_chunk("task", 1, db=object()))
        await asyncio.sleep(0.03)
        assert time.monotonic() - started < 0.12
        await request

    asyncio.run(scenario())


def _seed_completed_proofreading_run(tmp_path: Path) -> tuple[str, int]:
    db = db_session.SessionLocal()
    try:
        provider = LLMProvider(
            id="proof-provider",
            name="Local",
            preset="ollama",
            base_url="http://localhost:11434/v1",
            default_model="qwen",
            enabled=True,
        )
        task = TranscriptionTask(
            id="proof-task",
            filename="proof.wav",
            source="local",
            audio_path="uploads/proof.wav",
            status="completed",
            progress=100,
            text="错别子",
            options_json="{}",
        )
        db.add_all([provider, task])
        db.flush()
        db.add(DBSegment(task_id=task.id, idx=1, start_ms=0, end_ms=1000, text="错别子"))
        db.commit()
        version = version_service.create_version(db, task, "transcribe")
        run = ProofreadingRun(
            id="proof-run",
            task_id=task.id,
            source_version_id=version.id,
            llm_provider_id=provider.id,
            provider_name=provider.name,
            provider_preset=provider.preset,
            model_name=provider.default_model,
            status="completed",
            total_batches=1,
            completed_batches=1,
        )
        db.add(run)
        db.flush()
        suggestion = ProofreadingSuggestion(
            run_id=run.id,
            segment_id=1,
            original_text="错别子",
            suggested_text="错别字",
            reason="修正",
        )
        db.add(suggestion)
        db.commit()
        return run.id, suggestion.id
    finally:
        db.close()


def test_proofreading_apply_shares_task_transition_lock(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    run_id, suggestion_id = _seed_completed_proofreading_run(tmp_path)
    entered_stale_check = threading.Event()
    original_is_stale = proofreading.is_stale

    def observed_is_stale(db, run):
        entered_stale_check.set()
        return original_is_stale(db, run)

    monkeypatch.setattr(proofreading, "is_stale", observed_is_stale)

    def apply_once():
        db = db_session.SessionLocal()
        try:
            return proofreading.apply_suggestions(db, run_id, [suggestion_id])
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=1) as executor:
        with task_service._task_transition_lock:
            future = executor.submit(apply_once)
            assert not entered_stale_check.wait(timeout=0.2)
        assert future.result(timeout=5).version_type == "proofread"


def test_proofreading_worker_replaces_thread_level_exit(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    isolated_queue: queue.Queue[str] = queue.Queue()
    monkeypatch.setattr(proofreading, "_run_queue", isolated_queue)
    monkeypatch.setattr(proofreading, "_worker_started", False)
    monkeypatch.setattr(proofreading, "_worker_count", 0, raising=False)
    monkeypatch.setattr(proofreading, "_worker_target", 1, raising=False)
    monkeypatch.setattr(proofreading, "_fail_run_after_escape", lambda _run_id: None)
    replacement_processed = threading.Event()

    def execute(_db, run_id: str) -> None:
        if run_id == "first":
            raise SystemExit(1)
        replacement_processed.set()
        proofreading._worker_target = 0
        raise SystemExit(0)

    monkeypatch.setattr(proofreading, "execute_run", execute)
    proofreading.enqueue_run("first")
    proofreading.enqueue_run("second")

    assert replacement_processed.wait(timeout=3)


def test_resource_ticket_has_idle_and_absolute_expiry(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    clock = [0.0]
    monkeypatch.setattr(resource_tickets.time, "monotonic", lambda: clock[0])
    resource_tickets.clear()

    grant = resource_tickets.issue(
        "/tasks/ticket-task/audio",
        ttl_seconds=10,
        absolute_ttl_seconds=25,
    )
    assert 24 <= (grant.expires_at - datetime.now(UTC)).total_seconds() <= 26

    clock[0] = 9
    assert resource_tickets.validate(grant.ticket, grant.path, "GET")
    clock[0] = 18
    assert resource_tickets.validate(grant.ticket, grant.path, "GET")
    clock[0] = 24
    assert resource_tickets.validate(grant.ticket, grant.path, "GET")
    clock[0] = 25
    assert not resource_tickets.validate(grant.ticket, grant.path, "GET")


@pytest.mark.parametrize(
    ("route_name", "service_name"),
    [
        ("runtime_status", "get_runtime_status"),
        ("runtime_health_report", "health_report"),
        ("runtime_diagnostic_bundle", "diagnostic_bundle"),
    ],
)
def test_runtime_routes_move_sync_work_off_event_loop(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    route_name: str,
    service_name: str,
) -> None:
    from backend.routes import runtime as runtime_routes

    service_result = (
        tmp_path / "diagnostic.zip"
        if route_name == "runtime_diagnostic_bundle"
        else {"status": "ok"}
    )
    if isinstance(service_result, Path):
        service_result.write_bytes(b"zip")
    monkeypatch.setattr(
        runtime_routes,
        service_name,
        lambda *_args: (time.sleep(0.2), service_result)[1],
    )

    async def scenario() -> None:
        started = time.monotonic()
        route = getattr(runtime_routes, route_name)
        request = asyncio.create_task(
            route() if route_name == "runtime_status" else route(db=object())
        )
        await asyncio.sleep(0.03)
        assert time.monotonic() - started < 0.12
        response = await request
        if isinstance(service_result, Path):
            assert Path(response.path) == service_result
        else:
            assert response == service_result

    asyncio.run(scenario())


@pytest.mark.parametrize("route_name", ["model_status", "model_storage"])
def test_model_inventory_routes_move_directory_scans_off_event_loop(
    monkeypatch: pytest.MonkeyPatch,
    route_name: str,
) -> None:
    from backend.routes import models as model_routes

    entered = threading.Event()
    release = threading.Event()

    if route_name == "model_status":
        def slow_result():
            entered.set()
            assert release.wait(3)
            return []

        monkeypatch.setattr(model_routes.model_service, "list_model_statuses", slow_result)
    else:
        def slow_result():
            entered.set()
            assert release.wait(3)
            return {
                "root": "/tmp/models",
                "models_dir": "/tmp/models/models",
                "models": [],
                "used_bytes": 0,
                "total_size_mb": 0,
            }

        monkeypatch.setattr(model_routes.model_service, "storage_summary", slow_result)

    async def scenario() -> None:
        route = getattr(model_routes, route_name)
        pending = asyncio.create_task(route())
        try:
            assert await asyncio.to_thread(entered.wait, 1)
            await asyncio.wait_for(asyncio.sleep(0), timeout=0.2)
            assert not pending.done()
        finally:
            release.set()
        await pending

    asyncio.run(scenario())


def test_split_audio_failure_removes_chunks_created_by_same_call(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output_dir = tmp_path / "chunks"
    monkeypatch.setattr(
        media,
        "resolve_tools",
        lambda **_kwargs: {
            "ffmpeg": ToolStatus(True, "/tmp/ffmpeg", "manual", "ffmpeg test"),
            "ffprobe": ToolStatus(True, "/tmp/ffprobe", "manual", "ffprobe test"),
        },
    )
    calls = 0

    def fake_run(command, **_kwargs):
        nonlocal calls
        calls += 1
        target = Path(command[-1])
        target.write_bytes(b"partial")
        if calls == 2:
            raise subprocess.CalledProcessError(1, command, stderr="failed")
        return SimpleNamespace(stdout="", stderr="")

    monkeypatch.setattr(media.subprocess, "run", fake_run)

    with pytest.raises(Exception, match="Failed to split"):
        media.split_audio_chunks(
            tmp_path / "source.wav",
            output_dir,
            duration_ms=2500,
            window_ms=1000,
            overlap_ms=0,
        )

    assert list(output_dir.glob("*.wav")) == []


def test_recursive_orphan_cleanup_preserves_chunk_references(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    referenced = tmp_path / "derived-audio" / "task_chunks" / "chunk-0001.wav"
    orphan = tmp_path / "derived-audio" / "orphan_chunks" / "chunk-0002.wav"
    referenced.parent.mkdir(parents=True, exist_ok=True)
    orphan.parent.mkdir(parents=True, exist_ok=True)
    referenced.write_bytes(b"keep")
    orphan.write_bytes(b"remove")
    db = db_session.SessionLocal()
    try:
        task = TranscriptionTask(
            id="orphan-task",
            filename="sample.wav",
            source="local",
            audio_path="uploads/sample.wav",
            status="failed",
            progress=100,
            options_json="{}",
        )
        db.add(task)
        db.flush()
        db.add(
            TranscriptionChunk(
                task_id=task.id,
                idx=1,
                audio_path=str(referenced),
                start_ms=0,
                end_ms=1000,
                status="failed",
                progress=20,
            )
        )
        db.commit()

        storage_service.cleanup(
            db,
            delete_normalized=False,
            delete_chunks=False,
            delete_orphans=True,
            delete_old_diagnostics=False,
        )
    finally:
        db.close()

    assert referenced.exists()
    assert not orphan.exists()
