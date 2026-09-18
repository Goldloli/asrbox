from __future__ import annotations

from concurrent.futures import ThreadPoolExecutor
import json
import os
from pathlib import Path
import socket
import subprocess
import sys
import threading
import time
from urllib.request import urlopen

import pytest

from backend.models import TranscriptSegment


def _database(tmp_path: Path):
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.database import session as db_session

    db_session.init_db()
    return db_session


def _completed_task(db, *, task_id: str = "task-one", texts: list[str] | None = None):
    from backend.database.models import LLMProvider, TranscriptSegment as DBSegment, TranscriptionTask
    from backend.services import versions

    values = texts or ["first text", "second text"]
    provider = LLMProvider(
        id=f"provider-{task_id}",
        name="Local Ollama",
        preset="ollama",
        base_url="http://localhost:11434/v1",
        default_model="qwen3",
        enabled=True,
    )
    task = TranscriptionTask(
        id=task_id,
        filename=f"{task_id}.wav",
        source="local",
        audio_path=f"uploads/{task_id}.wav",
        status="completed",
        progress=100,
        text="\n".join(values),
    )
    db.add_all([provider, task])
    db.flush()
    for index, value in enumerate(values, 1):
        db.add(
            DBSegment(
                task_id=task.id,
                idx=index,
                start_ms=(index - 1) * 1000,
                end_ms=index * 1000,
                text=value,
            )
        )
    db.commit()
    version = versions.create_version(db, task, "transcribe")
    return task, provider, version


def _completed_run(db, *, task_id: str = "task-one"):
    from backend.database.models import ProofreadingRun, ProofreadingSuggestion

    task, provider, version = _completed_task(
        db,
        task_id=task_id,
        texts=["错别子", "keep this"],
    )
    run = ProofreadingRun(
        id=f"run-{task_id}",
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
    suggestions = [
        ProofreadingSuggestion(
            run_id=run.id,
            segment_id=1,
            original_text="错别子",
            suggested_text="错别字",
            reason="修正错别字",
        ),
        ProofreadingSuggestion(
            run_id=run.id,
            segment_id=2,
            original_text="keep this",
            suggested_text="Keep this.",
            reason="补充标点",
        ),
    ]
    db.add_all(suggestions)
    db.commit()
    return task, provider, version, run, suggestions


def test_create_proofreading_run_uses_current_immutable_version(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import TranscriptSegment as DBSegment
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    queued: list[str] = []
    monkeypatch.setattr(proofreading, "enqueue_run", queued.append)
    try:
        task, provider, version = _completed_task(db)

        run = proofreading.create_run(db, task.id, provider.id, reason_language="zh")
        db.query(DBSegment).filter_by(task_id=task.id, idx=1).one().text = "live edit"
        db.commit()

        assert run.source_version_id == version.id
        assert run.reason_language == "zh"
        assert queued == [run.id]
        assert [item.text for item in proofreading.source_segments(db, run)] == ["first text", "second text"]
        db.refresh(task)
        assert task.status == "completed"
        assert task.text == "first text\nsecond text"
    finally:
        db.close()


def test_create_proofreading_run_rejects_ineligible_or_active_task(tmp_path: Path, monkeypatch) -> None:
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)
    try:
        task, provider, _version = _completed_task(db)
        task.status = "failed"
        db.commit()

        with pytest.raises(proofreading.ProofreadingError, match="completed"):
            proofreading.create_run(db, task.id, provider.id)

        task.status = "completed"
        db.commit()
        proofreading.create_run(db, task.id, provider.id)
        with pytest.raises(proofreading.ProofreadingError, match="active"):
            proofreading.create_run(db, task.id, provider.id)
    finally:
        db.close()


def test_concurrent_create_allows_only_one_active_run(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import ProofreadingRun
    from backend.services import proofreading

    db_session = _database(tmp_path)
    seed_db = db_session.SessionLocal()
    try:
        task, provider, _version = _completed_task(seed_db)
        task_id = task.id
        provider_id = provider.id
    finally:
        seed_db.close()

    barrier = threading.Barrier(2)
    latest_version_id = proofreading.version_service.latest_version_id

    def synchronized_latest_version_id(db, current_task_id):
        result = latest_version_id(db, current_task_id)
        barrier.wait(timeout=5)
        return result

    monkeypatch.setattr(proofreading.version_service, "latest_version_id", synchronized_latest_version_id)
    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)

    def create_once() -> tuple[str, str]:
        db = db_session.SessionLocal()
        try:
            run = proofreading.create_run(db, task_id, provider_id)
            return "created", run.id
        except proofreading.ProofreadingError as exc:
            return "error", exc.code
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(create_once) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]

    assert [result[0] for result in results].count("created") == 1
    assert [result for result in results if result[0] == "error"] == [
        ("error", "PROOFREADING_RUN_ACTIVE")
    ]
    verify_db = db_session.SessionLocal()
    try:
        runs = verify_db.query(ProofreadingRun).filter_by(task_id=task_id).all()
        assert len(runs) == 1
        assert runs[0].status == "queued"
    finally:
        verify_db.close()


