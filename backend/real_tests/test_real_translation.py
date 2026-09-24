"""Real local-provider translation regression, opt-in via ASRBOX_RUN_REAL_MODELS=1.

Cross-word subtitles are the failure mode behind the alignment hardening: local models drift
across segment boundaries, so a published version must still line up segment by segment.
A missing local provider is a capability skip; the assertions themselves are deterministic.
"""
from __future__ import annotations

import json
import os
import time
import urllib.request

import pytest

from backend.database import session as database
from backend.database.models import LLMProvider, TranscriptVersion, TranscriptionTask
from backend.models import TranslationCreateRequest
from backend.services import translation as svc

# Synthetic cross-word subtitles: three long sentences cut mid-phrase, every cue unique.
SEGMENTS = [
    {"id": index + 1, "start": index * 2.0, "end": index * 2.0 + 2.0, "text": text}
    for index, text in enumerate([
        "A moving company was hired to", "relocate the entire laboratory", "from the old campus to a",
        "new building across the river", "before the winter semester", "began, but the elevators in",
        "the new building were not", "certified yet, so the freezers", "had to stay on the trucks",
        "overnight, which cost the", "university an extra forty", "two thousand dollars and",
        "delayed the sequencing run", "by almost three weeks.", "The facilities team then",
        "proposed renting a refrigerated", "trailer, but the loading dock", "could only fit one vehicle",
        "at a time, and the permits", "for overnight parking had",
    ])
]


def _local_models(endpoint: str) -> list[str]:
    try:
        with urllib.request.urlopen(f"{endpoint}/api/tags", timeout=5) as response:
            return [item["name"] for item in json.load(response).get("models", [])]
    except Exception:
        return []


def test_local_translation_publishes_aligned_segments(tmp_path, monkeypatch):
    if os.environ.get("ASRBOX_RUN_REAL_MODELS") != "1":
        raise AssertionError("ASRBOX_RUN_REAL_MODELS=1 is required; real model tests must not be skipped")
    endpoint = os.environ.get("ASRBOX_REAL_TRANSLATION_ENDPOINT", "http://127.0.0.1:11434")
    models = _local_models(endpoint)
    if not models:
        pytest.skip(f"no local provider reachable at {endpoint}")
    model_name = (os.environ.get("ASRBOX_REAL_TRANSLATION_MODEL")
                  or next((name for name in models if "4b" in name), models[0]))

    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path / "data"))
    database.init_db()
    monkeypatch.setattr(svc, "enqueue", lambda *args: None)
    with database.SessionLocal() as db:
        task = TranscriptionTask(id="real-translation", filename="synthetic.wav", source="local",
                                 audio_path="uploads/synthetic.wav", status="completed", progress=100,
                                 text="\n".join(item["text"] for item in SEGMENTS))
        provider = LLMProvider(id="real-local", name="Local Ollama", preset="ollama",
                               base_url=f"{endpoint}/v1", default_model=model_name, enabled=True)
        version = TranscriptVersion(task_id=task.id, version_type="asr", segments_json=json.dumps(SEGMENTS))
        db.add_all([task, provider, version])
        db.commit()
        run = svc.create_run(db, task.id, TranslationCreateRequest(
            provider_id=provider.id, source_version_id=version.id,
            source_language={"kind": "preset", "code": "en"},
            target_language={"kind": "preset", "code": "zh-Hans"}))
        started = time.monotonic()
        svc.execute_run(run.id, run.attempt)
        elapsed = time.monotonic() - started
        db.expire_all()
        row = svc.get_run(db, task.id, run.id)
        assert row.status == "completed", (row.status, row.error_code, row.error)
        published = json.loads(svc.latest_version(db, run.id).segments_json)

    assert [item["segment_id"] for item in published] == [item["id"] for item in SEGMENTS]
    assert all(item["text"].strip() for item in published)
    pairs = [(source["text"], item["text"]) for source, item in zip(SEGMENTS, published, strict=True)]
    assert svc.alignment_hits(pairs) == []
    assert not svc.alignment_bloated(pairs)
    print(f"real translation: {model_name} segments={len(SEGMENTS)} elapsed={elapsed:.1f}s")
