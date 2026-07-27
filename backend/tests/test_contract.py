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
        ("GET", "/"),
        ("GET", "/api-info"),
        ("POST", "/auth/resource-ticket"),
        ("GET", "/batches/{batch_id}"),
        ("GET", "/batches/{batch_id}/export.zip"),
        ("POST", "/batches/{batch_id}/retry-failed"),
        ("GET", "/diagnostics/error-codes"),
        ("GET", "/events"),
        ("GET", "/health"),
        ("GET", "/health/filesystem"),
        ("GET", "/llm-providers"),
        ("POST", "/llm-providers"),
        ("GET", "/llm-providers/presets"),
        ("DELETE", "/llm-providers/{provider_id}"),
        ("PUT", "/llm-providers/{provider_id}"),
        ("POST", "/llm-providers/{provider_id}/test"),
        ("GET", "/models/active-downloads"),
        ("GET", "/models/benchmark"),
        ("POST", "/models/benchmark"),
        ("DELETE", "/models/benchmark/{benchmark_id}"),
        ("GET", "/models/cache-dir"),
        ("POST", "/models/cleanup-incomplete"),
        ("POST", "/models/download"),
        ("POST", "/models/migrate"),
        ("GET", "/models/migrate/progress"),
        ("GET", "/models/progress/{model_name}"),
        ("POST", "/models/recommend"),
        ("GET", "/models/status"),
        ("GET", "/models/storage"),
        ("POST", "/models/storage/plan"),
        ("GET", "/models/storage/relocation"),
        ("POST", "/models/storage/relocation"),
        ("POST", "/models/storage/relocation/cancel"),
        ("POST", "/models/verify"),
        ("DELETE", "/models/{model_name}"),
        ("POST", "/models/{model_name}/cancel-download"),
        ("GET", "/models/{model_name}/compatibility"),
        ("POST", "/models/{model_name}/pause-download"),
        ("POST", "/models/{model_name}/redownload"),
        ("POST", "/models/{model_name}/resume-download"),
        ("POST", "/models/{model_name}/retry-download"),
        ("POST", "/models/{model_name}/stop-download"),
        ("POST", "/models/{model_name}/unload"),
        ("GET", "/providers"),
        ("POST", "/providers"),
        ("DELETE", "/providers/{provider_id}"),
        ("PUT", "/providers/{provider_id}"),
        ("GET", "/providers/{provider_id}/models"),
        ("POST", "/providers/{provider_id}/test"),
        ("POST", "/providers/{provider_id}/test-transcription"),
        ("GET", "/runtime/diagnostic-bundle.zip"),
        ("GET", "/runtime/health-report"),
        ("GET", "/runtime/status"),
        ("GET", "/settings/asr"),
        ("PUT", "/settings/asr"),
        ("GET", "/settings/media-storage"),
        ("PUT", "/settings/media-storage"),
        ("POST", "/shutdown"),
        ("POST", "/storage/backup"),
        ("POST", "/storage/cleanup"),
        ("POST", "/storage/cleanup/dry-run"),
        ("POST", "/storage/restore"),
        ("GET", "/storage/usage"),
        ("DELETE", "/tasks"),
        ("GET", "/tasks"),
        ("GET", "/tasks/active"),
        ("DELETE", "/tasks/{task_id}"),
        ("GET", "/tasks/{task_id}"),
        ("GET", "/tasks/{task_id}/audio"),
        ("POST", "/tasks/{task_id}/cancel"),
        ("GET", "/tasks/{task_id}/chunks"),
        ("POST", "/tasks/{task_id}/chunks/retry-failed"),
        ("POST", "/tasks/{task_id}/chunks/{chunk_id}/retry"),
        ("POST", "/tasks/{task_id}/cleanup-artifacts"),
        ("GET", "/tasks/{task_id}/diagnostics"),
        ("GET", "/tasks/{task_id}/events"),
        ("GET", "/tasks/{task_id}/export/{fmt}"),
        ("GET", "/tasks/{task_id}/logs"),
        ("POST", "/tasks/{task_id}/postprocess"),
        ("GET", "/tasks/{task_id}/proofreading-runs"),
        ("POST", "/tasks/{task_id}/proofreading-runs"),
        ("GET", "/tasks/{task_id}/proofreading-runs/{run_id}"),
        ("POST", "/tasks/{task_id}/proofreading-runs/{run_id}/apply"),
        ("GET", "/tasks/{task_id}/quality"),
        ("POST", "/tasks/{task_id}/relink"),
        ("POST", "/tasks/{task_id}/retranscribe"),
        ("POST", "/tasks/{task_id}/retry"),
        ("POST", "/tasks/{task_id}/segments"),
        ("PUT", "/tasks/{task_id}/segments"),
        ("POST", "/tasks/{task_id}/segments/merge"),
        ("DELETE", "/tasks/{task_id}/segments/{segment_id}"),
        ("PATCH", "/tasks/{task_id}/segments/{segment_id}"),
        ("POST", "/tasks/{task_id}/segments/{segment_id}/split"),
        ("GET", "/tasks/{task_id}/versions"),
        ("GET", "/tasks/{task_id}/versions/{version_id}/export/{fmt}"),
        ("POST", "/tasks/{task_id}/versions/{version_id}/restore"),
        ("POST", "/transcriptions"),
        ("POST", "/transcriptions/batch"),
        ("POST", "/transcriptions/path"),
        ("GET", "/transcriptions/readiness"),
        ("POST", "/transcriptions/preflight"),
        ("POST", "/transcriptions/preflight/path"),
    }
    framework_routes = {
        (method, path)
        for method, path in routes
        if path in {"/openapi.json", "/docs", "/docs/oauth2-redirect", "/redoc"}
    }
    assert routes - framework_routes == expected
    assert any(getattr(route, "path", None) == "/mcp" for route in client.app.routes)


