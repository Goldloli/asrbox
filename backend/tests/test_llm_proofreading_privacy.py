from __future__ import annotations

import os
import sqlite3
import zipfile
from pathlib import Path


def _database(tmp_path: Path):
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.database import session as db_session

    db_session.init_db()
    return db_session


def _seed_private_proofreading_data(db) -> None:
    from backend.database.models import (
        LLMProvider,
        ProofreadingRun,
        ProofreadingSuggestion,
        TranscriptVersion,
        TranscriptionTask,
    )

    provider = LLMProvider(
        id="private-provider",
        name="Private LLM",
        preset="deepseek",
        base_url="https://api.deepseek.com",
        api_key_secret="llm-secret-token",
        default_model="private-model",
        enabled=True,
    )
    task = TranscriptionTask(
        id="private-task",
        filename="private.wav",
        source="local",
        audio_path="uploads/private.wav",
        status="completed",
        progress=100,
        text="private transcript payload",
    )
    db.add_all([provider, task])
    db.flush()
    version = TranscriptVersion(
        task_id=task.id,
        version_type="transcribe",
        text=task.text,
        segments_json='[{"id":1,"start":0,"end":1,"text":"private transcript payload"}]',
    )
    db.add(version)
    db.flush()
    run = ProofreadingRun(
        id="private-run",
        task_id=task.id,
        source_version_id=version.id,
        llm_provider_id=provider.id,
        provider_name=provider.name,
        provider_preset=provider.preset,
        model_name=provider.default_model,
        status="completed",
    )
    db.add(run)
    db.flush()
    db.add(
        ProofreadingSuggestion(
            run_id=run.id,
            segment_id=1,
            original_text="private transcript payload",
            suggested_text="private corrected suggestion",
            reason="private correction reason",
        )
    )
    db.commit()


def test_backup_retains_llm_credentials_runs_and_suggestions(tmp_path: Path) -> None:
    from backend.services import storage

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        _seed_private_proofreading_data(db)
        backup = storage.backup(db, include_uploads=False, include_exports=False)

        with zipfile.ZipFile(backup["path"]) as archive:
            archive.extract("asrbox.db", tmp_path / "extracted")
        restored = sqlite3.connect(tmp_path / "extracted" / "asrbox.db")
        try:
            assert restored.execute("SELECT api_key_secret FROM llm_providers").fetchone()[0] == "llm-secret-token"
            assert restored.execute("SELECT provider_name, model_name FROM proofreading_runs").fetchone() == (
                "Private LLM",
                "private-model",
            )
            assert restored.execute("SELECT suggested_text FROM proofreading_suggestions").fetchone()[0] == "private corrected suggestion"
        finally:
            restored.close()
    finally:
        db.close()


def test_diagnostic_bundle_excludes_llm_private_payloads(tmp_path: Path) -> None:
    from backend.services import runtime

    db_session = _database(tmp_path)
    db = db_session.SessionLocal()
    try:
        _seed_private_proofreading_data(db)
        bundle = runtime.diagnostic_bundle(db)

        with zipfile.ZipFile(bundle) as archive:
            content = b"\n".join(archive.read(name) for name in archive.namelist())
        for forbidden in (
            b"llm-secret-token",
            b"private transcript payload",
            b"private corrected suggestion",
            b"private correction reason",
            b"You proofread transcript segments conservatively",
            b"raw provider response",
        ):
            assert forbidden not in content
    finally:
        db.close()
