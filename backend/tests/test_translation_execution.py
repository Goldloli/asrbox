import asyncio
import json
import queue
import threading
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import httpx
import pytest

from backend.app import create_app
from backend.database.models import TranslationRun, TranslationVersion
from backend.services import translation as svc, llm_providers, llm_compatibility
from backend.tests.test_translation_service import setup, create, complete


class TrackedBody(httpx.AsyncByteStream):
    def __init__(self, body):
        self.body, self.closed = body, False

    async def __aiter__(self):
        yield self.body

    async def aclose(self):
        self.closed = True


def mock_transport(monkeypatch, handler):
    client = httpx.AsyncClient
    def factory(**kwargs):
        assert kwargs["follow_redirects"] is False
        return client(transport=httpx.MockTransport(handler), **kwargs)
    monkeypatch.setattr(llm_compatibility.httpx, 'AsyncClient', factory)


@pytest.mark.parametrize('status,payload,code', [
    (401, {}, 'LLM_PROVIDER_AUTH_FAILED'), (429, {}, 'LLM_PROVIDER_RATE_LIMITED'),
    (400, {'error': {'code': 'context_length_exceeded'}}, 'LLM_PROVIDER_CONTEXT_TOO_LONG'),
    (503, {}, 'LLM_PROVIDER_HTTP_ERROR'), (200, {'choices': []}, 'LLM_PROVIDER_INVALID_RESPONSE'),
])
def test_bounded_transport_retains_error_classification(setup, monkeypatch, status, payload, code):
    body = TrackedBody(json.dumps(payload).encode())
    mock_transport(monkeypatch, lambda request: httpx.Response(status, stream=body))
    with pytest.raises(llm_providers.LLMProviderError) as caught:
        llm_providers.chat_completion(setup[2], [], max_response_bytes=1024)
    assert caught.value.code == code
    assert body.closed


def test_bounded_transport_limits_bytes_and_keeps_default_compatible(setup, monkeypatch):
    body = TrackedBody(b'x' * 1025)
    def large(request):
        assert request.extensions['timeout']['read'] == 90
        assert json.loads(request.content)['stream'] is False
        return httpx.Response(200, stream=body)
    mock_transport(monkeypatch, large)
    with pytest.raises(llm_providers.LLMProviderError) as caught:
        llm_providers.chat_completion(setup[2], [], timeout=90, max_response_bytes=1024)
    assert caught.value.code == 'LLM_PROVIDER_RESPONSE_TOO_LARGE'
    assert body.closed
    monkeypatch.undo()
    def ordinary(request):
        body = json.loads(request.content)
        assert body['stream'] is False
        assert 'thinking' not in body and 'response_format' not in body
        return httpx.Response(200, json={'choices': [{'message': {'content': 'OK'}}]})
    mock_transport(monkeypatch, ordinary)
    setup[2].preset = 'deepseek'; setup[2].api_key_secret = 'synthetic-key'
    assert llm_providers.chat_completion(setup[2], []) == 'OK'


@pytest.mark.parametrize('exception,code', [
    (httpx.ReadTimeout, 'LLM_PROVIDER_TIMEOUT'), (httpx.ConnectTimeout, 'LLM_PROVIDER_TIMEOUT'),
    (httpx.ConnectError, 'LLM_PROVIDER_UNAVAILABLE'), (httpx.RemoteProtocolError, 'LLM_PROVIDER_UNAVAILABLE'),
])
def test_timeout_is_sanitized(setup, monkeypatch, exception, code):
    def unavailable(request): raise exception('private endpoint and secret')
    mock_transport(monkeypatch, unavailable)
    with pytest.raises(llm_providers.LLMProviderError) as caught:
        llm_providers.chat_completion(setup[2], [], timeout=90, max_response_bytes=1024)
    assert caught.value.code == code
    assert 'private' not in str(caught.value)


