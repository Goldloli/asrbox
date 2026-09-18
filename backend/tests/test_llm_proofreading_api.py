from __future__ import annotations

import json
import os
from pathlib import Path

from fastapi.testclient import TestClient


def _client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.app import create_app

    return TestClient(create_app())


def _seed_completed_task(task_id: str, provider_id: str) -> int:
    from backend.database import session as db_session
    from backend.database.models import TranscriptSegment as DBSegment, TranscriptionTask
    from backend.services import versions

    db = db_session.SessionLocal()
    try:
        task = TranscriptionTask(
            id=task_id,
            filename="sample.wav",
            source="local",
            audio_path="uploads/sample.wav",
            status="completed",
            progress=100,
            text="错别子 keep this",
        )
        db.add(task)
        db.flush()
        db.add_all(
            [
                DBSegment(task_id=task.id, idx=1, start_ms=0, end_ms=1000, text="错别子"),
                DBSegment(task_id=task.id, idx=2, start_ms=1000, end_ms=2000, text="keep this"),
            ]
        )
        db.commit()
        return versions.create_version(db, task, "transcribe").id
    finally:
        db.close()


def test_llm_provider_api_masks_credentials_and_exposes_presets(tmp_path: Path) -> None:
    with _client(tmp_path) as client:
        presets = client.get("/llm-providers/presets")
        assert presets.status_code == 200
        assert {item["id"] for item in presets.json()["items"]} == {
            "minimax",
            "kimi",
            "deepseek",
            "qwen",
            "glm",
            "ollama",
            "custom",
        }

        created = client.post(
            "/llm-providers",
            json={
                "name": "DeepSeek",
                "preset": "deepseek",
                "base_url": "https://api.deepseek.com",
                "api_key": "secret-token",
                "default_model": "deepseek-chat",
                "enabled": True,
            },
        )
        assert created.status_code == 200
        body = created.json()
        assert body["api_key_masked"] == "sec...ken"
        assert "api_key" not in body
        assert client.get("/llm-providers").json()["items"][0]["id"] == body["id"]

        rejected = client.post(
            "/llm-providers",
            json={
                "name": "Unsafe",
                "preset": "custom",
                "base_url": "http://llm.example.com/v1",
                "default_model": "model",
            },
        )
        assert rejected.status_code == 400


def test_proofreading_api_polls_reviews_applies_exports_and_restores(
    tmp_path: Path,
    monkeypatch,
) -> None:
    from backend.services import llm_providers, proofreading

    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)
    with _client(tmp_path) as client:
        provider = client.post(
            "/llm-providers",
            json={
                "name": "Local Ollama",
                "preset": "ollama",
                "base_url": "http://localhost:11434/v1",
                "default_model": "qwen3",
            },
        ).json()
        source_version_id = _seed_completed_task("proofread-task", provider["id"])

        started = client.post(
            "/tasks/proofread-task/proofreading-runs",
            json={"provider_id": provider["id"], "reason_language": "zh"},
        )
        assert started.status_code == 200
        run_id = started.json()["id"]
        assert started.json()["status"] == "queued"
        assert started.json()["reason_language"] == "zh"
        assert started.json()["stale"] is False

        def completion(_provider, messages, **_kwargs):
            assert "简体中文" in messages[0]["content"]
            targets = json.loads(messages[1]["content"])["targets"]
            assert set(targets[0]) == {"id", "text"}
            return json.dumps(
                {
                    "suggestions": [[1, "错别字", "修正错别字"]]
                },
                ensure_ascii=False,
            )

        monkeypatch.setattr(llm_providers, "chat_completion", completion)
        from backend.database import session as db_session

        db = db_session.SessionLocal()
        try:
            proofreading.execute_run(db, run_id)
        finally:
            db.close()

        detail = client.get(f"/tasks/proofread-task/proofreading-runs/{run_id}")
        assert detail.status_code == 200
        assert detail.json()["status"] == "completed"
        assert detail.json()["suggestions"][0]["resolution"] == "pending"
        assert len(client.get("/tasks/proofread-task/proofreading-runs").json()["items"]) == 1

        suggestion_id = detail.json()["suggestions"][0]["id"]
        applied = client.post(
            f"/tasks/proofread-task/proofreading-runs/{run_id}/apply",
            json={"suggestion_ids": [suggestion_id]},
        )
        assert applied.status_code == 200
        proofread_version_id = applied.json()["version"]["id"]
        assert applied.json()["version"]["version_type"] == "proofread"
        assert applied.json()["run"]["status"] == "applied"
        assert "错别字" in client.get("/tasks/proofread-task/export/txt").text
        assert "错别子" in client.get(
            f"/tasks/proofread-task/versions/{source_version_id}/export/txt"
        ).text

        restored = client.post(
            f"/tasks/proofread-task/versions/{proofread_version_id}/restore"
        )
        assert restored.status_code == 200
        versions = client.get("/tasks/proofread-task/versions").json()
        assert versions[0]["version_type"] == "restore"


