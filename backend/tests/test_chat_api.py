import json
import os
import threading
import time
from pathlib import Path

from fastapi.testclient import TestClient

from backend.services import chat, llm_providers


def _client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.app import create_app

    return TestClient(create_app())


def _seed_task(task_id: str, texts: list[str]):
    from backend.database import session as db_session
    from backend.database.models import TranscriptSegment as DBSegment, TranscriptionTask
    from backend.services import versions

    db = db_session.SessionLocal()
    try:
        task = TranscriptionTask(
            id=task_id,
            filename=f"{task_id}.wav",
            source="local",
            audio_path=f"uploads/{task_id}.wav",
            status="completed",
            progress=100,
            text="\n".join(texts),
        )
        db.add(task)
        db.flush()
        for index, value in enumerate(texts, 1):
            db.add(DBSegment(task_id=task.id, idx=index, start_ms=(index - 1) * 1000, end_ms=index * 1000, text=value))
        db.commit()
        return versions.create_version(db, task, "transcribe").id
    finally:
        db.close()


def _create_provider(client) -> dict:
    return client.post(
        "/llm-providers",
        json={
            "name": "Local Ollama",
            "preset": "ollama",
            "base_url": "http://localhost:11434/v1",
            "default_model": "qwen3",
            "api_key": "chat-secret-key",
        },
    ).json()


def _read_sse(response):
    events = []
    event_name, data_lines = None, []
    for line in response.iter_lines():
        if line.startswith("event: "):
            event_name = line[7:]
        elif line.startswith("data: "):
            data_lines.append(line[6:])
        elif not line and event_name:
            events.append((event_name, json.loads("\n".join(data_lines)) if data_lines else None))
            event_name, data_lines = None, []
    return events


def _session_messages(session_id: str):
    from backend.database import session as db_session
    from backend.database.models import ChatMessage

    db = db_session.SessionLocal()
    try:
        return (
            db.query(ChatMessage)
            .filter(ChatMessage.session_id == session_id)
            .order_by(ChatMessage.id.asc())
            .all()
        )
    finally:
        db.close()


def test_session_crud_lifecycle(tmp_path: Path) -> None:
    with _client(tmp_path) as client:
        _seed_task("chat-task", ["第一段", "第二段"])
        provider = _create_provider(client)

        created = client.post("/chat/sessions", json={"task_id": "chat-task", "provider_id": provider["id"]})
        assert created.status_code == 200, created.text
        session = created.json()
        assert session["task_id"] == "chat-task" and session["provider_id"] == provider["id"]
        assert session["messages"] == [] and session["title"] == ""

        blank = client.post("/chat/sessions", json={})
        assert blank.status_code == 200 and blank.json()["task_id"] is None
        assert client.post("/chat/sessions", json={"task_id": "missing"}).status_code == 404
        assert client.post("/chat/sessions", json={"provider_id": "missing"}).status_code == 404

        listed = client.get("/chat/sessions").json()["items"]
        assert {item["id"] for item in listed} == {session["id"], blank.json()["id"]}
        assert "messages" not in listed[0]

        rebound = client.patch(f"/chat/sessions/{session['id']}", json={"task_id": None})
        assert rebound.status_code == 200 and rebound.json()["task_id"] is None
        restored = client.patch(f"/chat/sessions/{session['id']}", json={"task_id": "chat-task"})
        assert restored.json()["task_id"] == "chat-task"
        assert client.patch(f"/chat/sessions/{session['id']}", json={"task_id": "missing"}).status_code == 404
        assert client.patch("/chat/sessions/missing", json={}).status_code == 404

        detail = client.get(f"/chat/sessions/{session['id']}").json()
        assert detail["id"] == session["id"] and detail["messages"] == []

        assert client.delete(f"/chat/sessions/{blank.json()['id']}").status_code == 200
        assert client.get(f"/chat/sessions/{blank.json()['id']}").status_code == 404
        assert client.delete(f"/chat/sessions/{blank.json()['id']}").status_code == 404
        assert client.get("/tasks/chat-task").status_code == 200


