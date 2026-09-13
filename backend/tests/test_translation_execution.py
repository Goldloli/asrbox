import asyncio
import json
import os
import queue
import socket
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


@pytest.mark.parametrize('model,structured,native_format', [
    ('qwen3', True, 'json'),
    ('qwen3.8:27b-mtp-bf16', True, 'json'),
    ('qwen3.8:27b-mtp-bf16', False, None),
])
def test_ollama_translation_parameters_use_native_chat_api(setup, monkeypatch, model, structured, native_format):
    provider = setup[2]; provider.preset = 'ollama'; provider.default_model = model
    bodies = []
    def handler(request):
        assert request.url.path == '/api/chat'
        bodies.append(json.loads(request.content))
        return httpx.Response(200, json={'message': {'content': 'OK'}, 'done': True, 'done_reason': 'stop'})
    mock_transport(monkeypatch, handler)
    assert llm_providers.chat_completion(provider, [], max_response_bytes=1024, structured_translation=structured) == 'OK'
    expected = {'model': model, 'messages': [], 'stream': False, 'think': False,
                'options': {'num_ctx': 32768, 'num_predict': -1}}
    if native_format:
        expected['format'] = native_format
    assert bodies == [expected]


@pytest.mark.parametrize('mode', ['keepalive', 'slow-headers'])
def test_real_http_total_deadline_releases_connection_and_next_request(setup, mode):
    disconnected = threading.Event()
    calls = []
    class Handler(BaseHTTPRequestHandler):
        def log_message(self, *args): pass
        def peer_closed(self):
            self.connection.setblocking(False)
            try:
                if self.connection.recv(1, socket.MSG_PEEK) == b'':
                    return True
            except BlockingIOError:
                return False
            except (ConnectionResetError, ConnectionAbortedError):
                return True
            finally:
                self.connection.setblocking(True)
            return False
        def do_POST(self):
            self.rfile.read(int(self.headers['Content-Length']))
            calls.append(self.path)
            try:
                if len(calls) == 1:
                    if mode == 'slow-headers':
                        time.sleep(1)
                    self.send_response(200); self.end_headers()
                    for _ in range(80):
                        self.wfile.write(b'\n'); self.wfile.flush()
                        # Windows may keep accepting writes on an abandoned
                        # connection; peeking detects the client's close (FIN
                        # or RST) regardless of whether writes error out.
                        if self.peer_closed():
                            disconnected.set()
                            return
                        time.sleep(.03)
                else:
                    self.send_response(200); self.end_headers()
                    self.wfile.write(b'{"message":{"content":"OK"},"done":true,"done_reason":"stop"}')
            except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError):
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
        if os.name == 'nt':
            # Windows + CPython 3.13 keeps the timed-out connection referenced by
            # cancelled proactor-loop internals past asyncio.run teardown, so the
            # close is not observable within a bounded window. The timeout above
            # and the follow-up request below still prove release semantics.
            disconnected.wait(2)
        else:
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
                assert await asyncio.to_thread(entered.wait, 5)
                # Coroutine work and an independent HTTP route complete while the first request waits.
                # Budgets stay far below the 3s blocker but absorb slow shared CI runners.
                await asyncio.wait_for(asyncio.sleep(0), timeout=1)
                result = await asyncio.wait_for(client.get('/'), timeout=2)
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


def native_echo_reply(request):
    data = json.loads(json.loads(request.content)['messages'][1]['content'])
    content = {'translations': [{'segment_id': s['id'], 'text': '译 ' + s['text']} for s in data['targets']]}
    return httpx.Response(200, json={'message': {'content': json.dumps(content)}, 'done': True, 'done_reason': 'stop'})


def test_truncated_batch_splits_deterministically_and_completes(setup, monkeypatch):
    db, task, provider, source = setup
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            return httpx.Response(200, json={'done': True, 'done_reason': 'length'})
        return native_echo_reply(request)
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 2
    assert calls == [[1, 2], [1], [2]]
    assert json.loads(svc.latest_version(db, run.id).segments_json) == [
        {'segment_id': 1, 'text': '译 first text'}, {'segment_id': 2, 'text': '译 second text'}]