def test_build_batches_is_deterministic_and_marks_neighbor_context() -> None:
    from backend.services import proofreading

    segments = [
        TranscriptSegment(id=index, start=index - 1, end=index, text=f"segment {index}")
        for index in range(1, 5)
    ]

    batches = proofreading.build_batches(segments, max_segments=2, max_characters=1000)

    assert [[item["id"] for item in batch.targets] for batch in batches] == [[1, 2], [3, 4]]
    assert [item["id"] for item in batches[0].context] == [3]
    assert [item["id"] for item in batches[1].context] == [2]


def test_build_batches_processes_oversized_segment_alone() -> None:
    from backend.services import proofreading

    segments = [
        TranscriptSegment(id=1, start=0, end=1, text="x" * 20),
        TranscriptSegment(id=2, start=1, end=2, text="short"),
    ]

    batches = proofreading.build_batches(segments, max_segments=10, max_characters=10)

    assert [[item["id"] for item in batch.targets] for batch in batches] == [[1], [2]]


def test_default_batch_limits_support_long_context_models() -> None:
    from backend.services import proofreading

    segments = [
        TranscriptSegment(id=index, start=index - 1, end=index, text="字" * 100)
        for index in range(1, 502)
    ]

    batches = proofreading.build_batches(segments)

    assert proofreading.MAX_BATCH_SEGMENTS == 500
    assert proofreading.MAX_BATCH_CHARACTERS == 30_000
    assert [len(batch.targets) for batch in batches] == [300, 201]


def test_local_batch_limits_keep_ollama_requests_bounded() -> None:
    from backend.services import proofreading

    segments = [
        TranscriptSegment(id=index, start=index - 1, end=index, text="x" * 50)
        for index in range(1, 131)
    ]

    batches = proofreading.build_batches(
        segments,
        max_segments=proofreading.LOCAL_MAX_BATCH_SEGMENTS,
        max_characters=proofreading.LOCAL_MAX_BATCH_CHARACTERS,
    )

    assert [len(batch.targets) for batch in batches] == [64, 64, 2]
    assert all(sum(len(str(item["text"])) for item in batch.targets) <= 6000 for batch in batches)


def test_ollama_timeout_splits_batch_and_uses_local_deadline(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import ProofreadingRun
    from backend.services import llm_providers, proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)
    calls: list[tuple[int, float]] = []

    def fake_completion(_provider, messages, **kwargs):
        targets = json.loads(messages[1]["content"])["targets"]
        calls.append((len(targets), kwargs["timeout"]))
        if len(targets) > 2:
            raise llm_providers.LLMProviderError("LLM_PROVIDER_TIMEOUT", "timed out")
        return '{"suggestions":[]}'

    monkeypatch.setattr(llm_providers, "chat_completion", fake_completion)
    try:
        task, provider, _version = _completed_task(
            db,
            texts=[f"segment {index}" for index in range(4)],
        )
        run = proofreading.create_run(db, task.id, provider.id)

        proofreading.execute_run(db, run.id)

        db.expire_all()
        completed = db.get(ProofreadingRun, run.id)
        assert completed.status == "completed"
        assert calls == [(4, 300), (2, 300), (2, 300)]
    finally:
        db.close()


def test_mark_interrupted_proofreading_runs_does_not_touch_completed(tmp_path: Path) -> None:
    from backend.database.models import ProofreadingRun
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        for status in ("queued", "running", "completed"):
            task, provider, version = _completed_task(db, task_id=f"task-{status}")
            db.add(
                ProofreadingRun(
                    id=f"run-{status}",
                    task_id=task.id,
                    source_version_id=version.id,
                    llm_provider_id=provider.id,
                    provider_name=provider.name,
                    provider_preset=provider.preset,
                    model_name=provider.default_model,
                    status=status,
                )
            )
        db.commit()

        assert proofreading.mark_interrupted_runs(db) == 2
        statuses = {row.id: row.status for row in db.query(ProofreadingRun).all()}
        assert statuses == {
            "run-queued": "interrupted",
            "run-running": "interrupted",
            "run-completed": "completed",
        }
    finally:
        db.close()