def test_proofreading_api_rejects_stale_and_repeated_apply(tmp_path: Path, monkeypatch) -> None:
    from backend.database import session as db_session
    from backend.database.models import ProofreadingRun, ProofreadingSuggestion
    from backend.services import proofreading, versions

    monkeypatch.setattr(proofreading, "enqueue_run", lambda _run_id: None)
    with _client(tmp_path) as client:
        provider = client.post(
            "/llm-providers",
            json={
                "name": "Local Ollama",
                "preset": "ollama",
                "base_url": "http://localhost:11434/v1",
                "default_model": "qwen3",
            },
        ).json()
        source_id = _seed_completed_task("stale-task", provider["id"])
        db = db_session.SessionLocal()
        try:
            run = ProofreadingRun(
                id="stale-run",
                task_id="stale-task",
                source_version_id=source_id,
                llm_provider_id=provider["id"],
                provider_name=provider["name"],
                provider_preset=provider["preset"],
                model_name=provider["default_model"],
                status="completed",
            )
            db.add(run)
            db.flush()
            suggestion = ProofreadingSuggestion(
                run_id=run.id,
                segment_id=1,
                original_text="错别子",
                suggested_text="错别字",
                reason="修正错别字",
            )
            db.add(suggestion)
            db.commit()
            suggestion_id = suggestion.id
            task = run.task_id
            task_row = db.query(proofreading.TranscriptionTask).filter_by(id=task).one()
            versions.create_version(db, task_row, "edit")
        finally:
            db.close()

        detail = client.get("/tasks/stale-task/proofreading-runs/stale-run")
        assert detail.json()["stale"] is True
        stale = client.post(
            "/tasks/stale-task/proofreading-runs/stale-run/apply",
            json={"suggestion_ids": [suggestion_id]},
        )
        assert stale.status_code == 409
        assert stale.json()["detail"]["code"] == "PROOFREADING_STALE"


def test_proofreading_api_returns_persisted_empty_and_failed_states(tmp_path: Path) -> None:
    from backend.database import session as db_session
    from backend.database.models import LLMProvider, ProofreadingRun

    with _client(tmp_path) as client:
        db = db_session.SessionLocal()
        try:
            provider = LLMProvider(
                id="state-provider",
                name="State Provider",
                preset="ollama",
                base_url="http://localhost:11434/v1",
                default_model="qwen3",
                enabled=True,
            )
            db.add(provider)
            db.commit()
            source_id = _seed_completed_task("state-task", provider.id)
            db.add_all(
                [
                    ProofreadingRun(
                        id="empty-run",
                        task_id="state-task",
                        source_version_id=source_id,
                        llm_provider_id=provider.id,
                        provider_name=provider.name,
                        provider_preset=provider.preset,
                        model_name=provider.default_model,
                        status="completed",
                        total_batches=1,
                        completed_batches=1,
                    ),
                    ProofreadingRun(
                        id="failed-run",
                        task_id="state-task",
                        source_version_id=source_id,
                        llm_provider_id=provider.id,
                        provider_name=provider.name,
                        provider_preset=provider.preset,
                        model_name=provider.default_model,
                        status="failed",
                        error_code="LLM_PROVIDER_TIMEOUT",
                        error="LLM provider timed out",
                    ),
                ]
            )
            db.commit()
        finally:
            db.close()

        items = client.get("/tasks/state-task/proofreading-runs").json()["items"]
        by_id = {item["id"]: item for item in items}
        assert by_id["empty-run"]["status"] == "completed"
        assert by_id["empty-run"]["suggestions"] == []
        assert by_id["failed-run"]["status"] == "failed"
        assert by_id["failed-run"]["error_code"] == "LLM_PROVIDER_TIMEOUT"
        assert by_id["failed-run"]["suggestions"] == []
