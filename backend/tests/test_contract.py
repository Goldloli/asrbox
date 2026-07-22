from __future__ import annotations

import os
from pathlib import Path

from fastapi.testclient import TestClient


def make_client(tmp_path: Path) -> TestClient:
    os.environ["ASRBOX_DATA_DIR"] = str(tmp_path)
    from backend.app import create_app

    return TestClient(create_app())


def _registered_routes(app) -> set[tuple[str, str]]:
    routes: set[tuple[str, str]] = set()

    def visit(items) -> None:
        for route in items:
            path = getattr(route, "path", None)
            methods = getattr(route, "methods", None)
            if path and methods:
                routes.update((method, path) for method in methods)
            nested = getattr(route, "routes", None)
            if nested:
                visit(nested)
            original_router = getattr(route, "original_router", None)
            if original_router is not None:
                visit(original_router.routes)

    visit(app.routes)
    return routes


def test_api_freeze_routes_are_registered(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    routes = _registered_routes(client.app)

    expected = {
        ("GET", "/transcriptions/readiness"),
        ("POST", "/transcriptions/preflight"),
        ("GET", "/models/status"),
        ("GET", "/models/active-downloads"),
        ("GET", "/models/storage"),
        ("GET", "/tasks"),
        ("GET", "/tasks/active"),
        ("GET", "/tasks/{task_id}"),
        ("GET", "/tasks/{task_id}/diagnostics"),
        ("GET", "/tasks/{task_id}/logs"),
        ("GET", "/tasks/{task_id}/versions"),
        ("GET", "/llm-providers/presets"),
        ("GET", "/llm-providers"),
        ("POST", "/llm-providers"),
        ("PUT", "/llm-providers/{provider_id}"),
        ("DELETE", "/llm-providers/{provider_id}"),
        ("POST", "/llm-providers/{provider_id}/test"),
        ("POST", "/tasks/{task_id}/proofreading-runs"),
        ("GET", "/tasks/{task_id}/proofreading-runs"),
        ("GET", "/tasks/{task_id}/proofreading-runs/{run_id}"),
        ("POST", "/tasks/{task_id}/proofreading-runs/{run_id}/apply"),
        ("GET", "/runtime/status"),
        ("GET", "/events"),
        ("POST", "/transcriptions"),
        ("POST", "/transcriptions/batch"),
        ("POST", "/models/download"),
        ("POST", "/models/{model_name}/unload"),
        ("POST", "/models/{model_name}/cancel-download"),
        ("DELETE", "/models/{model_name}"),
        ("POST", "/tasks/{task_id}/cancel"),
        ("POST", "/tasks/{task_id}/retry"),
        ("POST", "/tasks/{task_id}/retranscribe"),
        ("POST", "/tasks/{task_id}/postprocess"),
        ("POST", "/tasks/{task_id}/chunks/retry-failed"),
        ("POST", "/tasks/{task_id}/cleanup-artifacts"),
    }
    assert expected <= routes


def test_llm_proofreading_openapi_contract_is_typed_and_masked(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    schemas = client.app.openapi()["components"]["schemas"]

    provider_fields = schemas["LLMProviderResponse"]["properties"]
    assert {
        "id",
        "name",
        "preset",
        "base_url",
        "api_key_masked",
        "default_model",
        "enabled",
        "is_local",
        "created_at",
        "updated_at",
    } <= provider_fields.keys()
    assert "api_key" not in provider_fields

    run_fields = schemas["ProofreadingRunResponse"]["properties"]
    assert {
        "id",
        "task_id",
        "source_version_id",
        "provider_name",
        "provider_preset",
        "model_name",
        "status",
        "total_batches",
        "completed_batches",
        "error_code",
        "error",
        "stale",
        "suggestions",
        "created_at",
        "updated_at",
        "completed_at",
        "applied_at",
    } <= run_fields.keys()

    suggestion_fields = schemas["ProofreadingSuggestionResponse"]["properties"]
    assert set(suggestion_fields) == {
        "id",
        "segment_id",
        "original_text",
        "suggested_text",
        "reason",
        "resolution",
    }


def test_model_status_contract_fields_are_stable(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    response = client.get("/models/status")
    assert response.status_code == 200
    model = response.json()["models"][0]
    for key in [
        "downloaded",
        "compatible",
        "download_error",
        "cache_detected",
        "size_on_disk_mb",
        "loaded",
        "preferred_source",
        "source_candidates",
        "installed_source",
        "installed_repo_id",
        "last_verified_at",
    ]:
        assert key in model


def test_readiness_and_active_tasks_contract_fields_are_stable(tmp_path: Path) -> None:
    client = make_client(tmp_path)

    readiness = client.get("/transcriptions/readiness")
    assert readiness.status_code == 200
    body = readiness.json()
    assert {"backend", "ready", "message", "checks"} <= body.keys()
    assert all({"key", "status", "message", "action"} <= check.keys() for check in body["checks"])

    active = client.get("/tasks/active")
    assert active.status_code == 200
    active_body = active.json()
    assert {
        "downloads",
        "queued_tasks",
        "running_tasks",
        "orphan_tasks",
        "failed_resumable_tasks",
        "running_chunks",
        "worker_state",
        "cancelled_task_ids",
        "recent_error",
    } <= active_body.keys()


def test_stable_event_types_match_api_freeze() -> None:
    from backend.utils.events import STABLE_EVENT_TYPES

    assert STABLE_EVENT_TYPES == {
        "task.updated",
        "task.failed",
        "task.completed",
        "chunk.updated",
        "model.download.updated",
        "runtime.warning",
        "storage.warning",
    }