@pytest.mark.parametrize('preset,model,structured,expected', [
    ('deepseek', 'deepseek-v4-flash', True, {'response_format': {'type': 'json_object'}, 'thinking': {'type': 'disabled'}}),
    ('deepseek', 'deepseek-v4-pro', True, {'response_format': {'type': 'json_object'}, 'thinking': {'type': 'disabled'}}),
    ('deepseek', 'deepseek-chat', True, {'response_format': {'type': 'json_object'}}),
    ('deepseek', 'deepseek-v4-flash', False, {'thinking': {'type': 'disabled'}}),
    ('custom', 'deepseek-v4-flash', True, {}),
    ('ollama', 'qwen3', True, {'response_format': {'type': 'json_object'}, 'reasoning_effort': 'none'}),
    ('ollama', 'qwen3.8:27b-mtp-bf16', True, {'response_format': {'type': 'json_object'}, 'reasoning_effort': 'none'}),
    ('ollama', 'qwen3.8:27b-mtp-bf16', False, {'reasoning_effort': 'none'}),
    ('custom', 'qwen3.8:27b-mtp-bf16', True, {}),
])
def test_translation_parameters_are_provider_scoped(setup, monkeypatch, preset, model, structured, expected):
    provider = setup[2]; provider.preset = preset; provider.default_model = model
    provider.api_key_secret = 'synthetic-key'
    bodies = []
    def handler(request):
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={'choices': [{'message': {'content': 'OK'}}]})
    mock_transport(monkeypatch, handler)
    assert llm_providers.chat_completion(provider, [], max_response_bytes=1024, structured_translation=structured) == 'OK'
    assert bodies == [{'model': model, 'messages': [], 'stream': False, **expected}]


@pytest.mark.parametrize('mode', ['keepalive', 'slow-headers'])
def test_real_http_total_deadline_releases_connection_and_next_request(setup, mode):
    disconnected = threading.Event()
    calls = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def do_POST(self):
            self.rfile.read(int(self.headers['Content-Length']))
            calls.append(self.path)
            try:
                if len(calls) == 1:
                    if mode == 'slow-headers':
                        time.sleep(1)
                    self.send_response(200); self.end_headers()
                    for _ in range(80):
                        self.wfile.write(b'\n'); self.wfile.flush(); time.sleep(.03)
                else:
                    self.send_response(200); self.end_headers()
                    self.wfile.write(b'{"choices":[{"message":{"content":"OK"}}]}')
            except (BrokenPipeError, ConnectionResetError):
                disconnected.set()
    server = ThreadingHTTPServer(('127.0.0.1', 0), Handler)
    worker = threading.Thread(target=server.serve_forever, daemon=True); worker.start()
    provider = setup[2]; provider.base_url = f'http://127.0.0.1:{server.server_port}/v1'
    try:
        started = time.monotonic()
        with pytest.raises(llm_providers.LLMProviderError) as caught:
            llm_providers.chat_completion(provider, [], timeout=.35, max_response_bytes=1024)
        assert caught.value.code == 'LLM_PROVIDER_TIMEOUT'
        assert time.monotonic() - started < .9
        assert disconnected.wait(2)
        assert llm_providers.chat_completion(provider, [], timeout=1, max_response_bytes=1024) == 'OK'
        assert len(calls) == 2
    finally:
        server.shutdown(); server.server_close(); worker.join(timeout=2)


@pytest.mark.parametrize('route_kind', ['create', 'export'])
def test_slow_routes_leave_event_loop_responsive(setup, monkeypatch, route_kind):
    from backend.routes import translation as routes
    db, task, provider, source = setup
    entered, release = threading.Event(), threading.Event()
    if route_kind == 'create':
        def slow(*args):
            entered.set(); assert release.wait(3)
            svc.fail('TRANSLATION_SOURCE_INVALID', 'Synthetic test')
        monkeypatch.setattr(svc, 'create_run', slow)
    else:
        def slow(*args):
            entered.set(); assert release.wait(3)
            return 'translated', 'text/plain', 'translation.txt'
        monkeypatch.setattr(routes, 'export_version', slow)
    async def check():
        async with httpx.AsyncClient(transport=httpx.ASGITransport(app=create_app()), base_url='http://test') as client:
            if route_kind == 'create':
                pending = asyncio.create_task(client.post(f'/tasks/{task.id}/translation-runs', json={
                    'provider_id': provider.id, 'source_version_id': source.id,
                    'source_language': {'kind': 'auto'}, 'target_language': {'kind': 'preset', 'code': 'fr'}}))
            else:
                pending = asyncio.create_task(client.get(f'/tasks/{task.id}/translation-runs/run/versions/1/export/txt'))
            try:
                assert await asyncio.to_thread(entered.wait, 1)
                # Coroutine work and an independent HTTP route complete while the first request waits.
                await asyncio.wait_for(asyncio.sleep(0), timeout=.3)
                result = await asyncio.wait_for(client.get('/'), timeout=.5)
                assert result.status_code == 200 and not pending.done()
            finally:
                release.set()
            result = await pending
            assert result.status_code == (400 if route_kind == 'create' else 200)
    asyncio.run(check())


