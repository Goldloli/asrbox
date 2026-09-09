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
        ("GET", "/tasks/{task_id}/translation-runs"),
        ("POST", "/tasks/{task_id}/translation-runs"),
        ("GET", "/tasks/{task_id}/translation-runs/{run_id}"),
        ("POST", "/tasks/{task_id}/translation-runs/{run_id}/cancel"),
        ("POST", "/tasks/{task_id}/translation-runs/{run_id}/retry"),
        ("GET", "/tasks/{task_id}/translation-runs/{run_id}/versions"),
        ("POST", "/tasks/{task_id}/translation-runs/{run_id}/versions"),
        ("GET", "/tasks/{task_id}/translation-runs/{run_id}/versions/{version_id}"),
        ("GET", "/tasks/{task_id}/translation-runs/{run_id}/versions/{version_id}/export/{fmt}"),
        ("GET", "/"),
        ("GET", "/api-info"),
        ("POST", "/auth/resource-ticket"),
        ("GET", "/batches/{batch_id}"),
        ("GET", "/batches/{batch_id}/export.zip"),
        ("POST", "/batches/{batch_id}/retry-failed"),
        ("GET", "/chat/sessions"),
        ("POST", "/chat/sessions"),
        ("DELETE", "/chat/sessions/{session_id}"),
        ("GET", "/chat/sessions/{session_id}"),
        ("PATCH", "/chat/sessions/{session_id}"),
        ("POST", "/chat/sessions/{session_id}/messages"),
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
        ("POST", "/llm-providers/{provider_id}/test-capabilities"),
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
        "supported_devices",
    ]:
        assert key in model
    downloaded_schema = client.app.openapi()["components"]["schemas"]["ASRModelStatus"]["properties"]["downloaded"]
    assert {item.get("type") for item in downloaded_schema["anyOf"]} == {"boolean", "null"}
    devices_schema = client.app.openapi()["components"]["schemas"]["ASRModelStatus"]["properties"]["supported_devices"]
    assert devices_schema["type"] == "array"
    assert set(devices_schema["items"]["enum"]) == {"cpu", "cuda", "mps", "mlx"}


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


def test_translation_contract_and_serialized_responses(tmp_path, monkeypatch):
    from backend.database import session as database
    from backend.services import translation, llm_providers
    from backend.tests.test_proofreading_service import _completed_task
    from backend.tests.test_translation_service import echo

    monkeypatch.setattr(translation, 'enqueue', lambda *a: None)
    monkeypatch.setattr(llm_providers, 'chat_completion', echo)
    with make_client(tmp_path) as client:
        # Seed after lifespan recovery, so active-state checks exercise the intended state.
        with database.SessionLocal() as db:
            task, provider, source = _completed_task(db)
            task_id, provider_id, source_id = task.id, provider.id, source.id
        base = f'/tasks/{task_id}/translation-runs'
        response = client.post(base, json={'provider_id': provider_id, 'source_version_id': source_id,
            'source_language': {'kind': 'auto'}, 'target_language': {'kind': 'preset', 'code': 'ar'}})
        assert response.status_code == 200, response.text
        expected = {'id', 'task_id', 'source_version_id', 'source_language', 'target_language', 'source_is_current',
            'llm_provider_id', 'provider_name', 'provider_preset', 'model_name', 'status', 'attempt', 'total_batches',
            'completed_batches', 'total_segments', 'completed_segments', 'latest_translation_version_id', 'can_retry',
            'can_edit', 'can_export', 'error_code', 'error', 'created_at', 'updated_at', 'completed_at'}
        run = response.json()
        assert set(run) == expected and run['status'] == 'queued'
        assert client.post(base, json={'provider_id': provider_id, 'source_version_id': source_id,
            'source_language': {'kind': 'auto'}, 'target_language': {'kind': 'preset', 'code': 'fr'}}).status_code == 409
        run_url = f"{base}/{run['id']}"
        assert client.get(base).json()['items'][0] == run
        translation.execute_run(run['id'], run['attempt'])
        result = client.get(run_url).json()
        assert set(result) == expected
        assert result['can_edit'] and result['can_export'] and not result['can_retry']
        assert result['completed_segments'] == result['total_segments'] == 2
        vid = result['latest_translation_version_id']
        summaries = client.get(f'{run_url}/versions').json()['items']
        assert set(summaries[0]) == {'id', 'run_id', 'revision', 'version_type', 'parent_version_id', 'created_at'}
        version = client.get(f'{run_url}/versions/{vid}').json()
        assert set(version) == set(summaries[0]) | {'source_version_id', 'source_language', 'target_language', 'segments'}
        assert set(version['segments'][0]) == {'id', 'start', 'end', 'speaker', 'source_text', 'text'}
        for fmt in ['txt', 'srt', 'vtt', 'ass', 'json', 'md']:
            download = client.get(f'{run_url}/versions/{vid}/export/{fmt}?mode=bilingual')
            assert download.status_code == 200 and 'attachment' in download.headers['content-disposition']
            assert download.headers['access-control-expose-headers'] == 'Content-Disposition'
        assert client.get(f'/tasks/foreign/translation-runs/{run["id"]}').status_code == 404
        assert client.get(f'{run_url}/versions/999').status_code == 404
        assert client.get(f'{run_url}/versions/{vid}/export/srt?mode=invalid').status_code == 400
        assert client.post(f'{run_url}/versions', json={'base_version_id': vid, 'segments': [{'id': 1, 'text': 'missing second'}]}).status_code == 400
        saved = client.post(f'{run_url}/versions', json={'base_version_id': vid, 'segments': [{'id': 1, 'text': 'bonjour'}, {'id': 2, 'text': 'salut'}]})
        assert saved.status_code == 200 and saved.json()['revision'] == 2
        assert client.post(f'{run_url}/retry').status_code == 409
        assert client.post(f'{run_url}/cancel').status_code == 409
        schemas = client.get('/openapi.json').json()
        for path, methods in schemas['paths'].items():
            if 'translation-runs' not in path or '/export/' in path:
                continue
            for operation in methods.values():
                assert '$ref' in operation['responses']['200']['content']['application/json']['schema']