def test_streaming_delta_done_and_context_boundary(tmp_path: Path, monkeypatch) -> None:
    captured = {}

    def fake(provider, messages, on_delta=None, **kwargs):
        captured["messages"] = messages
        captured["provider"] = provider
        on_delta("字幕")
        on_delta("摘要")
        return "字幕摘要结果"

    monkeypatch.setattr(llm_providers, "chat_completion", fake)
    with _client(tmp_path) as client:
        _seed_task("bound-task", ["绑定任务的字幕内容"])
        _seed_task("other-task", ["其他任务的机密字幕"])
        provider = _create_provider(client)
        session = client.post(
            "/chat/sessions", json={"task_id": "bound-task", "provider_id": provider["id"]},
        ).json()

        with client.stream(
            "POST", f"/chat/sessions/{session['id']}/messages", json={"content": "支持哪些导出格式？"},
        ) as response:
            assert response.status_code == 200
            assert response.headers["content-type"].startswith("text/event-stream")
            events = _read_sse(response)

        names = [name for name, _ in events]
        assert names == ["delta", "delta", "done"]
        assert [data["content"] for _, data in events[:2]] == ["字幕", "摘要"]
        done = events[-1][1]["message"]
        assert done["role"] == "assistant" and done["status"] == "complete" and done["content"] == "字幕摘要结果"

        persisted = _session_messages(session["id"])
        assert [(m.role, m.status) for m in persisted] == [("user", "complete"), ("assistant", "complete")]

        sent = captured["messages"]
        assert sent[0]["role"] == "system" and "导出" in sent[0]["content"]
        combined = json.dumps(sent, ensure_ascii=False)
        assert "[00:00] 绑定任务的字幕内容" in combined
        assert sent[-1] == {"role": "user", "content": "支持哪些导出格式？"}
        assert "其他任务的机密字幕" not in combined
        assert "chat-secret-key" not in combined
        assert "uploads/" not in combined
        assert "other-task" not in combined

        detail = client.get(f"/chat/sessions/{session['id']}").json()
        assert [m["role"] for m in detail["messages"]] == ["user", "assistant"]
        assert detail["title"] == "支持哪些导出格式？"


def test_streaming_error_event_keeps_partial_and_sanitizes(tmp_path: Path, monkeypatch) -> None:
    def fake(provider, messages, on_delta=None, **kwargs):
        on_delta("半截回答")
        raise llm_providers.LLMProviderError("LLM_PROVIDER_RATE_LIMITED", "LLM provider rate limit reached")

    monkeypatch.setattr(llm_providers, "chat_completion", fake)
    with _client(tmp_path) as client:
        provider = _create_provider(client)
        session = client.post("/chat/sessions", json={"provider_id": provider["id"]}).json()
        with client.stream(
            "POST", f"/chat/sessions/{session['id']}/messages", json={"content": "你好"},
        ) as response:
            events = _read_sse(response)

        assert [name for name, _ in events] == ["delta", "error"]
        error = events[-1][1]
        assert error["code"] == "LLM_PROVIDER_RATE_LIMITED"
        persisted = _session_messages(session["id"])
        assert [(m.role, m.status, m.content) for m in persisted] == [
            ("user", "complete", "你好"),
            ("assistant", "error", "半截回答"),
        ]
        assert error["message_id"] == persisted[-1].id


