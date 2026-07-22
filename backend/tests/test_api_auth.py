from __future__ import annotations

from pathlib import Path

from fastapi.testclient import TestClient


def make_protected_client(tmp_path: Path, monkeypatch) -> TestClient:
    monkeypatch.setenv("ASRBOX_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ASRBOX_API_TOKEN", "test-loopback-token")
    from backend.app import create_app

    return TestClient(create_app())


def test_configured_api_token_protects_private_routes(tmp_path: Path, monkeypatch) -> None:
    client = make_protected_client(tmp_path, monkeypatch)

    missing = client.get("/tasks")
    wrong = client.get("/tasks", headers={"Authorization": "Bearer wrong-token"})
    accepted = client.get("/tasks", headers={"Authorization": "Bearer test-loopback-token"})

    assert missing.status_code == 401
    assert wrong.status_code == 401
    assert accepted.status_code == 200


def test_health_remains_public_when_api_token_is_configured(tmp_path: Path, monkeypatch) -> None:
    client = make_protected_client(tmp_path, monkeypatch)

    response = client.get("/health")

    assert response.status_code == 200
    assert response.json()["status"] == "healthy"


def test_api_info_remains_public_when_api_token_is_configured(tmp_path: Path, monkeypatch) -> None:
    client = make_protected_client(tmp_path, monkeypatch)

    response = client.get("/api-info")

    assert response.status_code == 200
    assert response.json()["message"] == "ASRbox API"


def test_api_token_query_parameter_supports_browser_managed_resources(tmp_path: Path, monkeypatch) -> None:
    client = make_protected_client(tmp_path, monkeypatch)

    response = client.get("/tasks?api_token=test-loopback-token")

    assert response.status_code == 200


def test_packaged_frontend_is_public_but_api_stays_protected(tmp_path: Path, monkeypatch) -> None:
    frontend_dir = tmp_path / "frontend"
    assets_dir = frontend_dir / "assets"
    assets_dir.mkdir(parents=True)
    (frontend_dir / "index.html").write_text("<html><title>ASRbox container</title></html>", encoding="utf-8")
    (assets_dir / "app.js").write_text("console.log('asrbox')", encoding="utf-8")
    monkeypatch.setenv("ASRBOX_FRONTEND_DIR", str(frontend_dir))
    client = make_protected_client(tmp_path / "data", monkeypatch)

    root = client.get("/")
    deep_link = client.get("/settings", headers={"Accept": "text/html"})
    asset = client.get("/assets/app.js")
    protected_api = client.get("/tasks")

    assert root.status_code == 200
    assert "ASRbox container" in root.text
    assert deep_link.status_code == 200
    assert "ASRbox container" in deep_link.text
    assert asset.status_code == 200
    assert protected_api.status_code == 401