def test_resource_ticket_contract_is_typed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    schema = client.app.openapi()

    response_schema = schema["paths"]["/auth/resource-ticket"]["post"]["responses"]["200"]["content"][
        "application/json"
    ]["schema"]
    assert response_schema["$ref"].endswith("ResourceTicketResponse")
    assert set(schema["components"]["schemas"]["ResourceTicketResponse"]["properties"]) == {
        "ticket",
        "path",
        "expires_at",
    }


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
        "storage_status",
        "storage_error",
    ]:
        assert key in model
    downloaded_schema = client.app.openapi()["components"]["schemas"]["ASRModelStatus"]["properties"]["downloaded"]
    assert {item.get("type") for item in downloaded_schema["anyOf"]} == {"boolean", "null"}


def test_model_storage_contract_is_typed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    schema = client.app.openapi()
    routes = schema["paths"]
    assert routes["/models/storage"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("ModelStorageResponse")
    assert routes["/models/storage/plan"]["post"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"].endswith("ModelStorageCandidateResponse")
    assert routes["/models/storage/relocation"]["post"]["responses"]["202"]["content"]["application/json"]["schema"]["$ref"].endswith("ModelRelocationJobResponse")
    candidate_fields = schema["components"]["schemas"]["ModelStorageCandidateResponse"]["properties"]
    assert "required_headroom_bytes" in candidate_fields
    fields = schema["components"]["schemas"]["ModelStorageResponse"]["properties"]
    assert {
        "root",
        "models_dir",
        "status",
        "reason",
        "available",
        "writable",
        "cache_dirs",
        "cache_usage",
        "cache_bytes",
        "allowed_roots",
        "root_locked",
        "runtime",
        "used_bytes",
        "free_bytes",
    } <= fields.keys()


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


def test_media_ingest_storage_contract_is_typed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    schema = client.app.openapi()
    routes = schema["paths"]
    media_storage_ref = routes["/settings/media-storage"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert media_storage_ref.endswith("MediaStorageSettingsResponse")
    task_fields = schema["components"]["schemas"]["TranscriptionTaskResponse"]["properties"]
    assert "source_kind" in task_fields
    source_kind_types = {item.get("type") for item in task_fields["source_kind"].get("anyOf", [task_fields["source_kind"]])}
    assert "string" in source_kind_types
    fields = schema["components"]["schemas"]["MediaStorageSettingsResponse"]["properties"]
    assert {
        "ingest_mode",
        "uploads_dir",
        "derived_audio_dir",
        "delete_derived_on_complete",
        "uploads_dir_locked",
        "derived_audio_dir_locked",
        "uploads",
        "derived_audio",
        "runtime",
    } <= fields.keys()

    response = client.get("/settings/media-storage")
    assert response.status_code == 200
    body = response.json()
    assert body["ingest_mode"] in {"reference", "copy"}
    assert body["runtime"] in {"desktop", "container"}