def test_abort_keeps_partial_reply(tmp_path: Path, monkeypatch) -> None:
    import queue as queue_module

    def fake(provider, messages, on_delta=None, **kwargs):
        for index in range(500):
            on_delta(f"段{index}")
            time.sleep(0.01)
        return "不会到达"

    monkeypatch.setattr(llm_providers, "chat_completion", fake)
    with _client(tmp_path) as client:
        provider = _create_provider(client)
        session = client.post("/chat/sessions", json={"provider_id": provider["id"]}).json()

    from backend.database import session as db_session

    db = db_session.SessionLocal()
    try:
        chat.add_message(db, session["id"], role="user", content="讲个长故事")
    finally:
        db.close()

    updates: queue_module.Queue = queue_module.Queue(maxsize=chat.STREAM_QUEUE_MAXSIZE)
    cancel = threading.Event()
    worker = threading.Thread(
        target=chat.run_reply,
        args=(session["id"], provider["id"], [{"role": "user", "content": "讲个长故事"}], updates, cancel),
        daemon=True,
    )
    worker.start()
    kind, data = updates.get(timeout=5)
    assert kind == chat.EVENT_DELTA and data["content"] == "段0"
    cancel.set()
    worker.join(timeout=5)
    assert not worker.is_alive()

    persisted = _session_messages(session["id"])
    assert len(persisted) == 2
    partial = persisted[-1]
    assert partial.status == "partial" and partial.content.startswith("段0")


def test_missing_or_unusable_provider_rejected_before_streaming(tmp_path: Path) -> None:
    with _client(tmp_path) as client:
        provider = _create_provider(client)
        no_provider = client.post("/chat/sessions", json={}).json()
        rejected = client.post(f"/chat/sessions/{no_provider['id']}/messages", json={"content": "hi"})
        assert rejected.status_code == 400
        assert rejected.json()["detail"]["code"] == "CHAT_PROVIDER_REQUIRED"

        disabled = client.post("/chat/sessions", json={"provider_id": provider["id"]}).json()
        assert client.put(f"/llm-providers/{provider['id']}", json={"enabled": False}).status_code == 200
        rejected = client.post(f"/chat/sessions/{disabled['id']}/messages", json={"content": "hi"})
        assert rejected.status_code == 400
        assert rejected.json()["detail"]["code"] == "LLM_PROVIDER_DISABLED"

        assert client.post("/chat/sessions/missing/messages", json={"content": "hi"}).status_code == 404
        assert client.post(f"/chat/sessions/{no_provider['id']}/messages", json={"content": ""}).status_code == 422
        assert _session_messages(no_provider["id"]) == []


def test_context_too_long_rejected_before_streaming(tmp_path: Path, monkeypatch) -> None:
    called = []
    monkeypatch.setattr(llm_providers, "chat_completion", lambda *a, **k: called.append(a))
    with _client(tmp_path) as client:
        _seed_task("huge-task", ["字" * (chat.MAX_CONTEXT_CHARS + 1000)])
        provider = _create_provider(client)
        session = client.post(
            "/chat/sessions", json={"task_id": "huge-task", "provider_id": provider["id"]},
        ).json()
        rejected = client.post(f"/chat/sessions/{session['id']}/messages", json={"content": "总结一下"})
        assert rejected.status_code == 400
        assert rejected.json()["detail"]["code"] == "LLM_PROVIDER_CONTEXT_TOO_LONG"
        assert not called
        persisted = _session_messages(session["id"])
        assert [(m.role, m.status) for m in persisted] == [("user", "complete")]


def test_streaming_does_not_block_event_loop(tmp_path: Path, monkeypatch) -> None:
    import asyncio

    import httpx

    entered, release = threading.Event(), threading.Event()

    def fake(provider, messages, on_delta=None, **kwargs):
        entered.set()
        assert release.wait(5)
        on_delta("好")
        return "好"

    monkeypatch.setattr(llm_providers, "chat_completion", fake)
    with _client(tmp_path) as client:
        provider = _create_provider(client)
        session = client.post("/chat/sessions", json={"provider_id": provider["id"]}).json()

        async def run():
            transport = httpx.ASGITransport(app=client.app)
            async with httpx.AsyncClient(transport=transport, base_url="http://test") as async_client:
                pending = asyncio.create_task(
                    async_client.post(f"/chat/sessions/{session['id']}/messages", json={"content": "hi"})
                )
                try:
                    assert await asyncio.to_thread(entered.wait, 3)
                    assert (await asyncio.wait_for(async_client.get("/health"), 0.5)).status_code == 200
                finally:
                    release.set()
                response = await pending
                assert response.status_code == 200
                assert "delta" in response.text and "done" in response.text

        asyncio.run(run())