def test_single_segment_still_truncated_fails_run(setup, monkeypatch):
    db = setup[0]
    calls = []
    def handler(request):
        calls.append(request)
        return httpx.Response(200, json={'done': True, 'done_reason': 'length'})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    # Full batch + left single segment fail; the right half is never attempted.
    assert len(calls) == 2
    assert row.status == 'failed' and row.error_code == 'LLM_PROVIDER_TRUNCATED'
    assert svc.latest_version(db, run.id) is None


def test_cancel_between_sub_batches_stops_without_more_requests(setup, monkeypatch):
    from backend.database import session as database
    db, task, provider, source = setup
    calls = []
    def fake(provider_arg, messages, **kwargs):
        data = json.loads(messages[1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            raise llm_providers.LLMProviderError('LLM_PROVIDER_TRUNCATED', 'synthetic')
        with database.SessionLocal() as other:
            victim = other.get(TranslationRun, run.id)
            victim.status = 'cancelled'
            other.commit()
        return json.dumps({'translations': [{'segment_id': s['id'], 'text': '译 ' + s['text']} for s in data['targets']]})
    monkeypatch.setattr(llm_providers, 'chat_completion', fake)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert calls == [[1, 2], [1]]
    assert row.status == 'cancelled' and svc.latest_version(db, run.id) is None


def test_invalid_response_splits_deterministically_and_completes(setup, monkeypatch):
    db = setup[0]
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            content = json.dumps({'translations': [{'segment_id': 1, 'text': '只一段'}]})
            return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
        return native_echo_reply(request)
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 2
    assert calls == [[1, 2], [1], [2]]
    assert json.loads(svc.latest_version(db, run.id).segments_json) == [
        {'segment_id': 1, 'text': '译 first text'}, {'segment_id': 2, 'text': '译 second text'}]


def test_single_segment_invalid_response_fails_run(setup, monkeypatch):
    db = setup[0]
    calls = []
    def handler(request):
        calls.append(request)
        content = json.dumps({'translations': [{'segment_id': 1, 'text': '甲'}, {'segment_id': 1, 'text': '乙'}]})
        return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    # Full batch + left single segment fail; the right half is never attempted.
    assert len(calls) == 2
    assert row.status == 'failed' and row.error_code == 'TRANSLATION_INVALID_RESPONSE'
    assert svc.latest_version(db, run.id) is None


def test_timeout_batch_splits_deterministically_and_completes(setup, monkeypatch):
    db = setup[0]
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            raise httpx.ReadTimeout('slow local model')
        return native_echo_reply(request)
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 2
    assert calls == [[1, 2], [1], [2]]


def test_sliding_window_batch_splits_deterministically_and_completes(setup, monkeypatch):
    db = setup[0]
    calls = []
    window = '幻灯片式的连续译文窗口片段，长度超过二十五个字符以上'
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            content = json.dumps({'translations': [
                {'segment_id': s['id'], 'text': f'第{s["id"]}段 {window} 后缀'} for s in data['targets']]})
            return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
        return native_echo_reply(request)
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 2
    assert calls == [[1, 2], [1], [2]]
    assert json.loads(svc.latest_version(db, run.id).segments_json) == [
        {'segment_id': 1, 'text': '译 first text'}, {'segment_id': 2, 'text': '译 second text'}]


def test_bloated_batch_splits_deterministically_and_completes(setup, monkeypatch):
    db = setup[0]
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        if len(data['targets']) > 1:
            content = json.dumps({'translations': [
                {'segment_id': s['id'], 'text': f'第{s["id"]}段独特内容' * 30} for s in data['targets']]})
            return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
        return native_echo_reply(request)
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 2
    assert calls == [[1, 2], [1], [2]]


def test_single_segment_bloat_is_accepted_without_split(setup, monkeypatch):
    db, task, provider, source = setup
    source.segments_json = json.dumps([{'id': 1, 'start': 0, 'end': 2, 'text': 'first text'}])
    db.commit()
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        content = json.dumps({'translations': [{'segment_id': 1, 'text': '逐段详尽的完整译文段落' * 20}]})
        return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    row = db.get(TranslationRun, run.id)
    assert row.status == 'completed' and row.completed_segments == 1
    assert calls == [[1]]
    assert json.loads(svc.latest_version(db, run.id).segments_json) == [
        {'segment_id': 1, 'text': '逐段详尽的完整译文段落' * 20}]


def test_repeated_source_lines_do_not_trigger_overlap_split(setup, monkeypatch):
    db, task, provider, source = setup
    line = 'We will never forget what happened here on that morning.'
    source.segments_json = json.dumps([
        {'id': 1, 'start': 0, 'end': 2, 'text': line},
        {'id': 2, 'start': 2, 'end': 4, 'text': line}])
    db.commit()
    calls = []
    def handler(request):
        data = json.loads(json.loads(request.content)['messages'][1]['content'])
        calls.append([s['id'] for s in data['targets']])
        content = json.dumps({'translations': [
            {'segment_id': s['id'], 'text': '我们永远永远不会忘记那个早晨在这里所发生的一切事情。'} for s in data['targets']]})
        return httpx.Response(200, json={'message': {'content': content}, 'done': True, 'done_reason': 'stop'})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'completed'
    assert calls == [[1, 2]]


def test_create_run_uses_local_batch_limits_for_ollama_only(setup, monkeypatch):
    db, task, provider, source = setup
    source.segments_json = json.dumps([
        {'id': i, 'start': i * 2, 'end': i * 2 + 2, 'text': 'x' * 50} for i in range(1, 41)])
    db.commit()
    run = create(setup)
    shapes = [json.loads(row.target_ids_json) for row in
              db.query(svc.TranslationBatch).filter_by(run_id=run.id).order_by(svc.TranslationBatch.batch_index)]
    assert [len(batch) for batch in shapes] == [16, 16, 8]

    db.get(TranslationRun, run.id).status = 'failed'
    provider.preset = 'deepseek'
    provider.default_model = 'deepseek-chat'
    provider.api_key_secret = 'synthetic-key'
    db.commit()
    run = create(setup)
    assert db.query(svc.TranslationBatch).filter_by(run_id=run.id).count() == 1


def test_translate_batch_timeout_is_provider_protocol_scoped(setup, monkeypatch):
    from backend.database import session as database
    db, task, provider, source = setup
    timeouts = []
    def fake(provider_arg, messages, **kwargs):
        timeouts.append(kwargs.get('timeout'))
        data = json.loads(messages[1]['content'])
        return json.dumps({'translations': [{'segment_id': s['id'], 'text': '译 ' + s['text']} for s in data['targets']]})
    monkeypatch.setattr(llm_providers, 'chat_completion', fake)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    assert timeouts == [svc.LOCAL_REQUEST_TIMEOUT]

    with database.SessionLocal() as other:
        remote = other.get(type(provider), provider.id)
        remote.preset = 'deepseek'
        remote.default_model = 'deepseek-chat'
        remote.api_key_secret = 'synthetic-key'
        other.commit()
    timeouts.clear()
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    assert timeouts == [svc.REMOTE_REQUEST_TIMEOUT]


def test_ollama_translation_sends_schema_and_validates_complete_result(setup, monkeypatch):
    import jsonschema
    db, task, provider, source = setup
    expected = [{'segment_id': 1, 'text': 'Bonjour'}, {'segment_id': 2, 'text': 'Salut'}]
    def handler(request):
        assert request.url.path == '/api/chat'
        body = json.loads(request.content)
        assert body['think'] is False
        assert body['options'] == {'num_ctx': 32768, 'num_predict': -1}
        schema = body['format']
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
        return httpx.Response(200, json={'message': {'content': json.dumps({'translations': expected})}, 'done': True, 'done_reason': 'stop'})
    mock_transport(monkeypatch, handler)
    run = create(setup)
    svc.execute_run(run.id, run.attempt)
    db.expire_all()
    assert db.get(TranslationRun, run.id).status == 'completed'
    assert json.loads(svc.latest_version(db, run.id).segments_json) == expected
