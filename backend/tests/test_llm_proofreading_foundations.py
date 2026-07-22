from __future__ import annotations

import os
from pathlib import Path

import pytest
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.orm import sessionmaker


def _database(tmp_path: Path):
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.database import session as db_session

    db_session.init_db()
    return db_session


def test_llm_proofreading_schema_is_additive(tmp_path: Path) -> None:
    from backend.database.migrations import run_migrations
    from backend.database.models import ASRProvider, Base, TranscriptVersion, TranscriptionTask

    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    engine = create_engine(
        f"sqlite:///{tmp_path / 'legacy.db'}",
        connect_args={"check_same_thread": False},
    )
    session_factory = sessionmaker(autocommit=False, autoflush=False, bind=engine)
    new_tables = {
        "llm_providers",
        "proofreading_runs",
        "proofreading_suggestions",
        "schema_migrations",
    }
    legacy_tables = [
        table for name, table in Base.metadata.tables.items() if name not in new_tables
    ]
    Base.metadata.create_all(bind=engine, tables=legacy_tables)

    db = session_factory()
    try:
        db.add(
            ASRProvider(
                id="existing-asr",
                name="Existing ASR",
                provider_type="custom",
                enabled=True,
            )
        )
        db.add(
            TranscriptionTask(
                id="existing-task",
                filename="existing.wav",
                source="local",
                audio_path="uploads/existing.wav",
                status="completed",
                progress=100,
                text="existing transcript",
            )
        )
        db.flush()
        db.add(
            TranscriptVersion(
                task_id="existing-task",
                version_type="transcribe",
                text="existing transcript",
                segments_json='[{"id": 1, "start": 0, "end": 1, "text": "existing transcript"}]',
            )
        )
        db.commit()

        assert new_tables.isdisjoint(inspect(engine).get_table_names())
        run_migrations(engine, session_factory)

        db.expire_all()
        tables = set(inspect(engine).get_table_names())
        assert {"llm_providers", "proofreading_runs", "proofreading_suggestions"} <= tables
        indexes = {item["name"]: item for item in inspect(engine).get_indexes("proofreading_runs")}
        assert indexes["uq_proofreading_runs_active_task"]["unique"] == 1
        assert db.query(ASRProvider).filter_by(id="existing-asr").one().name == "Existing ASR"
        assert db.query(TranscriptionTask).filter_by(id="existing-task").one().filename == "existing.wav"
        assert db.query(TranscriptVersion).filter_by(task_id="existing-task").one().text == "existing transcript"
        migration = db.execute(
            text("SELECT version FROM schema_migrations WHERE version = '20260721_001_llm_proofreading'")
        ).scalar_one()
        assert migration == "20260721_001_llm_proofreading"
    finally:
        db.close()
        engine.dispose()


def test_llm_proofreading_models_store_auditable_source_snapshot(tmp_path: Path) -> None:
    from backend.database.models import (
        LLMProvider,
        ProofreadingRun,
        ProofreadingSuggestion,
        TranscriptVersion,
        TranscriptionTask,
    )

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        provider = LLMProvider(
            id="llm-one",
            name="Local Ollama",
            preset="ollama",
            base_url="http://localhost:11434/v1",
            default_model="qwen3",
            enabled=True,
        )
        task = TranscriptionTask(
            id="task-one",
            filename="sample.wav",
            source="local",
            audio_path="uploads/sample.wav",
            status="completed",
            progress=100,
            text="original",
        )
        db.add_all([provider, task])
        db.flush()
        version = TranscriptVersion(
            task_id=task.id,
            version_type="transcribe",
            text="original",
            segments_json='[{"id": 1, "start": 0, "end": 1, "text": "original"}]',
        )
        db.add(version)
        db.flush()
        run = ProofreadingRun(
            id="run-one",
            task_id=task.id,
            source_version_id=version.id,
            llm_provider_id=provider.id,
            provider_name="Local Ollama",
            provider_preset="ollama",
            model_name="qwen3",
            status="completed",
            total_batches=1,
            completed_batches=1,
        )
        db.add(run)
        db.flush()
        db.add(
            ProofreadingSuggestion(
                run_id=run.id,
                segment_id=1,
                original_text="original",
                suggested_text="corrected",
                reason="Spelling",
            )
        )
        db.commit()

        stored = db.query(ProofreadingRun).filter_by(id="run-one").one()
        assert stored.source_version_id == version.id
        assert stored.provider_name == "Local Ollama"
        assert stored.model_name == "qwen3"
        assert stored.suggestions[0].resolution == "pending"
    finally:
        db.close()