def test_backend_process_startup_recovers_active_runs_without_changing_transcripts(tmp_path: Path) -> None:
    from backend.database.models import ProofreadingRun, TranscriptVersion, TranscriptionTask

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    expected_text: dict[str, str] = {}
    try:
        for status in ("queued", "running", "completed"):
            task, provider, version = _completed_task(db, task_id=f"restart-{status}")
            expected_text[task.id] = task.text
            db.add(
                ProofreadingRun(
                    id=f"restart-run-{status}",
                    task_id=task.id,
                    source_version_id=version.id,
                    llm_provider_id=provider.id,
                    provider_name=provider.name,
                    provider_preset=provider.preset,
                    model_name=provider.default_model,
                    status=status,
                )
            )
        db.commit()
    finally:
        db.close()
        db_session.engine.dispose()

    with socket.socket() as probe:
        probe.bind(("127.0.0.1", 0))
        port = probe.getsockname()[1]

    env = os.environ.copy()
    env["ASRBOX_DATA_DIR"] = str(tmp_path)
    process = subprocess.Popen(
        [
            sys.executable,
            "-m",
            "uvicorn",
            "backend.main:app",
            "--host",
            "127.0.0.1",
            "--port",
            str(port),
            "--log-level",
            "warning",
        ],
        cwd=Path(__file__).resolve().parents[2],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
    )
    try:
        deadline = time.monotonic() + 60
        while time.monotonic() < deadline:
            if process.poll() is not None:
                output = process.stdout.read() if process.stdout else ""
                pytest.fail(f"backend exited before startup recovery: {output}")
            try:
                with urlopen(f"http://127.0.0.1:{port}/health", timeout=0.5) as response:
                    if response.status == 200:
                        break
            except OSError:
                time.sleep(0.1)
        else:
            process.terminate()
            try:
                output, _ = process.communicate(timeout=5)
            except subprocess.TimeoutExpired:
                process.kill()
                output, _ = process.communicate(timeout=5)
            pytest.fail(f"backend did not become healthy before startup recovery timeout: {output}")
    finally:
        process.terminate()
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            process.kill()
            process.wait(timeout=5)

    verify_db = db_session.SessionLocal()
    try:
        statuses = {row.id: row.status for row in verify_db.query(ProofreadingRun).all()}
        assert statuses == {
            "restart-run-queued": "interrupted",
            "restart-run-running": "interrupted",
            "restart-run-completed": "completed",
        }
        tasks = verify_db.query(TranscriptionTask).all()
        assert {task.id: task.text for task in tasks if task.id in expected_text} == expected_text
        assert all(task.status == "completed" for task in tasks if task.id in expected_text)
        assert verify_db.query(TranscriptVersion).count() == 3
    finally:
        verify_db.close()


def test_parse_suggestions_accepts_changed_targets_and_filters_unchanged() -> None:
    from backend.services import proofreading

    targets = [
        {"id": 1, "text": "错别子"},
        {"id": 2, "text": "保持原样"},
    ]
    content = json.dumps(
        {
            "suggestions": [
                {"segment_id": 1, "suggested_text": "错别字", "reason": "修正错别字"},
                {"segment_id": 2, "suggested_text": "保持原样", "reason": "无需修改"},
            ]
        },
        ensure_ascii=False,
    )

    parsed = proofreading.parse_suggestions(content, targets)

    assert [(item.segment_id, item.original_text, item.suggested_text) for item in parsed] == [
        (1, "错别子", "错别字")
    ]


def test_parse_suggestions_accepts_compact_tuples_and_keeps_legacy_compatibility() -> None:
    from backend.services import proofreading

    targets = [{"id": 7, "text": "teh answer"}]

    compact = proofreading.parse_suggestions(
        '{"suggestions":[[7,"the answer","Spelling"]]}',
        targets,
    )
    legacy = proofreading.parse_suggestions(
        '{"suggestions":[{"segment_id":7,"suggested_text":"the answer","reason":"Spelling"}]}',
        targets,
    )

    assert compact == legacy
    assert compact[0].segment_id == 7


def test_proofreading_prompt_requires_the_saved_reason_language() -> None:
    from backend.services import proofreading

    batch = proofreading.ProofreadingBatch(targets=[{"id": 1, "text": "错别子"}], context=[])

    chinese = proofreading._messages_for_batch(batch, "zh")
    english = proofreading._messages_for_batch(batch, "en")

    assert "简体中文" in chinese[0]["content"]
    assert "concise English" in english[0]["content"]
    assert proofreading.response_schema([1])["properties"]["suggestions"]["items"]["type"] == "array"