def test_provider_configuration_is_rechecked_after_queueing(setup, monkeypatch):
    run = create(setup)
    setup[2].base_url = 'http://localhost:11435/v1'; setup[0].commit()
    monkeypatch.setattr(llm_providers, 'chat_completion', lambda *a, **k: pytest.fail('changed endpoint used'))
    svc.execute_run(run.id, run.attempt); setup[0].expire_all()
    row = setup[0].get(TranslationRun, run.id)
    assert row.status == 'failed' and row.error_code == 'TRANSLATION_PROVIDER_CHANGED'


def test_edit_failure_rolls_back_complete_snapshot(setup, monkeypatch):
    from backend.models import TranslationEditRequest
    db, task, provider, source = setup
    run = complete(setup, monkeypatch)
    vid = svc.latest_version(db, run.id).id
    def broken(): raise RuntimeError('write failed')
    with monkeypatch.context() as local:
        local.setattr(db, 'commit', broken)
        with pytest.raises(RuntimeError):
            svc.edit_version(db, task.id, run.id, TranslationEditRequest(base_version_id=vid,
                segments=[{'id': 1, 'text': 'new'}, {'id': 2, 'text': 'next'}]))
    # The service must leave the caller's session reusable, without a staged partial version.
    db.commit()
    assert db.query(TranslationVersion).count() == 1


def test_worker_exit_replaces_worker_and_runs_next_job(monkeypatch):
    work = queue.Queue()
    work.put(('first', 1)); work.put(('second', 1))
    done = threading.Event()
    seen = []
    def execute(run_id, attempt):
        seen.append(run_id)
        if run_id == 'first': raise SystemExit()
        done.set()
    # A test queue exits after the second job so no daemon retains patched process globals.
    class FiniteQueue:
        def get(self):
            if work.empty(): raise SystemExit()
            return work.get()
        def task_done(self): work.task_done()
        def empty(self): return work.empty()
    monkeypatch.setattr(svc, '_work', FiniteQueue())
    monkeypatch.setattr(svc, '_worker', None)
    monkeypatch.setattr(svc, 'execute_run', execute)
    # Suppress only the synthetic thread exit traceback; assertions still check actual replacement.
    monkeypatch.setattr(threading, 'excepthook', lambda args: None)
    svc._ensure_worker()
    assert done.wait(3)
    work.join()
    with svc._worker_lock:
        worker = svc._worker
    if worker: worker.join(timeout=3)
    assert seen == ['first', 'second']


def test_ollama_translation_sends_schema_and_validates_complete_result(setup, monkeypatch):
    import jsonschema
    db, task, provider, source = setup
    expected = [{'segment_id': 1, 'text': 'Bonjour'}, {'segment_id': 2, 'text': 'Salut'}]
    def handler(request):
        body = json.loads(request.content)
        assert body['reasoning_effort'] == 'none'
        format = body['response_format']
        assert format['type'] == 'json_schema' and format['json_schema']['strict']
        schema = format['json_schema']['schema']
        jsonschema.validate({'translations': expected}, schema)
        invalid = [
            {'translations': expected[:1]},
            {'translations': expected + [expected[0]]},
            {'translations': [{'segment_id_id': 1, 'text': 'bad'}, expected[1]]},
            {'translations': [{'segment_id': 99, 'text': 'bad'}, expected[1]]},
            {'translations': [{'segment_id': 1, 'text': ''}, expected[1]]},
        ]
        for value in invalid:
            with pytest.raises(jsonschema.ValidationError): jsonschema.validate(value, schema)
        return httpx.Response(200, json={'choices': [{'message': {'content': json.dumps({'translations': expected})}}]})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'completed'
    assert json.loads(svc.latest_version(db, run.id).segments_json) == expected