def test_llm_provider_presets_cover_supported_backends() -> None:
    from backend.services import llm_providers

    presets = {item.id: item for item in llm_providers.list_presets()}

    assert set(presets) == {"minimax", "kimi", "deepseek", "qwen", "glm", "ollama", "custom"}
    assert presets["minimax"].base_url == "https://api.minimaxi.com/v1"
    assert presets["kimi"].base_url == "https://api.moonshot.cn/v1"
    assert presets["deepseek"].base_url == "https://api.deepseek.com"
    assert presets["qwen"].base_url == "https://dashscope.aliyuncs.com/compatible-mode/v1"
    assert presets["glm"].base_url == "https://open.bigmodel.cn/api/paas/v4"
    assert presets["ollama"].base_url == "http://localhost:11434/v1"
    assert presets["ollama"].requires_api_key is False
    assert all(presets[name].requires_api_key for name in {"minimax", "kimi", "deepseek", "qwen", "glm"})


@pytest.mark.parametrize(
    ("url", "expected"),
    [
        ("http://localhost:11434/v1", True),
        ("http://127.0.0.1:11434/v1", True),
        ("http://[::1]:11434/v1", True),
        ("https://api.deepseek.com", False),
        ("https://ollama.example.com/v1", False),
    ],
)
def test_llm_provider_loopback_classification(url: str, expected: bool) -> None:
    from backend.services import llm_providers

    assert llm_providers.is_loopback_url(url) is expected


def test_llm_provider_rejects_insecure_remote_http() -> None:
    from backend.services import llm_providers

    with pytest.raises(ValueError, match="HTTPS"):
        llm_providers.validate_base_url("http://llm.example.com/v1")

    assert llm_providers.validate_base_url("http://localhost:11434/v1") == "http://localhost:11434/v1"


def test_llm_provider_masks_secrets() -> None:
    from backend.services import llm_providers

    assert llm_providers.mask_secret("secret-token") == "sec...ken"
    assert llm_providers.mask_secret("tiny") == "****"
    assert llm_providers.mask_secret(None) is None


def test_llm_provider_crud_preserves_omitted_secret(tmp_path: Path) -> None:
    from backend.models import LLMProviderCreate, LLMProviderUpdate
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        created = llm_providers.create_provider(
            db,
            LLMProviderCreate(
                name="DeepSeek",
                preset="deepseek",
                base_url="https://api.deepseek.com",
                api_key="secret-token",
                default_model="configured-model",
            ),
        )
        assert created.api_key_masked == "sec...ken"

        updated = llm_providers.update_provider(
            db,
            created.id,
            LLMProviderUpdate(name="Renamed", default_model="next-model"),
        )
        assert updated is not None
        assert updated.name == "Renamed"
        assert updated.default_model == "next-model"
        assert updated.api_key_masked == "sec...ken"
        assert llm_providers.list_providers(db)[0].id == created.id
        assert llm_providers.delete_provider(db, created.id) is True
        assert llm_providers.list_providers(db) == []
    finally:
        db.close()


@pytest.mark.parametrize("field", ["name", "preset", "base_url", "enabled"])
def test_llm_provider_update_rejects_null_required_fields(tmp_path: Path, field: str) -> None:
    from backend.models import LLMProviderCreate, LLMProviderUpdate
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        created = llm_providers.create_provider(
            db,
            LLMProviderCreate(
                name="Local",
                preset="ollama",
                base_url="http://localhost:11434/v1",
                default_model="qwen3",
            ),
        )
        with pytest.raises(ValueError, match="required"):
            llm_providers.update_provider(
                db,
                created.id,
                LLMProviderUpdate.model_validate({field: None}),
            )
    finally:
        db.close()