@pytest.mark.parametrize(
    "payload",
    [
        "Explanation\n```json\n{\"suggestions\": []}\n```",
        '{"suggestions":[{"segment_id":99,"suggested_text":"x","reason":"x"}]}',
        '{"suggestions":[{"segment_id":1,"suggested_text":"a","reason":"x"},{"segment_id":1,"suggested_text":"b","reason":"x"}]}',
        '{"suggestions":[{"segment_id":1,"suggested_text":"","reason":"x"}]}',
        '{"suggestions":[{"segment_id":1,"suggested_text":"x","reason":"x","extra":true}]}',
    ],
)
def test_parse_suggestions_rejects_malformed_or_untrusted_output(payload: str) -> None:
    from backend.services import proofreading

    with pytest.raises(proofreading.ProofreadingError, match="invalid structured suggestions"):
        proofreading.parse_suggestions(payload, [{"id": 1, "text": "original"}])


def test_failed_later_batch_persists_no_partial_suggestions(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import ProofreadingSuggestion
    from backend.services import llm_providers, proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)
    calls = 0

    def fake_completion(_provider, messages, **_kwargs):
        nonlocal calls
        calls += 1
        target_id = json.loads(messages[1]["content"])["targets"][0]["id"]
        if calls == 2:
            raise llm_providers.LLMProviderError("LLM_PROVIDER_UNAVAILABLE", "LLM provider unavailable")
        return json.dumps(
            {
                "suggestions": [
                    {"segment_id": target_id, "suggested_text": "corrected", "reason": "Correction"}
                ]
            }
        )

    monkeypatch.setattr(llm_providers, "chat_completion", fake_completion)
    try:
        texts = [f"segment {index}" for index in range(1, 502)]
        task, provider, _version = _completed_task(db, texts=texts)
        run = proofreading.create_run(db, task.id, provider.id)

        proofreading.execute_run(db, run.id)

        db.refresh(run)
        db.refresh(task)
        assert calls == 2
        assert run.status == "failed"
        assert run.error_code == "LLM_PROVIDER_UNAVAILABLE"
        assert db.query(ProofreadingSuggestion).filter_by(run_id=run.id).count() == 0
        assert task.status == "completed"
        assert task.text == "\n".join(texts)
    finally:
        db.close()


def test_apply_selected_suggestions_creates_one_auditable_version(tmp_path: Path) -> None:
    from backend.database.models import TranscriptSegment as DBSegment, TranscriptVersion
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        task, _provider, source, run, suggestions = _completed_run(db)
        before = db.query(DBSegment).filter_by(task_id=task.id, idx=1).one()
        protected = (before.start_ms, before.end_ms, before.speaker, before.confidence)

        assert proofreading.is_stale(db, run) is False
        created = proofreading.apply_suggestions(db, run.id, [suggestions[0].id])

        db.refresh(task)
        db.refresh(run)
        rows = db.query(DBSegment).filter_by(task_id=task.id).order_by(DBSegment.idx).all()
        versions = db.query(TranscriptVersion).filter_by(task_id=task.id).order_by(TranscriptVersion.id).all()
        assert created.version_type == "proofread"
        assert [row.text for row in rows] == ["错别字", "keep this"]
        assert (rows[0].start_ms, rows[0].end_ms, rows[0].speaker, rows[0].confidence) == protected
        assert task.text == "错别字 keep this"
        assert [row.id for row in versions] == [source.id, created.id]
        assert versions[0].segments_json == source.segments_json
        assert run.status == "applied"
        assert [item.resolution for item in run.suggestions] == ["applied", "skipped"]

        with pytest.raises(proofreading.ProofreadingError, match="already been applied"):
            proofreading.apply_suggestions(db, run.id, [suggestions[0].id])
    finally:
        db.close()


