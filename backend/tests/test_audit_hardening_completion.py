from __future__ import annotations

import json
import queue
import sqlite3
import subprocess
import threading
import zipfile
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from urllib.parse import parse_qs

import pytest
from fastapi import Request
from fastapi.testclient import TestClient

from backend.database import session as db_session
from backend.database.models import TranscriptSegment as DBSegment
from backend.database.models import TranscriptVersion, TranscriptionBatch, TranscriptionChunk, TranscriptionTask
from backend.models import SegmentBulkItem, SegmentsBulkUpdateRequest, TranscriptionResult
from backend.services import media
from backend.services import storage as storage_service
from backend.services import task_runtime
from backend.services import tasks as task_service
from backend.services.errors import ASRboxError
from backend.services.ffmpeg_tools import ToolStatus


def _init_db(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    db_session.init_db()


def _add_task_with_segments(
    db,
    task_id: str,
    *,
    status: str = "completed",
    text: str = "old text",
) -> TranscriptionTask:
    row = TranscriptionTask(
        id=task_id,
        filename="sample.wav",
        source="local",
        audio_path="uploads/sample.wav",
        status=status,
        progress=100,
        text=text,
        options_json="{}",
    )
    db.add(row)
    db.add_all(
        [
            DBSegment(task_id=task_id, idx=1, start_ms=0, end_ms=1000, text="old"),
            DBSegment(task_id=task_id, idx=2, start_ms=1000, end_ms=2000, text="text"),
        ]
    )
    db.add(
        TranscriptVersion(
            task_id=task_id,
            version_type="transcribe",
            text=text,
            segments_json=json.dumps(
                [
                    {"id": 1, "start": 0, "end": 1, "text": "old"},
                    {"id": 2, "start": 1, "end": 2, "text": "text"},
                ]
            ),
            options_json="{}",
        )
    )
    db.commit()
    return row


def test_concurrent_retry_only_enqueues_once(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    setup_db = db_session.SessionLocal()
    try:
        setup_db.add(
            TranscriptionTask(
                id="retry-race",
                filename="sample.wav",
                source="local",
                audio_path="uploads/sample.wav",
                status="failed",
                progress=100,
                options_json="{}",
            )
        )
        setup_db.commit()
    finally:
        setup_db.close()

    first_at_commit = threading.Event()
    second_at_commit = threading.Event()
    release_first = threading.Event()
    enqueued: list[str] = []
    outcomes: list[str] = []
    outcomes_lock = threading.Lock()

    monkeypatch.setattr(task_service, "start_task_in_background", enqueued.append)

    def run_retry(*, block_commit: bool) -> None:
        db = db_session.SessionLocal()
        original_commit = db.commit
        if block_commit:
            def delayed_commit() -> None:
                first_at_commit.set()
                assert release_first.wait(timeout=5)
                original_commit()

            db.commit = delayed_commit  # type: ignore[method-assign]
        else:
            def observed_commit() -> None:
                second_at_commit.set()
                original_commit()

            db.commit = observed_commit  # type: ignore[method-assign]
        try:
            task_service.retry_task(db, "retry-race")
        except task_service.TaskActiveError:
            result = "conflict"
        else:
            result = "queued"
        finally:
            db.close()
        with outcomes_lock:
            outcomes.append(result)

    first = threading.Thread(target=run_retry, kwargs={"block_commit": True})
    second = threading.Thread(target=run_retry, kwargs={"block_commit": False})
    first.start()
    assert first_at_commit.wait(timeout=5)
    second.start()
    # Without the transition lock the second request reaches commit while the
    # first one is paused. With the lock it waits until the first finishes.
    second_at_commit.wait(timeout=0.25)
    release_first.set()
    second.join(timeout=5)
    first.join(timeout=5)

    assert not first.is_alive() and not second.is_alive()
    assert sorted(outcomes) == ["conflict", "queued"]
    assert enqueued == ["retry-race"]


def test_task_worker_continues_after_run_task_escape(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        for task_id in ("worker-first", "worker-second"):
            db.add(
                TranscriptionTask(
                    id=task_id,
                    filename="sample.wav",
                    source="local",
                    audio_path="uploads/sample.wav",
                    status="queued",
                    progress=0,
                    options_json="{}",
                )
            )
        db.commit()
    finally:
        db.close()

    isolated_queue: queue.Queue[str] = queue.Queue()
    isolated_queue.put("worker-first")
    isolated_queue.put("worker-second")
    monkeypatch.setitem(task_service._task_queues, task_service.LOCAL_QUEUE, isolated_queue)
    seen: list[str] = []

    def fake_run_task(_db, row) -> None:
        seen.append(row.id)
        if row.id == "worker-first":
            raise RuntimeError("escaped normal handler")
        raise SystemExit(0)

    monkeypatch.setattr(task_service, "run_task", fake_run_task)
    worker = threading.Thread(target=task_service._task_worker, args=(task_service.LOCAL_QUEUE,))
    worker.start()
    worker.join(timeout=5)

    assert not worker.is_alive()
    assert seen == ["worker-first", "worker-second"]
    check_db = db_session.SessionLocal()
    try:
        first = check_db.get(TranscriptionTask, "worker-first")
        assert first is not None
        assert first.status == "failed"
        assert first.error_code == "WORKER_RUNTIME_ERROR"
    finally:
        check_db.close()
        task_runtime.mark_finished("worker-second")


def test_task_worker_exit_reclaims_live_count(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        db.add(
            TranscriptionTask(
                id="worker-exit",
                filename="sample.wav",
                source="local",
                audio_path="uploads/sample.wav",
                status="queued",
                progress=0,
                options_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()

    isolated_queue: queue.Queue[str] = queue.Queue()
    isolated_queue.put("worker-exit")
    monkeypatch.setitem(task_service._task_queues, task_service.LOCAL_QUEUE, isolated_queue)
    monkeypatch.setitem(task_service._worker_counts, task_service.LOCAL_QUEUE, 1)
    if hasattr(task_service, "_worker_targets"):
        monkeypatch.setitem(task_service._worker_targets, task_service.LOCAL_QUEUE, 0)
    monkeypatch.setattr(task_service, "run_task", lambda _db, _row: (_ for _ in ()).throw(SystemExit(0)))

    worker = threading.Thread(target=task_service._task_worker, args=(task_service.LOCAL_QUEUE,))
    worker.start()
    worker.join(timeout=5)

    assert not worker.is_alive()
    assert task_service._worker_counts[task_service.LOCAL_QUEUE] == 0
    task_runtime.mark_finished("worker-exit")


def test_bulk_edit_and_version_roll_back_together(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, "atomic-edit")
        request = SegmentsBulkUpdateRequest(
            segments=[
                SegmentBulkItem(id=1, start=0, end=1, text="new", speaker=None),
                SegmentBulkItem(id=2, start=1, end=2, text="content", speaker=None),
            ]
        )
        monkeypatch.setattr(
            task_service.version_service,
            "create_version",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("version write failed")),
        )

        with pytest.raises(RuntimeError, match="version write failed"):
            task_service.update_segments_bulk(db, "atomic-edit", request)
        db.rollback()
    finally:
        db.close()

    check_db = db_session.SessionLocal()
    try:
        row = check_db.get(TranscriptionTask, "atomic-edit")
        segments = (
            check_db.query(DBSegment)
            .filter(DBSegment.task_id == "atomic-edit")
            .order_by(DBSegment.idx)
            .all()
        )
        assert row is not None and row.text == "old text"
        assert [segment.text for segment in segments] == ["old", "text"]
        assert check_db.query(TranscriptVersion).filter(TranscriptVersion.task_id == "atomic-edit").count() == 1
    finally:
        check_db.close()


@pytest.mark.parametrize("operation", ["restore", "postprocess"])
def test_restore_and_postprocess_roll_back_with_version_failure(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    operation: str,
) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, f"atomic-{operation}")
        target = TranscriptVersion(
            task_id=f"atomic-{operation}",
            version_type="edit",
            text="restored content",
            segments_json=json.dumps(
                [
                    {"id": 1, "start": 0, "end": 1, "text": "restored"},
                    {"id": 2, "start": 1, "end": 2, "text": "content"},
                ]
            ),
            options_json="{}",
        )
        db.add(target)
        db.commit()
        target_id = target.id
        monkeypatch.setattr(
            task_service.version_service,
            "create_version",
            lambda *_args, **_kwargs: (_ for _ in ()).throw(RuntimeError("version write failed")),
        )

        with pytest.raises(RuntimeError, match="version write failed"):
            if operation == "restore":
                task_service.restore_version(db, f"atomic-{operation}", target_id)
            else:
                monkeypatch.setattr(
                    task_service.postprocess,
                    "process_segments",
                    lambda segments, **_kwargs: [
                        segment.model_copy(update={"text": f"processed-{index}"})
                        for index, segment in enumerate(segments, 1)
                    ],
                )
                task_service.postprocess_task(
                    db,
                    f"atomic-{operation}",
                    max_chars_per_line=42,
                    max_lines=2,
                    min_duration_ms=800,
                    merge_short_segments=False,
                    traditional_to_simplified=False,
                )
    finally:
        db.close()

    check_db = db_session.SessionLocal()
    try:
        row = check_db.get(TranscriptionTask, f"atomic-{operation}")
        segments = (
            check_db.query(DBSegment)
            .filter(DBSegment.task_id == f"atomic-{operation}")
            .order_by(DBSegment.idx)
            .all()
        )
        assert row is not None and row.text == "old text"
        assert [segment.text for segment in segments] == ["old", "text"]
        assert check_db.query(TranscriptVersion).filter(
            TranscriptVersion.task_id == f"atomic-{operation}"
        ).count() == 2
    finally:
        check_db.close()


@pytest.mark.parametrize(
    ("method", "path", "payload"),
    [
        ("put", "/tasks/active-edit/segments", {"segments": [{"id": 1, "start": 0, "end": 1, "text": "changed", "speaker": None}, {"id": 2, "start": 1, "end": 2, "text": "text", "speaker": None}]}),
        ("patch", "/tasks/active-edit/segments/1", {"text": "changed"}),
        ("post", "/tasks/active-edit/segments", {"start": 2, "end": 3, "text": "new"}),
        ("delete", "/tasks/active-edit/segments/1", None),
        ("post", "/tasks/active-edit/segments/1/split", {"split_at": 0.5}),
        ("post", "/tasks/active-edit/segments/merge", {"segment_ids": [1, 2]}),
        ("post", "/tasks/active-edit/postprocess", {}),
    ],
)
def test_active_task_transcript_mutations_return_409(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    method: str,
    path: str,
    payload: dict | None,
) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, "active-edit", status="transcribing")
    finally:
        db.close()
    from backend.app import create_app

    client = TestClient(create_app(), raise_server_exceptions=False)
    response = getattr(client, method)(path, json=payload) if payload is not None else getattr(client, method)(path)
    assert response.status_code == 409


def test_bulk_edit_rejects_non_finite_timing_as_validation_error(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, "finite-edit")
    finally:
        db.close()
    from backend.app import create_app

    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.put(
        "/tasks/finite-edit/segments",
        content='{"segments":[{"id":1,"start":NaN,"end":1,"text":"bad","speaker":null},{"id":2,"start":1,"end":2,"text":"text","speaker":null}]}',
        headers={"Content-Type": "application/json"},
    )
    assert response.status_code == 422


def test_active_task_restore_returns_409(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, "active-restore", status="transcribing")
        version_id = (
            db.query(TranscriptVersion.id)
            .filter(TranscriptVersion.task_id == "active-restore")
            .scalar()
        )
    finally:
        db.close()
    from backend.app import create_app

    client = TestClient(create_app(), raise_server_exceptions=False)
    response = client.post(f"/tasks/active-restore/versions/{version_id}/restore")
    assert response.status_code == 409


def test_create_delete_and_split_segments_persist_one_version_each(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        _add_task_with_segments(db, "structural-edit")
    finally:
        db.close()
    from backend.app import create_app

    client = TestClient(create_app())
    created = client.post(
        "/tasks/structural-edit/segments",
        json={"start": 2, "end": 3, "text": "third"},
    )
    assert created.status_code == 200
    assert len(created.json()["segments"]) == 3

    split = client.post(
        "/tasks/structural-edit/segments/1/split",
        json={"split_at": 0.5, "left_text": "o", "right_text": "ld"},
    )
    assert split.status_code == 200
    assert len(split.json()["segments"]) == 4

    split_ids = [segment["id"] for segment in split.json()["segments"]]
    deleted = client.delete(f"/tasks/structural-edit/segments/{max(split_ids)}")
    assert deleted.status_code == 200
    assert len(deleted.json()["segments"]) == 3

    check_db = db_session.SessionLocal()
    try:
        assert check_db.query(TranscriptVersion).filter(TranscriptVersion.task_id == "structural-edit").count() == 4
    finally:
        check_db.close()


def test_resource_ticket_is_short_lived_and_path_scoped(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> None:
    _init_db(tmp_path, monkeypatch)
    monkeypatch.setenv("ASRBOX_API_TOKEN", "full-access-token")
    audio = tmp_path / "uploads" / "ticket.wav"
    audio.parent.mkdir(parents=True, exist_ok=True)
    audio.write_bytes(b"RIFF-audio")
    db = db_session.SessionLocal()
    try:
        db.add(
            TranscriptionTask(
                id="ticket-task",
                filename="ticket.wav",
                source="local",
                audio_path=str(audio),
                status="completed",
                progress=100,
                options_json="{}",
            )
        )
        db.commit()
    finally:
        db.close()
    from backend.app import create_app
    from backend.services import resource_tickets

    resource_tickets.clear()
    client = TestClient(create_app())
    issued = client.post(
        "/auth/resource-ticket",
        headers={"Authorization": "Bearer full-access-token"},
        json={"path": "/tasks/ticket-task/audio"},
    )
    assert issued.status_code == 200
    ticket = issued.json()["ticket"]
    assert "full-access-token" not in ticket

    audio_response = client.get(f"/tasks/ticket-task/audio?resource_ticket={ticket}")
    assert audio_response.status_code == 200
    assert audio_response.content == b"RIFF-audio"

    wrong_path = client.get(f"/tasks?resource_ticket={ticket}")
    assert wrong_path.status_code == 401

    expired = resource_tickets.issue("/tasks/ticket-task/audio", ttl_seconds=0)
    assert not resource_tickets.validate(expired.ticket, "/tasks/ticket-task/audio", "GET")


def test_auth_query_is_removed_before_downstream_and_access_logging(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    monkeypatch.setenv("ASRBOX_API_TOKEN", "query-token")
    from backend.app import create_app

    app = create_app()

    @app.get("/test/query-scope")
    async def query_scope(request: Request):
        return {"query": request.scope["query_string"].decode("utf-8")}

    client = TestClient(app)
    response = client.get("/test/query-scope?keep=1&api_token=query-token&keep=2")

    assert response.status_code == 200
    parsed = parse_qs(response.json()["query"])
    assert parsed == {"keep": ["1", "2"]}
    assert "api_token" not in response.json()["query"]


def test_non_loopback_container_requires_token_but_loopback_default_does_not(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_CONTAINER", "1")
    monkeypatch.delenv("ASRBOX_API_TOKEN", raising=False)
    monkeypatch.setenv("ASRBOX_PUBLIC_BIND_ADDRESS", "0.0.0.0")
    from backend.app import create_app

    with pytest.raises(RuntimeError, match="ASRBOX_API_TOKEN"):
        with TestClient(create_app()):
            pass

    monkeypatch.setenv("ASRBOX_PUBLIC_BIND_ADDRESS", "127.0.0.1")
    with TestClient(create_app()) as client:
        assert client.get("/health").status_code == 200


def test_backup_archives_consistent_sqlite_snapshot_with_uncheckpointed_wal(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    db_path = tmp_path / "asrbox.db"
    writer = sqlite3.connect(db_path)
    writer.execute("PRAGMA journal_mode=WAL")
    writer.execute("PRAGMA wal_autocheckpoint=0")
    writer.execute("CREATE TABLE snapshot_probe (value TEXT NOT NULL)")
    writer.execute("INSERT INTO snapshot_probe(value) VALUES ('committed-in-wal')")
    writer.commit()

    db = db_session.SessionLocal()
    try:
        report = storage_service.backup(db, include_uploads=False, include_exports=False)
    finally:
        db.close()
        writer.close()

    archive_path = Path(report["path"])
    extracted = tmp_path / "snapshot.db"
    with zipfile.ZipFile(archive_path) as archive:
        extracted.write_bytes(archive.read("asrbox.db"))

    snapshot = sqlite3.connect(extracted)
    try:
        assert snapshot.execute("PRAGMA integrity_check").fetchone() == ("ok",)
        assert snapshot.execute("SELECT value FROM snapshot_probe").fetchone() == (
            "committed-in-wal",
        )
    finally:
        snapshot.close()
    assert not list((tmp_path / "backups").glob(".asrbox-snapshot-*.db"))


def test_probe_media_treats_na_and_non_finite_duration_as_unknown(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(
        media,
        "resolve_tools",
        lambda **_kwargs: {
            "ffprobe": ToolStatus(True, "/tmp/ffprobe", "manual", "test"),
            "ffmpeg": ToolStatus(True, "/tmp/ffmpeg", "manual", "test"),
        },
    )
    durations = iter(["N/A", "NaN", "-1"])

    def fake_run(_command, **kwargs):
        assert kwargs["timeout"] > 0
        return SimpleNamespace(
            stdout=json.dumps(
                {
                    "format": {"duration": next(durations)},
                    "streams": [
                        {
                            "codec_type": "audio",
                            "sample_rate": "N/A",
                            "channels": 1,
                        }
                    ],
                }
            ),
            stderr="",
        )

    monkeypatch.setattr(media.subprocess, "run", fake_run)
    for _ in range(3):
        metadata = media.probe_media(Path("sample.mp4"))
        assert metadata["duration_ms"] is None
        assert metadata["sample_rate"] is None
        assert metadata["has_audio_stream"] is True


def test_media_timeout_is_diagnostic_and_removes_partial_output(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    source = tmp_path / "sample.mp4"
    source.write_bytes(b"video")
    target = tmp_path / "sample.wav"
    monkeypatch.setattr(
        media,
        "resolve_tools",
        lambda **_kwargs: {
            "ffprobe": ToolStatus(True, "/tmp/ffprobe", "manual", "test"),
            "ffmpeg": ToolStatus(True, "/tmp/ffmpeg", "manual", "test"),
        },
    )
    monkeypatch.setattr(
        media,
        "probe_media",
        lambda _path: {"has_audio_stream": True, "duration_ms": 1_000},
    )

    def timeout_run(command, **kwargs):
        assert kwargs["timeout"] >= 60
        Path(command[-1]).write_bytes(b"partial")
        raise subprocess.TimeoutExpired(command, kwargs["timeout"])

    monkeypatch.setattr(media.subprocess, "run", timeout_run)
    with pytest.raises(ASRboxError, match="timed out"):
        media.prepare_media_for_asr(source)
    assert not target.exists()


def test_batch_export_zip_entries_are_sanitized_leaf_names(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    db = db_session.SessionLocal()
    try:
        db.add(TranscriptionBatch(id="batch-safe", options_json="{}"))
        row = _add_task_with_segments(db, "zip-task")
        row.batch_id = "batch-safe"
        row.filename = "../folder\\evil:\x00.wav"
        db.commit()
    finally:
        db.close()
    from backend.app import create_app

    client = TestClient(create_app())
    response = client.get("/batches/batch-safe/export.zip")
    assert response.status_code == 200
    with zipfile.ZipFile(BytesIO(response.content)) as archive:
        names = archive.namelist()
    assert len(names) == 4
    for name in names:
        assert name
        assert Path(name).name == name
        assert "/" not in name and "\\" not in name and "\x00" not in name
        assert "zip-task" in name


def test_runtime_probe_runs_in_short_lived_process_and_is_cached(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.services import platform as platform_service

    calls: list[list[str]] = []
    probe = {
        "python_version": "3.test",
        "platform": "test-platform",
        "ffmpeg_available": True,
        "ffprobe_available": True,
        "ffmpeg_path": "/tools/ffmpeg",
        "ffprobe_path": "/tools/ffprobe",
        "ffmpeg_source": "system",
        "ffprobe_source": "system",
        "ffmpeg_version": "test",
        "ffprobe_version": "test",
        "ffmpeg_error": None,
        "ffprobe_error": None,
        "torch_available": True,
        "torch_cuda_available": False,
        "torch_mps_available": True,
        "cuda_device_name": None,
        "cuda_capability": None,
        "ctranslate2_available": True,
        "faster_whisper_available": True,
        "funasr_available": True,
        "torchaudio_available": True,
        "modelscope_available": True,
        "huggingface_hub_available": True,
        "pyannote_available": False,
        "diarization_ready": False,
        "mlx_available": True,
        "mlx_whisper_available": True,
        "mlx_import_error": None,
        "mlx_whisper_import_error": None,
        "qwen3_asr_available": True,
        "transformers_qwen3_asr_available": True,
        "moss_transcribe_diarize_available": True,
        "warnings": [],
    }

    def fake_run(command, **kwargs):
        calls.append(command)
        assert command[-2:] == ["--runtime-check", "all"]
        assert kwargs["timeout"] > 0
        assert kwargs["env"]["ASRBOX_RUNTIME_PROBE_CHILD"] == "1"
        return subprocess.CompletedProcess(
            command,
            0,
            stdout=json.dumps(probe),
            stderr="",
        )

    monkeypatch.setattr(platform_service.subprocess, "run", fake_run)
    platform_service.runtime_probe_snapshot.cache_clear()
    try:
        assert platform_service.detect_runtime()["funasr_available"] is True
        assert platform_service.torchaudio_available() is True
        assert platform_service.runtime_mlx_import_error() is None
        assert len(calls) == 1
    finally:
        platform_service.runtime_probe_snapshot.cache_clear()


def test_detect_runtime_does_not_mutate_cached_probe_warnings(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    from backend.services import platform as platform_service

    cached = {"warnings": ["original warning"]}
    monkeypatch.setattr(platform_service, "runtime_probe_snapshot", lambda: cached)

    first = platform_service.detect_runtime()
    first["warnings"].append("request-local warning")
    second = platform_service.detect_runtime()

    assert cached["warnings"] == ["original warning"]
    assert second["warnings"] == ["original warning"]


def test_retry_failed_chunks_creates_one_final_version_and_clears_error(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _init_db(tmp_path, monkeypatch)
    chunks_dir = tmp_path / "chunks"
    chunks_dir.mkdir()
    db = db_session.SessionLocal()
    try:
        row = TranscriptionTask(
            id="chunk-recovery",
            filename="long.wav",
            source="local",
            audio_path="uploads/long.wav",
            status="failed",
            progress=80,
            model_name="whisper-base",
            error="chunk failed",
            error_code="CHUNK_FAILED",
            options_json='{"error_code":"CHUNK_FAILED"}',
        )
        db.add(row)
        for index in range(2):
            path = chunks_dir / f"chunk-{index}.wav"
            path.write_bytes(b"audio")
            db.add(
                TranscriptionChunk(
                    task_id=row.id,
                    idx=index,
                    audio_path=f"chunks/{path.name}",
                    start_ms=index * 1_000,
                    end_ms=(index + 1) * 1_000,
                    status="failed",
                    error="temporary",
                    error_code="CHUNK_FAILED",
                )
            )
        db.commit()

        monkeypatch.setattr(
            task_service,
            "_transcribe_path_for_row",
            lambda _db, _row, path: TranscriptionResult(
                text=path.stem,
                segments=[],
            ),
        )
        recovered = task_service.retry_failed_chunks(db, row.id)

        assert recovered is not None
        assert recovered.status == "completed"
        assert recovered.error is None
        assert recovered.error_code is None
        assert recovered.text == "chunk-0 chunk-1"
        assert [chunk.status for chunk in db.query(TranscriptionChunk).order_by(TranscriptionChunk.idx)] == [
            "completed",
            "completed",
        ]
        versions = db.query(TranscriptVersion).filter_by(task_id=row.id).all()
        assert len(versions) == 1
        assert versions[0].version_type == "retranscribe"
    finally:
        db.close()
