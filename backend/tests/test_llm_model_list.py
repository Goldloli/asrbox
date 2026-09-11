from __future__ import annotations

import os
from pathlib import Path

import httpx
from fastapi.testclient import TestClient

from backend.services import llm_compatibility


def _client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.app import create_app

    return TestClient(create_app())


def _mock_transport(monkeypatch, handler):
    """Patch the shared httpx.AsyncClient used by the bounded transport.

    注意：必须在 create_app 之后调用——fastmcp 在首次建 app 时按 httpx.AsyncClient
    做子类化，patch 激活时导入会污染进程内 fastmcp（/mcp 回退路由泄漏）。
    """
    client = httpx.AsyncClient

    def factory(**kwargs):
        assert kwargs["follow_redirects"] is False
        return client(transport=httpx.MockTransport(handler), **kwargs)

    monkeypatch.setattr(llm_compatibility.httpx, "AsyncClient", factory)


def test_fetch_models_lists_openai_ids_without_echoing_key(tmp_path: Path, monkeypatch) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"data": [{"id": "deepseek-chat"}, {"id": "deepseek-reasoner"}, {"id": "deepseek-chat"}, {"id": ""}, "junk"]})

    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, handler)
        response = client.post(
            "/llm-providers/models",
            json={"preset": "deepseek", "base_url": "https://api.deepseek.com", "api_key": "sk-test-secret"},
        )
    assert response.status_code == 200
    body = response.json()
    assert body["ok"] is True
    assert body["items"] == ["deepseek-chat", "deepseek-reasoner"], "去重保序、丢弃非法条目"
    assert body["error_code"] is None
    assert "sk-test-secret" not in response.text, "API key 不得出现在响应中"
    assert seen[0].url.path == "/models"
    assert seen[0].headers["Authorization"] == "Bearer sk-test-secret"


def test_fetch_models_classifies_auth_failure(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, lambda request: httpx.Response(401, json={"error": "bad key"}))
        response = client.post(
            "/llm-providers/models",
            json={"preset": "deepseek", "base_url": "https://api.deepseek.com", "api_key": "bad"},
        )
    body = response.json()
    assert body["ok"] is False
    assert body["items"] == []
    assert body["error_code"] == "LLM_PROVIDER_AUTH_FAILED"


def test_fetch_models_ollama_falls_back_to_native_tags(tmp_path: Path, monkeypatch) -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        if request.url.path == "/v1/models":
            return httpx.Response(404, json={"error": "not found"})
        if request.url.path == "/api/tags":
            return httpx.Response(200, json={"models": [{"name": "qwen3:8b"}, {"name": "llama3.1:latest"}]})
        return httpx.Response(500)

    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, handler)
        response = client.post(
            "/llm-providers/models",
            json={"preset": "ollama", "base_url": "http://localhost:11434/v1"},
        )
    body = response.json()
    assert body["ok"] is True
    assert body["items"] == ["qwen3:8b", "llama3.1:latest"]
    assert paths == ["/v1/models", "/api/tags"], "先 OpenAI 列表，失败后回退原生接口且去掉 /v1"


def test_fetch_models_non_ollama_does_not_fallback(tmp_path: Path, monkeypatch) -> None:
    paths: list[str] = []

    def handler(request: httpx.Request) -> httpx.Response:
        paths.append(request.url.path)
        return httpx.Response(404)

    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, handler)
        response = client.post(
            "/llm-providers/models",
            json={"preset": "custom", "base_url": "http://localhost:9000/v1"},
        )
    body = response.json()
    assert body["ok"] is False
    assert body["error_code"] == "LLM_PROVIDER_HTTP_ERROR"
    assert paths == ["/v1/models"], "非 ollama 预设不得回退 /api/tags"


def test_fetch_models_reuses_saved_key_for_existing_provider(tmp_path: Path, monkeypatch) -> None:
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, json={"data": [{"id": "deepseek-chat"}]})

    with _client(tmp_path) as client:
        created = client.post(
            "/llm-providers",
            json={
                "name": "DeepSeek",
                "preset": "deepseek",
                "base_url": "https://api.deepseek.com",
                "default_model": "deepseek-chat",
                "api_key": "stored-secret-key",
            },
        )
        assert created.status_code == 200
        provider_id = created.json()["id"]
        _mock_transport(monkeypatch, handler)
        response = client.post(
            "/llm-providers/models",
            json={"preset": "deepseek", "base_url": "https://api.deepseek.com", "provider_id": provider_id},
        )
    body = response.json()
    assert body["ok"] is True
    assert seen[0].headers["Authorization"] == "Bearer stored-secret-key", "编辑场景留空 key 时复用已保存凭据"
    assert "stored-secret-key" not in response.text


def test_fetch_models_rejects_insecure_remote_http(tmp_path: Path, monkeypatch) -> None:
    called: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        called.append(request)
        return httpx.Response(200)

    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, handler)
        response = client.post(
            "/llm-providers/models",
            json={"preset": "custom", "base_url": "http://api.example.com/v1", "api_key": "sk-x"},
        )
    body = response.json()
    assert body["ok"] is False
    assert body["error_code"] == "LLM_PROVIDER_INVALID"
    assert not called, "不安全 endpoint 必须在发起请求前被拒绝"


def test_fetch_models_invalid_json_classified(tmp_path: Path, monkeypatch) -> None:
    with _client(tmp_path) as client:
        _mock_transport(monkeypatch, lambda request: httpx.Response(200, content=b"<html>not json</html>"))
        response = client.post(
            "/llm-providers/models",
            json={"preset": "ollama", "base_url": "http://localhost:11434/v1"},
        )
    body = response.json()
    assert body["ok"] is False
    assert body["error_code"] == "LLM_PROVIDER_INVALID_RESPONSE"


def test_fetch_models_unknown_provider_id(tmp_path: Path) -> None:
    with _client(tmp_path) as client:
        response = client.post(
            "/llm-providers/models",
            json={"preset": "ollama", "base_url": "http://localhost:11434/v1", "provider_id": "missing"},
        )
    body = response.json()
    assert body["ok"] is False
    assert body["error_code"] == "LLM_PROVIDER_NOT_FOUND"