def test_concurrent_apply_creates_only_one_proofread_version(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import ProofreadingRun, TranscriptSegment as DBSegment, TranscriptVersion
    from backend.services import proofreading

    db_session = _database(tmp_path)
    seed_db = db_session.SessionLocal()
    try:
        task, _provider, _source, run, suggestions = _completed_run(seed_db)
        task_id = task.id
        run_id = run.id
        suggestion_id = suggestions[0].id
    finally:
        seed_db.close()

    start_barrier = threading.Barrier(2)

    def apply_once() -> tuple[str, int | str]:
        db = db_session.SessionLocal()
        try:
            start_barrier.wait(timeout=5)
            version = proofreading.apply_suggestions(db, run_id, [suggestion_id])
            return "applied", version.id
        except proofreading.ProofreadingError as exc:
            return "error", exc.code
        finally:
            db.close()

    with ThreadPoolExecutor(max_workers=2) as executor:
        futures = [executor.submit(apply_once) for _ in range(2)]
        results = [future.result(timeout=10) for future in futures]

    assert [result[0] for result in results].count("applied") == 1
    assert [result for result in results if result[0] == "error"] == [
        ("error", "PROOFREADING_ALREADY_APPLIED")
    ]
    verify_db = db_session.SessionLocal()
    try:
        versions = verify_db.query(TranscriptVersion).filter_by(task_id=task_id).all()
        assert len(versions) == 2
        assert [version.version_type for version in versions].count("proofread") == 1
        assert verify_db.query(DBSegment).filter_by(task_id=task_id, idx=1).one().text == "错别字"
        assert verify_db.get(ProofreadingRun, run_id).status == "applied"
    finally:
        verify_db.close()


def test_apply_rejects_stale_run_after_newer_version(tmp_path: Path) -> None:
    from backend.services import proofreading, versions

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        task, _provider, _source, run, suggestions = _completed_run(db)
        versions.create_version(db, task, "edit")

        assert proofreading.is_stale(db, run) is True
        with pytest.raises(proofreading.ProofreadingError, match="no longer current"):
            proofreading.apply_suggestions(db, run.id, [suggestions[0].id])

        db.refresh(task)
        db.refresh(run)
        assert task.text == "错别子\nkeep this"
        assert run.status == "completed"
        assert [item.resolution for item in run.suggestions] == ["pending", "pending"]
    finally:
        db.close()


def test_apply_rejects_empty_duplicate_and_changed_original(tmp_path: Path) -> None:
    from backend.database.models import TranscriptSegment as DBSegment
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        task, _provider, _source, run, suggestions = _completed_run(db)
        with pytest.raises(proofreading.ProofreadingError, match="one or more unique"):
            proofreading.apply_suggestions(db, run.id, [])
        with pytest.raises(proofreading.ProofreadingError, match="one or more unique"):
            proofreading.apply_suggestions(db, run.id, [suggestions[0].id, suggestions[0].id])

        db.query(DBSegment).filter_by(task_id=task.id, idx=1).one().text = "changed outside versioning"
        db.commit()
        with pytest.raises(proofreading.ProofreadingError, match="no longer current"):
            proofreading.apply_suggestions(db, run.id, [suggestions[0].id])

        db.refresh(run)
        assert run.status == "completed"
        assert [item.resolution for item in run.suggestions] == ["pending", "pending"]
    finally:
        db.close()


def test_apply_rolls_back_every_write_when_version_creation_fails(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import TranscriptSegment as DBSegment, TranscriptVersion
    from backend.services import proofreading

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        task, _provider, _source, run, suggestions = _completed_run(db)

        def fail_version(*_args, **_kwargs):
            raise RuntimeError("write failed")

        monkeypatch.setattr(proofreading.version_service, "create_version", fail_version)
        with pytest.raises(RuntimeError, match="write failed"):
            proofreading.apply_suggestions(db, run.id, [suggestions[0].id])

        db.expire_all()
        assert db.query(DBSegment).filter_by(task_id=task.id, idx=1).one().text == "错别子"
        assert db.query(TranscriptVersion).filter_by(task_id=task.id).count() == 1
        assert db.get(type(task), task.id).text == "错别子\nkeep this"
        stored_run = db.get(type(run), run.id)
        assert stored_run.status == "completed"
        assert [item.resolution for item in stored_run.suggestions] == ["pending", "pending"]
    finally:
        db.close()


def test_provider_deletion_keeps_proofreading_history(tmp_path: Path) -> None:
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        _task, provider, _source, run, _suggestions = _completed_run(db)

        assert llm_providers.delete_provider(db, provider.id) is True

        db.refresh(run)
        assert run.llm_provider_id is None
        assert run.provider_name == "Local Ollama"
        assert run.provider_preset == "ollama"
        assert run.model_name == "qwen3"
        assert len(run.suggestions) == 2
    finally:
        db.close()


def test_task_deletion_removes_proofreading_history(tmp_path: Path) -> None:
    from backend.database.models import ProofreadingRun, ProofreadingSuggestion
    from backend.services import tasks

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        task, _provider, _source, _run, _suggestions = _completed_run(db)

        assert tasks.delete_task(db, task.id) is True

        assert db.query(ProofreadingRun).filter_by(task_id=task.id).count() == 0
        assert db.query(ProofreadingSuggestion).count() == 0
    finally:
        db.close()