@pytest.mark.parametrize(
    ("enabled", "model", "api_key", "expected_code"),
    [
        (False, "model", "key", "LLM_PROVIDER_DISABLED"),
        (True, None, "key", "LLM_MODEL_REQUIRED"),
        (True, "model", None, "LLM_API_KEY_REQUIRED"),
    ],
)
def test_llm_connection_test_validates_provider_before_request(
    tmp_path: Path,
    monkeypatch,
    enabled: bool,
    model: str | None,
    api_key: str | None,
    expected_code: str,
) -> None:
    from backend.database.models import LLMProvider
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    monkeypatch.setattr(
        llm_providers.requests,
        "post",
        lambda *_args, **_kwargs: pytest.fail("invalid provider must not make a request"),
    )
    try:
        provider = LLMProvider(
            name="Cloud LLM",
            preset="deepseek",
            base_url="https://api.deepseek.com",
            api_key_secret=api_key,
            default_model=model,
            enabled=enabled,
        )
        db.add(provider)
        db.commit()

        result = llm_providers.test_provider(db, provider.id)

        assert result is not None
        assert result.ok is False
        assert result.error_code == expected_code
    finally:
        db.close()


def test_llm_connection_test_rejects_redirect_without_following_it(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import LLMProvider
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()

    class Response:
        status_code = 302

    monkeypatch.setattr(llm_providers.requests, "post", lambda *_args, **_kwargs: Response())
    try:
        provider = LLMProvider(
            name="Cloud LLM",
            preset="deepseek",
            base_url="https://api.deepseek.com",
            api_key_secret="secret-token",
            default_model="configured-model",
            enabled=True,
        )
        db.add(provider)
        db.commit()

        result = llm_providers.test_provider(db, provider.id)

        assert result is not None
        assert result.ok is False
        assert result.error_code == "LLM_PROVIDER_HTTP_ERROR"
        assert "302" in result.message
    finally:
        db.close()


@pytest.mark.parametrize(
    ("status_code", "body"),
    [
        (413, {"error": {"message": "Request too large"}}),
        (400, {"error": {"code": "context_length_exceeded", "message": "maximum context length exceeded"}}),
    ],
)
def test_llm_connection_test_classifies_context_too_long(
    tmp_path: Path,
    monkeypatch,
    status_code: int,
    body: dict,
) -> None:
    from backend.database.models import LLMProvider
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()

    class Response:
        def __init__(self) -> None:
            self.status_code = status_code

        @staticmethod
        def json():
            return body

    monkeypatch.setattr(llm_providers.requests, "post", lambda *_args, **_kwargs: Response())
    try:
        provider = LLMProvider(
            name="Cloud LLM",
            preset="deepseek",
            base_url="https://api.deepseek.com",
            api_key_secret="secret-token",
            default_model="configured-model",
            enabled=True,
        )
        db.add(provider)
        db.commit()

        result = llm_providers.test_provider(db, provider.id)

        assert result is not None
        assert result.ok is False
        assert result.error_code == "LLM_PROVIDER_CONTEXT_TOO_LONG"
        assert "context" in result.message.lower()
    finally:
        db.close()


def test_llm_connection_test_uses_sanitized_content_free_request(tmp_path: Path, monkeypatch) -> None:
    from backend.database.models import LLMProvider
    from backend.services import llm_providers

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    calls: list[dict] = []

    class Response:
        status_code = 200

        @staticmethod
        def json():
            return {"choices": [{"message": {"content": "OK"}}]}

    def fake_post(url, **kwargs):
        calls.append({"url": url, **kwargs})
        return Response()

    monkeypatch.setattr(llm_providers.requests, "post", fake_post)
    try:
        provider = LLMProvider(
            id="cloud-llm",
            name="Cloud LLM",
            preset="deepseek",
            base_url="https://api.deepseek.com",
            api_key_secret="secret-token",
            default_model="configured-model",
            enabled=True,
        )
        db.add(provider)
        db.commit()

        result = llm_providers.test_provider(db, provider.id)

        assert result.ok is True
        assert calls[0]["url"] == "https://api.deepseek.com/chat/completions"
        assert calls[0]["headers"]["Authorization"] == "Bearer secret-token"
        assert calls[0]["json"]["model"] == "configured-model"
        assert calls[0]["json"]["stream"] is False
        assert "transcript" not in str(calls[0]["json"]).lower()
        assert calls[0]["allow_redirects"] is False
        assert calls[0]["timeout"] > 0
    finally:
        db.close()