def test_chat_contract_is_typed(tmp_path: Path) -> None:
    client = make_client(tmp_path)
    schema = client.app.openapi()

    message_fields = schema["components"]["schemas"]["ChatMessageResponse"]["properties"]
    assert set(message_fields) == {"id", "session_id", "role", "content", "status", "created_at"}
    assert set(message_fields["role"]["enum"]) == {"user", "assistant"}
    assert set(message_fields["status"]["enum"]) == {"complete", "partial", "error"}

    session_fields = schema["components"]["schemas"]["ChatSessionResponse"]["properties"]
    assert {
        "id",
        "task_id",
        "provider_id",
        "title",
        "messages",
        "created_at",
        "updated_at",
    } <= session_fields.keys()

    paths = schema["paths"]
    for path, operation in (
        ("/chat/sessions", "post"),
        ("/chat/sessions/{session_id}", "get"),
        ("/chat/sessions/{session_id}", "patch"),
    ):
        ref = paths[path][operation]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
        assert ref.endswith("ChatSessionResponse")
    list_ref = paths["/chat/sessions"]["get"]["responses"]["200"]["content"]["application/json"]["schema"]["$ref"]
    assert list_ref.endswith("ChatSessionListResponse")
    stream = paths["/chat/sessions/{session_id}/messages"]["post"]["responses"]["200"]
    assert "text/event-stream" in stream["content"]

    from backend.services import chat

    assert (chat.EVENT_DELTA, chat.EVENT_DONE, chat.EVENT_ERROR) == ("delta", "done", "error")


def test_llm_compatibility_contract_and_stale_recommendation(tmp_path, monkeypatch):
    from backend.tests.test_translation_execution import mock_transport
    from backend.tests.test_llm_compatibility import sample_reply
    mock_transport(monkeypatch, sample_reply)
    with make_client(tmp_path) as client:
        original = client.post('/llm-providers', json={
            'name': 'Synthetic', 'preset': 'custom', 'base_url': 'http://localhost:12345/v1',
            'default_model': 'synthetic', 'api_key': 'private-key',
        })
        assert original.status_code == 200
        row = original.json()
        assert row['compatibility'] == {'protocol': 'auto', 'thinking': 'auto', 'output_format': 'auto', 'transport': 'json'}
        path = '/llm-providers/' + row['id']
        checked = client.post(path + '/test-capabilities')
        assert checked.status_code == 200
        result = checked.json()
        assert set(result) == {'ok', 'message', 'provider_updated_at', 'requests_made', 'translation', 'proofreading', 'recommended'}
        assert result['ok'] and result['requests_made'] == 2
        assert result['translation'] == result['proofreading'] == {'ok': True, 'error_code': None}
        assert result['provider_updated_at'] == row['updated_at']
        assert result['recommended']['output_format'] == 'json_schema'
        assert 'private-key' not in checked.text and 'I have' not in checked.text
        update = {'compatibility': result['recommended'], 'expected_updated_at': result['provider_updated_at']}
        saved = client.put(path, json=update)
        assert saved.status_code == 200 and saved.json()['compatibility'] == result['recommended']
        assert client.put(path, json=update).status_code == 409
        listing = client.get('/llm-providers').json()['items'][0]
        assert listing['compatibility'] == result['recommended']
        for invalid in ({'protocol': 'unknown'}, {'headers': {'Authorization': 'override'}}, {'transport': 'other'}):
            assert client.put(path, json={'compatibility': invalid}).status_code == 422
        assert client.put(path, json={'compatibility': None}).status_code == 400
        assert client.post('/llm-providers/missing/test-capabilities').status_code == 404
        schema = client.app.openapi()
        properties = schema['components']['schemas']['LLMProviderResponse']['properties']
        assert 'compatibility' in properties
        assert 'LLMCapabilityTestResponse' in str(schema['paths'][path.replace(row['id'], '{provider_id}') + '/test-capabilities'])
